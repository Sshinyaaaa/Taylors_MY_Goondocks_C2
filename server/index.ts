// BlindOrbit API. Stores ciphertext and signed Tide policies only. It never sees a trajectory in
// plaintext and holds no key: decryption happens in the operator's browser, gated by the ORKs.
//
// Every route verifies the access token (signature against the realm key embedded in the adapter,
// issuer, expiry) AND the DPoP proof. Role checks here only decide who may WRITE which row; they
// are not what protects the data. The ORK network is.
import express, { type Request, type Response, type NextFunction } from "express";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createLocalJWKSet, jwtVerify, type JWTPayload } from "jose";
import { verifyDpop, DpopError } from "./verifyDpop.js";

const adapter = JSON.parse(readFileSync(new URL("../public/tidecloak.json", import.meta.url), "utf8"));
const ISSUER = `${String(adapter["auth-server-url"]).replace(/\/$/, "")}/realms/${adapter.realm}`;
const JWKS = createLocalJWKSet(adapter.jwk); // embedded key, never a remote JWKS fetch (I-04)

type Claims = JWTPayload & {
  cnf?: { jkt?: string };
  realm_access?: { roles?: string[] };
  preferred_username?: string;
};
type AuthedRequest = Request & { claims: Claims };

async function auth(req: Request, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization ?? "";
    const token = header.replace(/^(DPoP|Bearer)\s+/i, "");
    if (!token) return res.status(401).json({ error: "missing token" });
    const { payload } = await jwtVerify(token, JWKS, { issuer: ISSUER });
    // The browser signed htu against the origin it called (the Vite dev server), not this port.
    const url = `${req.protocol}://${req.headers.host}${req.originalUrl}`;
    await verifyDpop(
      { url, method: req.method, headers: { get: (n: string) => (req.headers[n.toLowerCase()] as string) ?? null } },
      token,
      payload as Claims,
    );
    (req as AuthedRequest).claims = payload as Claims;
    next();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(401).json({ error: e instanceof DpopError ? `DPoP: ${msg}` : `token: ${msg}` });
  }
}

const roles = (req: Request) => (req as AuthedRequest).claims.realm_access?.roles ?? [];
const who = (req: Request) => (req as AuthedRequest).claims.preferred_username ?? "?";

// --- tiny JSON store -------------------------------------------------------------------------
const DB_FILE = new URL("./db.json", import.meta.url);
type Db = {
  trajectories: Record<string, { ciphertext: string; owner: string; updatedAt: string }>;
  policies: Record<string, { policy: string; recordId: string; subject: string; access: string; signedBy: string }>;
  assessment: { result: string; deliveredTo: string; at: string } | null;
};
const empty: Db = { trajectories: {}, policies: {}, assessment: null };
const load = (): Db => (existsSync(DB_FILE) ? JSON.parse(readFileSync(DB_FILE, "utf8")) : structuredClone(empty));
const save = (db: Db) => writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

// Which operator may write which record. (Reading is enforced by the ORKs, not here.)
const RECORD_OWNER: Record<string, string> = {
  "traj-usa326": "dod-operator",
  "traj-starlink4921": "commercial-operator",
};

const app = express();
app.set("trust proxy", true);
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.get("/api/me", auth, (req, res) => res.json({ user: who(req), roles: roles(req) }));

// Ciphertext + policy metadata. Ciphertext is safe to show anyone authenticated: it is the point.
app.get("/api/state", auth, (req, res) => {
  const db = load();
  const isActor = roles(req).includes("commercial-operator");
  res.json({
    trajectories: db.trajectories,
    policies: Object.fromEntries(Object.entries(db.policies).map(([k, v]) => [k, { ...v, policy: undefined }])),
    assessment: db.assessment ? (isActor ? db.assessment : { deliveredTo: db.assessment.deliveredTo, at: db.assessment.at, result: null }) : null,
  });
});

// Signed policies. Only a tide-realm-admin can get one signed (the enclave + ORKs refuse anyone
// else), so storing is restricted to the operator who bootstraps them.
app.post("/api/policies/:name", auth, (req, res) => {
  if (!roles(req).includes("dod-operator")) return res.status(403).json({ error: "only the bootstrap admin stores policies" });
  const { policy, recordId, subject, access } = req.body ?? {};
  if (typeof policy !== "string" || !recordId || !subject) return res.status(400).json({ error: "policy, recordId, subject required" });
  const db = load();
  db.policies[req.params.name] = { policy, recordId, subject, access, signedBy: who(req) };
  save(db);
  res.json({ ok: true });
});

// Policies are handed to ANY authenticated caller on purpose: a policy only works for the subject it
// names, and the demo needs the platform admin to try one so the ORKs - not this server - refuse.
app.get("/api/policies/:name", auth, (req, res) => {
  const p = load().policies[req.params.name];
  if (!p) return res.status(404).json({ error: "no such policy" });
  res.json(p);
});

app.put("/api/trajectories/:recordId", auth, (req, res) => {
  const owner = RECORD_OWNER[req.params.recordId];
  if (!owner) return res.status(404).json({ error: "unknown record" });
  if (!roles(req).includes(owner)) return res.status(403).json({ error: `only ${owner} writes this record` });
  const { ciphertext } = req.body ?? {};
  if (typeof ciphertext !== "string") return res.status(400).json({ error: "ciphertext required" });
  const db = load();
  db.trajectories[req.params.recordId] = { ciphertext, owner, updatedAt: new Date().toISOString() };
  save(db);
  res.json({ ok: true });
});

// The manoeuvre result is produced in the browser of the operator who holds conjunction-assessor
// (only possible after the quorum approved it) and is returned only to the operator who must act.
app.post("/api/assessment", auth, (req, res) => {
  if (!roles(req).includes("conjunction-assessor")) return res.status(403).json({ error: "conjunction-assessor role required" });
  const { result } = req.body ?? {};
  const db = load();
  db.assessment = { result: String(result), deliveredTo: "commercial-operator", at: new Date().toISOString() };
  save(db);
  res.json({ ok: true });
});

app.post("/api/reset-assessment", auth, (req, res) => {
  const db = load();
  db.assessment = null;
  save(db);
  res.json({ ok: true, by: who(req) });
});

const PORT = Number(process.env.API_PORT || 4000);
app.listen(PORT, () => console.log(`BlindOrbit API on http://localhost:${PORT} (issuer ${ISSUER})`));

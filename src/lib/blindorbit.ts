// BlindOrbit's Tide wiring: record policies, encrypted trajectories, and the governed
// "conjunction-assessor" grant that needs a quorum of operators to approve.
//
// Nothing here decides access. The ORK network decides decryption (RelationshipAttestation:1) and
// TideCloak's IGA quorum decides whether the conjunction-assessor role is granted.
import tcConfig from "../../public/tidecloak.json";
import { signRelationshipPolicy, encryptForRecord, decryptForRecord, type RelationshipSubject } from "./tide/relationship";

export type SecureFetch = (url: string, init?: RequestInit) => Promise<Response>;
export type ApproveTideRequests = (reqs: { id: string; request: Uint8Array }[]) => Promise<
  { id: string; approved?: { request: Uint8Array }; denied?: boolean; pending?: boolean }[]
>;

const cfg = tcConfig as Record<string, any>;
export const TC_BASE = String(cfg["auth-server-url"]).replace(/\/$/, "");
export const REALM = String(cfg.realm);
export const ADMIN = `${TC_BASE}/admin/realms/${REALM}`;
export const CONSOLE_URL = `${TC_BASE}/admin/${REALM}/console/#/${REALM}/change-requests`;

export const RECORDS = {
  usa326: "traj-usa326",
  starlink: "traj-starlink4921",
} as const;
export const ASSESSOR_ROLE = "conjunction-assessor";

// One policy per subject and record. Owners read-write their own; the assessor role reads both.
export const POLICIES: { name: string; recordId: string; subject: RelationshipSubject; access: "read" | "read-write" }[] = [
  { name: "usa326-owner", recordId: RECORDS.usa326, subject: { type: "Role", id: "dod-operator" }, access: "read-write" },
  { name: "starlink-owner", recordId: RECORDS.starlink, subject: { type: "Role", id: "commercial-operator" }, access: "read-write" },
  { name: "usa326-assessor", recordId: RECORDS.usa326, subject: { type: "Role", id: ASSESSOR_ROLE }, access: "read" },
  { name: "starlink-assessor", recordId: RECORDS.starlink, subject: { type: "Role", id: ASSESSOR_ROLE }, access: "read" },
];

// Synthetic trajectories (state vectors, km & km/s, ECI). Fake data; the protection is real.
export const SYNTHETIC = {
  [RECORDS.usa326]: {
    object: "USA-326 (Classified DoD)", epoch: "2026-10-23T08:14:00Z",
    r: [-4123.551, 4987.204, 1876.932], v: [-5.3311, -3.8826, 3.6157], covariance_km: 0.41,
  },
  [RECORDS.starlink]: {
    object: "Starlink-4921 (Commercial)", epoch: "2026-10-23T08:14:00Z",
    r: [-4121.807, 4985.660, 1878.115], v: [-5.1029, -4.1187, 3.5872], covariance_km: 0.12,
  },
};

export const toB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
export const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function api<T = any>(sf: SecureFetch, path: string, init?: RequestInit): Promise<T> {
  const r = await sf(`${window.location.origin}${path}`, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  const text = await r.text();
  const body = text ? JSON.parse(text) : null;
  if (!r.ok) throw new Error(`${r.status} ${body?.error ?? text}`);
  return body as T;
}

async function tide(sf: SecureFetch, path: string, init?: RequestInit) {
  const r = await sf(`${ADMIN}${path}`, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  const text = await r.text();
  let body: any = text;
  try { body = text ? JSON.parse(text) : null; } catch { /* plain text */ }
  return { status: r.status, ok: r.ok, body, location: r.headers.get("Location") };
}

/** A Tide refusal surfaces as a THRESHOLD_FAILURE; the contract's reason is in `cause`. */
export function explainTideError(e: unknown): string {
  const parts: string[] = [];
  let cur: any = e;
  for (let i = 0; cur && i < 5; i++) {
    parts.push(cur instanceof Error ? cur.message : typeof cur === "string" ? cur : JSON.stringify(cur));
    cur = cur?.cause;
  }
  return parts.join("  ←  ");
}

// --- one-time setup (DoD operator, the first tide-realm-admin) --------------------------------
export async function signAllPolicies(sf: SecureFetch, log: (s: string) => void) {
  const ap = await tide(sf, "/iga/role-policies/name/tide-realm-admin");
  if (!ap.ok || !ap.body?.policy) throw new Error(`could not read the tide-realm-admin policy (${ap.status})`);
  const adminPolicy = fromB64(ap.body.policy);
  for (const p of POLICIES) {
    log(`Signing policy ${p.name} (${p.subject.type}:${p.subject.id} → ${p.recordId}, ${p.access}) — approve in the Tide enclave`);
    const signed = await signRelationshipPolicy({ vendorId: cfg.vendorId, subject: p.subject, recordId: p.recordId, access: p.access }, adminPolicy);
    await api(sf, `/api/policies/${p.name}`, { method: "POST", body: JSON.stringify({ policy: signed, recordId: p.recordId, subject: `${p.subject.type}:${p.subject.id}`, access: p.access }) });
    log(`✓ ${p.name} signed by the ORK network and stored`);
  }
}

export async function getPolicy(sf: SecureFetch, name: string): Promise<string> {
  return (await api<{ policy: string }>(sf, `/api/policies/${name}`)).policy;
}

export async function encryptOwnTrajectory(sf: SecureFetch, which: "usa326" | "starlink") {
  const recordId = RECORDS[which];
  const policy = await getPolicy(sf, which === "usa326" ? "usa326-owner" : "starlink-owner");
  const ciphertext = await encryptForRecord(JSON.stringify(SYNTHETIC[recordId]), recordId, policy);
  await api(sf, `/api/trajectories/${recordId}`, { method: "PUT", body: JSON.stringify({ ciphertext }) });
  return ciphertext;
}

export async function decryptTrajectory(sf: SecureFetch, recordId: string, policyName: string, ciphertext: string) {
  return JSON.parse(await decryptForRecord(ciphertext, recordId, await getPolicy(sf, policyName)));
}

// --- the governed grant -------------------------------------------------------------------------
export interface ChangeRequest {
  id: string; actionType: string; status: string; entityId?: string;
  authorizationCount?: number; authorizers?: { username: string }[]; threshold?: number; readyToCommit?: boolean;
  rows?: unknown; requestedBy?: string;
}

async function userId(sf: SecureFetch, username: string) {
  const r = await tide(sf, `/users?username=${encodeURIComponent(username)}&exact=true`);
  if (!r.ok || !r.body?.[0]) throw new Error(`cannot look up ${username} (${r.status})`);
  return r.body[0].id as string;
}

/** File the change request: grant conjunction-assessor to the operator who must act. */
export async function requestAssessorGrant(sf: SecureFetch, grantee = "commercial-operator") {
  const role = await tide(sf, `/roles/${ASSESSOR_ROLE}`);
  if (!role.ok) throw new Error(`role lookup failed (${role.status})`);
  const r = await tide(sf, `/users/${await userId(sf, grantee)}/role-mappings/realm`, { method: "POST", body: JSON.stringify([role.body]) });
  return { status: r.status, location: r.location, body: r.body };
}

/** Demo reset: revoking the role is itself a governed change request needing the same quorum. */
export async function requestAssessorRevoke(sf: SecureFetch, grantee = "commercial-operator") {
  const role = await tide(sf, `/roles/${ASSESSOR_ROLE}`);
  if (!role.ok) throw new Error(`role lookup failed (${role.status})`);
  const r = await tide(sf, `/users/${await userId(sf, grantee)}/role-mappings/realm`, { method: "DELETE", body: JSON.stringify([role.body]) });
  return { status: r.status, location: r.location, body: r.body };
}

export async function findAssessorCR(sf: SecureFetch): Promise<ChangeRequest | null> {
  const r = await tide(sf, `/iga/change-requests?status=PENDING`);
  if (!r.ok || !Array.isArray(r.body)) return null;
  return (r.body as ChangeRequest[]).find((c) => JSON.stringify(c).includes(ASSESSOR_ROLE)) ?? null;
}

export async function getCR(sf: SecureFetch, id: string): Promise<ChangeRequest | null> {
  const r = await tide(sf, `/iga/change-requests/${id}`);
  return r.ok ? (r.body as ChangeRequest) : null;
}

/**
 * Approve a change request as the logged-in user: the two-phase /approve call, with the enclave
 * signature in between. Sent straight from this browser with this user's own DPoP-bound token, so
 * TideCloak credits the approval to THIS operator (never proxied through a service account).
 */
export async function approveCR(sf: SecureFetch, approve: ApproveTideRequests, id: string) {
  const first = await tide(sf, `/iga/change-requests/${id}/approve`, { method: "POST", body: "{}" });
  if (!first.ok) return { phase: 1, ...first };
  if (first.body?.mode !== "needs-approval") return { phase: 1, ...first };
  const [res] = await approve([{ id, request: fromB64(first.body.requestModel) }]);
  if (!res?.approved) return { phase: 2, ok: false, status: 0, body: { error: res?.denied ? "denied in enclave" : "not approved" } };
  const second = await tide(sf, `/iga/change-requests/${id}/approve`, { method: "POST", body: JSON.stringify({ requestModel: toB64(res.approved.request) }) });
  return { phase: 2, ...second };
}

// --- mock maths ---------------------------------------------------------------------------------
export function mockAssessment(a: any, b: any) {
  const d = Math.hypot(a.r[0] - b.r[0], a.r[1] - b.r[1], a.r[2] - b.r[2]);
  return {
    inputsMissDistanceKm: Number(d.toFixed(1)),
    result: "Starlink-4921: +0.38 m/s prograde burn at T-6h → miss distance 18.2 km",
  };
}

import { useCallback, useEffect, useState } from "react";
import { useTideCloak } from "@tidecloak/react";
import OrbitView from "./OrbitView";
import {
  api, approveCR, CONSOLE_URL, decryptTrajectory, encryptOwnTrajectory, explainTideError, findAssessorCR, getCR,
  mockAssessment, RECORDS, requestAssessorGrant, requestAssessorRevoke, signAllPolicies, ASSESSOR_ROLE,
  type ChangeRequest, type SecureFetch, type ApproveTideRequests,
} from "./lib/blindorbit";

type LogLine = { t: string; kind: "info" | "ok" | "deny" | "tide"; msg: string };
type State = {
  trajectories: Record<string, { ciphertext: string; owner: string; updatedAt: string }>;
  policies: Record<string, { recordId: string; subject: string; access: string; signedBy: string }>;
  assessment: { result: string | null; deliveredTo: string; at: string } | null;
};

export default function Console() {
  const tc = useTideCloak();
  const sf = tc.secureFetch as SecureFetch;
  const approveTide = tc.approveTideRequests as ApproveTideRequests;
  const user = String(tc.getValueFromToken("preferred_username") ?? "");
  const roles: string[] = tc.getValueFromToken("realm_access")?.roles ?? [];
  const isDod = roles.includes("dod-operator");
  const isCom = roles.includes("commercial-operator");
  const isAdm = roles.includes("platform-admin");
  const isAssessor = roles.includes(ASSESSOR_ROLE);

  const [log, setLog] = useState<LogLine[]>([]);
  const [state, setState] = useState<State | null>(null);
  const [cr, setCr] = useState<ChangeRequest | null>(null);
  const [crId, setCrId] = useState<string | null>(() => localStorage.getItem("bo.crId"));
  const [busy, setBusy] = useState<string | null>(null);
  const [radar, setRadar] = useState(false);

  const add = useCallback((kind: LogLine["kind"], msg: string) => {
    setLog((l) => [{ t: new Date().toLocaleTimeString(), kind, msg }, ...l].slice(0, 80));
  }, []);

  const refresh = useCallback(async () => {
    try { setState(await api<State>(sf, "/api/state")); } catch (e) { add("deny", `state: ${explainTideError(e)}`); }
    try {
      const found = crId ? await getCR(sf, crId) : await findAssessorCR(sf);
      // A committed revoke means the demo is back at the start.
      if (found && found.actionType !== "GRANT_ROLES" && found.status === "APPROVED") {
        localStorage.removeItem("bo.crId"); setCrId(null); setCr(null);
      } else if (found) { setCr(found); if (!crId) { setCrId(found.id); localStorage.setItem("bo.crId", found.id); } }
    } catch { /* not every user can read the change-request list */ }
  }, [sf, crId, add]);

  useEffect(() => { refresh(); const i = setInterval(refresh, 4000); return () => clearInterval(i); }, [refresh]);

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    try { await fn(); } catch (e) { add("deny", `${label} → ${explainTideError(e)}`); }
    finally { setBusy(null); refresh(); }
  }

  // ---- actions -------------------------------------------------------------------------------
  const setup = () => run("Sign record policies", async () => {
    await signAllPolicies(sf, (s) => add("tide", s));
    add("ok", "All four record policies are signed by the ORK network.");
  });

  const encryptMine = () => run("Encrypt trajectory", async () => {
    const which = isDod ? "usa326" : "starlink";
    add("tide", `Encrypting ${which === "usa326" ? "USA-326" : "Starlink-4921"} trajectory under its record policy…`);
    const ct = await encryptOwnTrajectory(sf, which);
    add("ok", `Ciphertext stored (${ct.length} chars). The server never saw plaintext.`);
  });

  const requestGrant = () => run("Request assessment", async () => {
    add("info", "Filing change request: grant conjunction-assessor → commercial-operator");
    const r = await requestAssessorGrant(sf);
    add(r.status === 202 ? "tide" : "info", `TideCloak answered HTTP ${r.status}${r.status === 202 ? " (captured as a change request; needs quorum)" : ""} ${r.location ?? ""}`);
    const id = r.location?.split("/").pop();
    if (id) { setCrId(id); localStorage.setItem("bo.crId", id); }
  });

  const approve = () => run("Approve", async () => {
    const target = cr ?? (crId ? await getCR(sf, crId) : await findAssessorCR(sf));
    if (!target) throw new Error("no pending conjunction-assessor change request");
    add("tide", `${user} approving change request ${target.id.slice(0, 8)}… (Tide enclave will open)`);
    const r = await approveCR(sf, approveTide, target.id);
    add(r.ok ? "tide" : "deny", `TideCloak /approve (phase ${r.phase}) → HTTP ${r.status} ${JSON.stringify(r.body)}`);
  });

  const runAssessment = () => run("Run conjunction assessment", async () => {
    add("info", "Refreshing token so the credential carries any newly granted role…");
    await tc.forceRefreshToken();
    add("tide", "Asking the ORK network to decrypt USA-326 under policy usa326-assessor…");
    let a;
    try {
      a = await decryptTrajectory(sf, RECORDS.usa326, "usa326-assessor", state!.trajectories[RECORDS.usa326].ciphertext);
    } catch (e) {
      add("deny", `REJECTED by the Tide network: authority has not emerged (quorum not met, or role not yet in token): ${explainTideError(e)}`);
      return;
    }
    add("ok", "USA-326 decrypted (in this browser only).");
    add("tide", "Asking the ORK network to decrypt Starlink-4921 under policy starlink-assessor…");
    const b = await decryptTrajectory(sf, RECORDS.starlink, "starlink-assessor", state!.trajectories[RECORDS.starlink].ciphertext);
    add("ok", "Starlink-4921 decrypted (in this browser only).");
    const m = mockAssessment(a, b);
    await api(sf, "/api/assessment", { method: "POST", body: JSON.stringify({ result: m.result }) });
    add("ok", `Assessment complete: ${m.result}`);
  });

  const resetDemo = () => run("Reset demo", async () => {
    await api(sf, "/api/reset-assessment", { method: "POST" });
    localStorage.removeItem("bo.crId"); setCrId(null); setCr(null); setRadar(false);
    const r = await requestAssessorRevoke(sf);
    add("tide", `Revoke conjunction-assessor → HTTP ${r.status}${r.status === 202 ? " (change request: needs the same quorum — approve it twice)" : ""}`);
    const id = r.location?.split("/").pop();
    if (id) { setCrId(id); localStorage.setItem("bo.crId", id); }
  });

  const adminRead = () => run("Platform Admin read", async () => {
    add("info", `${user} requests the USA-326 assessor policy and asks the ORKs to decrypt…`);
    try {
      await decryptTrajectory(sf, RECORDS.usa326, "usa326-assessor", state!.trajectories[RECORDS.usa326].ciphertext);
      add("deny", "UNEXPECTED: decryption succeeded");
    } catch (e) {
      add("deny", `REJECTED by the Tide network: ${explainTideError(e)}`);
    }
    try {
      await decryptTrajectory(sf, RECORDS.usa326, "usa326-owner", state!.trajectories[RECORDS.usa326].ciphertext);
      add("deny", "UNEXPECTED: decryption with the owner policy succeeded");
    } catch (e) {
      add("deny", `Owner policy also REJECTED: ${explainTideError(e)}`);
    }
  });

  // ---- view ----------------------------------------------------------------------------------
  const t = state?.trajectories ?? {};
  const haveBoth = !!t[RECORDS.usa326] && !!t[RECORDS.starlink];
  const policiesReady = Object.keys(state?.policies ?? {}).length >= 4;
  const approvals = cr?.authorizationCount ?? cr?.authorizers?.length;
  const isRevoke = !!cr && cr.actionType !== "GRANT_ROLES";
  const committed = cr?.status === "APPROVED" && !isRevoke;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200">
      <header className="border-b border-zinc-800 px-4 sm:px-6 py-3 flex flex-wrap items-center gap-3">
        <div className="font-mono text-cyan-400 text-xs tracking-widest">BLINDORBIT</div>
        <div className="text-sm text-zinc-400">Conjunction coordination · no master key</div>
        <div className="ml-auto flex items-center gap-2 font-mono text-xs">
          <span className={`px-2 py-0.5 rounded border ${isDod ? "border-amber-500 text-amber-400" : isCom ? "border-cyan-500 text-cyan-400" : "border-zinc-600 text-zinc-300"}`}>{user}</span>
          {isAssessor && <span className="px-2 py-0.5 rounded border border-emerald-500 text-emerald-400">conjunction-assessor</span>}
          <button onClick={tc.logout} className="px-2 py-0.5 rounded border border-zinc-700 hover:border-zinc-500">logout</button>
        </div>
      </header>

      <main className="grid gap-4 p-4 sm:p-6 lg:grid-cols-[1fr_380px]">
        <section className="space-y-4 min-w-0">
          <OrbitView />

          <div className="grid gap-4 md:grid-cols-2">
            <Blob title="USA-326 (Classified DoD)" color="amber" rec={t[RECORDS.usa326]} />
            <Blob title="Starlink-4921 (Commercial)" color="cyan" rec={t[RECORDS.starlink]} />
          </div>

          <div className="border border-zinc-800 rounded-lg p-4 bg-zinc-900/40">
            <h2 className="font-mono text-xs tracking-widest text-zinc-400 mb-3">WORKFLOW</h2>
            {isRevoke && (
              <div className="mb-3 rounded border border-amber-700 bg-amber-950/30 p-2 font-mono text-xs text-amber-300 flex flex-wrap items-center gap-2">
                Demo reset pending: revoking conjunction-assessor needs the same quorum ({cr?.authorizationCount ?? 0}/{cr?.threshold ?? "?"}).
                <Btn onClick={approve} busy={busy}>Approve revoke as {user}</Btn>
              </div>
            )}
            <ol className="space-y-2 text-sm">
              <Step n={0} done={policiesReady} title="Record policies signed by the ORK network (one-time, DoD admin)">
                {isDod && !policiesReady && <Btn onClick={setup} busy={busy}>Sign 4 record policies</Btn>}
              </Step>
              <Step n={1} done={haveBoth} title="Both trajectories stored as ENCRYPTED blobs">
                {(isDod || isCom) && policiesReady && <Btn onClick={encryptMine} busy={busy}>Encrypt my trajectory</Btn>}
              </Step>
              <Step n={2} done={radar || !!cr} title="Radar alert: predicted miss distance 2.4 km" badge="sim">
                {!radar && !cr && <Btn onClick={() => { setRadar(true); add("info", "RADAR: USA-326 × Starlink-4921, predicted miss 2.4 km, TCA T-18h 42m"); }} busy={busy}>Inject radar alert</Btn>}
                {(radar || cr) && !cr && <Btn onClick={requestGrant} busy={busy}>Request conjunction assessment</Btn>}
              </Step>
              <Step n={3} done={!!cr && (approvals ?? 0) >= 1} title={`Operators approve in the Tide enclave ${cr ? `— ${approvals ?? "?"}/${cr.threshold ?? "?"} approvals${cr.authorizers?.length ? ` (${cr.authorizers.map((a) => a.username).join(", ")})` : ""}` : ""}`} badge="real">
                {cr && !committed && !isRevoke && <Btn onClick={approve} busy={busy}>Approve as {user}</Btn>}
                {cr && <a href={CONSOLE_URL} target="_blank" className="text-xs text-zinc-500 underline ml-2">open in TideCloak console</a>}
              </Step>
              <Step n={4} done={committed} title="Authority emerges: conjunction-assessor granted by quorum" badge="real" />
              <Step n={5} done={!!state?.assessment} title="Maneuver computed, delivered only to the operator who must act" badge="sim">
                {/* Available before quorum on purpose: one operator alone is refused by the ORKs. */}
                {isCom && haveBoth && !state?.assessment && <Btn onClick={runAssessment} busy={busy}>Run conjunction assessment</Btn>}
              </Step>
            </ol>
            {state?.assessment && (
              <div className="mt-4 rounded border border-emerald-700 bg-emerald-950/40 p-3 font-mono text-sm">
                <Badge kind="sim" label="SIMULATED maneuver calculation" />{" "}
                {state.assessment.result
                  ? <span className="text-emerald-300">{state.assessment.result}</span>
                  : <span className="text-zinc-400">Assessment delivered to {state.assessment.deliveredTo} at {state.assessment.at}. Not visible to {user}.</span>}
              </div>
            )}
          </div>

          <div className="border border-red-900/60 rounded-lg p-4 bg-red-950/20">
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <div className="font-mono text-xs tracking-widest text-red-400">KEY MOMENT</div>
                <div className="text-sm text-zinc-300">Platform Admin tries to read the classified trajectory.</div>
              </div>
              <Btn onClick={adminRead} busy={busy} danger disabled={!t[RECORDS.usa326]}>Attempt Platform Admin Read</Btn>
            </div>
            {!isAdm && <p className="text-xs text-zinc-500 mt-2 font-mono">Sign in as platform-admin to run this as the admin. Any non-assessor gets the same refusal.</p>}
          </div>

          {committed && cr?.actionType === "GRANT_ROLES" && (
            <div className="text-right">
              <button onClick={resetDemo} disabled={!!busy} className="font-mono text-[11px] text-zinc-500 hover:text-zinc-300 underline disabled:opacity-40">
                reset demo (files a governed revoke)
              </button>
            </div>
          )}
        </section>

        <aside className="space-y-4 min-w-0">
          <Compare />
          <div className="border border-zinc-800 rounded-lg bg-black/60">
            <div className="px-3 py-2 border-b border-zinc-800 font-mono text-xs tracking-widest text-zinc-400 flex justify-between">
              <span>TIDECLOAK LIVE LOG</span>{busy && <span className="text-cyan-400 animate-pulse">{busy}…</span>}
            </div>
            <div className="p-3 font-mono text-[11px] leading-relaxed max-h-[520px] overflow-auto space-y-1 break-words">
              {log.length === 0 && <div className="text-zinc-600">Waiting for activity…</div>}
              {log.map((l, i) => (
                <div key={i} className={{ info: "text-zinc-400", ok: "text-emerald-400", deny: "text-red-400", tide: "text-cyan-300" }[l.kind]}>
                  <span className="text-zinc-600">{l.t}</span> {l.msg}
                </div>
              ))}
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}

function Btn({ children, onClick, busy, danger, disabled }: { children: React.ReactNode; onClick: () => void; busy: string | null; danger?: boolean; disabled?: boolean }) {
  return (
    <button disabled={!!busy || disabled} onClick={onClick}
      className={`px-3 py-1 rounded text-xs font-semibold disabled:opacity-40 ${danger ? "bg-red-600 hover:bg-red-500 text-white" : "bg-cyan-500 hover:bg-cyan-400 text-zinc-950"}`}>
      {children}
    </button>
  );
}

export function Badge({ kind, label }: { kind: "sim" | "real"; label?: string }) {
  return kind === "sim"
    ? <span className="inline-block font-mono text-[9px] tracking-wider px-1.5 py-0.5 rounded border border-violet-500/70 text-violet-300 bg-violet-950/40">{label ?? "SIMULATED"}</span>
    : <span className="inline-block font-mono text-[9px] tracking-wider px-1.5 py-0.5 rounded border border-emerald-600/70 text-emerald-300 bg-emerald-950/40">{label ?? "REAL · TIDECLOAK"}</span>;
}

function Step({ n, done, title, badge, children }: { n: number; done: boolean; title: string; badge?: "sim" | "real"; children?: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-center gap-3">
      <span className={`font-mono text-xs w-6 h-6 grid place-items-center rounded-full border ${done ? "border-emerald-500 text-emerald-400" : "border-zinc-700 text-zinc-500"}`}>{done ? "✓" : n}</span>
      <span className={done ? "text-zinc-200" : "text-zinc-400"}>{title}</span>
      {badge && <Badge kind={badge} />}
      {children}
    </li>
  );
}

function Blob({ title, color, rec }: { title: string; color: "amber" | "cyan"; rec?: { ciphertext: string; updatedAt: string } }) {
  return (
    <div className="border border-zinc-800 rounded-lg p-3 bg-zinc-900/40 min-w-0">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`font-mono text-xs mr-auto ${color === "amber" ? "text-amber-400" : "text-cyan-400"}`}>{title}</span>
        <Badge kind="sim" label="SIMULATED TRAJECTORY" />
        <Badge kind="real" label="REAL ENCRYPTION" />
      </div>
      <div className="font-mono text-[10px] text-zinc-500 mt-2 break-all h-16 overflow-hidden">
        {rec ? rec.ciphertext.slice(0, 260) : "— not yet submitted —"}
      </div>
      <div className="font-mono text-[10px] text-zinc-600 mt-1">{rec ? `🔒 RelationshipAttestation:1 · ${rec.updatedAt}` : ""}</div>
    </div>
  );
}

function Compare() {
  return (
    <div className="grid gap-3">
      <div className="border border-red-900/60 rounded-lg p-3 bg-red-950/20">
        <div className="font-mono text-xs tracking-widest text-red-400">LEGACY CLEARINGHOUSE</div>
        <p className="text-sm mt-1">One admin key = full surveillance map of every satellite. Compromise the clearinghouse, own every orbit.</p>
      </div>
      <div className="border border-emerald-900/60 rounded-lg p-3 bg-emerald-950/20">
        <div className="font-mono text-xs tracking-widest text-emerald-400">TIDECLOAK</div>
        <p className="text-sm mt-1">Zero master keys. Keys are split across the ORK network; authority to read both trajectories emerges only when the operators' quorum approves.</p>
      </div>
    </div>
  );
}

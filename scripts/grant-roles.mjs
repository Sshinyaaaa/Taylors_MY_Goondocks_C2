// Grants each demo user its roles ONE AT A TIME (IGA allows one pending change request per user),
// approving each in FirstAdmin mode. Safe to re-run: skips roles already held.
// Run before tide-realm-admin is granted (after that, grants need enclave approval).
import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const TC = env.TIDECLOAK_URL || "http://localhost:8080", REALM = env.TIDECLOAK_REALM || "blindorbit";
const B = `${TC}/admin/realms/${REALM}`;
const token = async () => (await (await fetch(`${TC}/realms/master/protocol/openid-connect/token`, { method: "POST", body: new URLSearchParams({ grant_type: "password", client_id: "admin-cli", username: env.KC_BOOTSTRAP_ADMIN_USERNAME || "admin", password: env.KC_BOOTSTRAP_ADMIN_PASSWORD }) })).json()).access_token;
const call = async (p, m = "GET", b) => { const r = await fetch(B + p, { method: m, headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" }, body: b && JSON.stringify(b) }); const t = await r.text(); let j = t; try { j = t ? JSON.parse(t) : null; } catch {} return { s: r.status, j }; };
const SKIP = ["DISABLE_IGA", "DELETE_REALM", "OFFBOARD_REALM"];
async function drain() {
  for (let i = 0; i < 5; i++) {
    const p = ((await call("/iga/change-requests?status=PENDING")).j || []).filter((c) => !SKIP.includes(c.actionType));
    if (!p.length) return;
    for (const c of p) await call(`/iga/change-requests/${c.id}/authorize`, "POST", {});
    for (const c of ((await call("/iga/change-requests?status=PENDING")).j || []).filter((c) => c.readyToCommit && !SKIP.includes(c.actionType)))
      console.log("  commit", c.actionType, (await call(`/iga/change-requests/${c.id}/commit`, "POST")).s);
  }
}
const PLAN = {
  "dod-operator": ["dod-operator", "_tide_encryptor", "_tide_decryptor"],
  "commercial-operator": ["commercial-operator", "_tide_encryptor", "_tide_decryptor"],
  "platform-admin": ["platform-admin", "_tide_decryptor"],
};
const rm = (await call("/clients?clientId=realm-management")).j[0];
const realmAdmin = (await call(`/clients/${rm.id}/roles/realm-admin`)).j;
await drain();
for (const [username, roles] of Object.entries(PLAN)) {
  const u = (await call(`/users?username=${username}&exact=true`)).j[0];
  const have = (await call(`/users/${u.id}/role-mappings`)).j;
  const realmHave = (have.realmMappings || []).map((r) => r.name);
  for (const r of roles) {
    if (realmHave.includes(r)) continue;
    const rep = (await call(`/roles/${r}`)).j;
    console.log(username, "+", r, (await call(`/users/${u.id}/role-mappings/realm`, "POST", [rep])).s);
    await drain();
  }
  const clientHave = Object.values(have.clientMappings || {}).flatMap((c) => c.mappings.map((m) => m.name));
  if (!clientHave.includes("realm-admin")) {
    console.log(username, "+ realm-admin", (await call(`/users/${u.id}/role-mappings/clients/${rm.id}`, "POST", [realmAdmin])).s);
    await drain();
  }
}
for (const username of Object.keys(PLAN)) {
  const u = (await call(`/users?username=${username}&exact=true`)).j[0];
  const m = (await call(`/users/${u.id}/role-mappings`)).j;
  console.log(username, (m.realmMappings || []).map((r) => r.name).join(","), "|", Object.values(m.clientMappings || {}).flatMap((c) => c.mappings.map((x) => x.name)).join(","));
}

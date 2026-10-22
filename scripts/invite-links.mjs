// Prints fresh Tide account-link invites for the demo users that are not linked yet.
import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const TC = env.TIDECLOAK_URL || "http://localhost:8080", REALM = env.TIDECLOAK_REALM || "blindorbit";
const tok = (await (await fetch(`${TC}/realms/master/protocol/openid-connect/token`, { method: "POST", body: new URLSearchParams({ grant_type: "password", client_id: "admin-cli", username: env.KC_BOOTSTRAP_ADMIN_USERNAME || "admin", password: env.KC_BOOTSTRAP_ADMIN_PASSWORD }) })).json()).access_token;
const H = { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" };
for (const name of ["dod-operator", "commercial-operator", "platform-admin"]) {
  const u = (await (await fetch(`${TC}/admin/realms/${REALM}/users?username=${name}&exact=true`, { headers: H })).json())[0];
  if (u.attributes?.tideUserKey?.[0]) { console.log(`[${name}] already linked`); continue; }
  const r = await fetch(`${TC}/admin/realms/${REALM}/tideAdminResources/get-required-action-link?userId=${u.id}&lifespan=43200`, { method: "POST", headers: H, body: JSON.stringify(["link-tide-account-action"]) });
  console.log(`\n[${name}]\n${await r.text()}`);
}

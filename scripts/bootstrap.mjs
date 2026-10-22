#!/usr/bin/env node
// BlindOrbit realm bootstrap — a cross-platform (Windows-friendly) port of the Tide pack's
// templates/shared/bootstrap-tidecloak.sh, extended for three users.
//
//   1. start tideorg/tidecloak-dev in Docker
//   2. create realm "blindorbit" from scripts/realm.json.template (+ BlindOrbit roles)
//   3. license it (setUpTideRealm) and enable IGA in Tide mode
//   4. create dod-operator, commercial-operator, platform-admin and grant their roles
//   5. print an invite link per user and wait until all three link a Tide account
//   6. sign IdP settings, grant tide-realm-admin to dod-operator (flips realm to multiAdmin)
//   7. export the adapter to public/tidecloak.json
//
// Every governed write happens while the realm is still FirstAdmin. After step 6, every
// change (including adding more tide-realm-admins) needs an enclave approval in the browser.
//
// Needs in .env: KC_BOOTSTRAP_ADMIN_PASSWORD, TIDE_LICENSE_EMAIL, TIDE_TERMS_ACCEPTED=yes

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

// --- .env -------------------------------------------------------------------------------------
if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const TC = process.env.TIDECLOAK_URL || "http://localhost:8080";
const REALM = process.env.TIDECLOAK_REALM || "blindorbit";
const CLIENT = process.env.TIDECLOAK_CLIENT_ID || "blindorbit-client";
const APP_URL = process.env.CLIENT_APP_URL || "http://localhost:5173";
const IMAGE = process.env.TIDECLOAK_IMAGE || "tideorg/tidecloak-dev:latest";
const ADMIN_USER = process.env.KC_BOOTSTRAP_ADMIN_USERNAME || "admin";
const ADMIN_PASS = process.env.KC_BOOTSTRAP_ADMIN_PASSWORD;
const EMAIL = process.env.TIDE_LICENSE_EMAIL;

if (!ADMIN_PASS) {
  console.error("ERROR: KC_BOOTSTRAP_ADMIN_PASSWORD is not set (put it in .env, which is gitignored).");
  process.exit(1);
}
// Licence email + Terms & Conditions must come from the person who owns the deployment (AP-90).
if (!EMAIL || !/^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/.test(EMAIL) || /@(example|test)\./.test(EMAIL) ||
    process.env.TIDE_TERMS_ACCEPTED !== "yes") {
  console.error(`STOP: realm NOT set up. Set TIDE_LICENSE_EMAIL (a real address you control) and
TIDE_TERMS_ACCEPTED=yes only after agreeing to Tide's Terms & Conditions: https://tide.org/legal`);
  process.exit(2);
}

// Demo identities. Realm roles drive both the UI and the server-side checks.
const USERS = [
  { username: "dod-operator", first: "DoD", last: "Operator", roles: ["dod-operator", "_tide_encryptor", "_tide_decryptor"] },
  { username: "commercial-operator", first: "Commercial", last: "Operator", roles: ["commercial-operator", "_tide_encryptor", "_tide_decryptor"] },
  // The platform admin even holds _tide_decryptor: what stops it is the record policy, enforced by the ORKs.
  { username: "platform-admin", first: "Platform", last: "Admin", roles: ["platform-admin", "_tide_decryptor"] },
];
const APP_ROLES = [
  ["dod-operator", "Owns the classified USA-326 trajectory"],
  ["commercial-operator", "Owns the Starlink-4921 trajectory"],
  ["platform-admin", "Runs the coordination platform; holds no trajectory access"],
  ["conjunction-assessor", "May read BOTH trajectories. Granting it is a governed change request needing a quorum."],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (s) => console.log(`==> ${s}`);

async function token() {
  const r = await fetch(`${TC}/realms/master/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "password", client_id: "admin-cli", username: ADMIN_USER, password: ADMIN_PASS }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error(`admin token failed: ${JSON.stringify(j)}`);
  return j.access_token;
}

async function api(method, path, body, { form = false, raw = false } = {}) {
  const headers = { Authorization: `Bearer ${await token()}` };
  let payload;
  if (body !== undefined) {
    if (form) { headers["Content-Type"] = "application/x-www-form-urlencoded"; payload = new URLSearchParams(body); }
    else { headers["Content-Type"] = "application/json"; payload = JSON.stringify(body); }
  }
  const r = await fetch(`${TC}/admin/realms${path}`, { method, headers, body: payload });
  const text = await r.text();
  if (raw) return { status: r.status, text };
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${text.slice(0, 400)}`);
  try { return text ? JSON.parse(text) : null; } catch { return text; }
}

const SKIP = new Set(["DISABLE_IGA", "DELETE_REALM", "OFFBOARD_REALM"]);
// FirstAdmin mode: authorize (server-side VRK) then commit, in dependency passes.
async function drain() {
  for (let pass = 0; pass < 6; pass++) {
    const pending = (await api("GET", `/${REALM}/iga/change-requests?status=PENDING`)) || [];
    const todo = pending.filter((c) => !SKIP.has(c.actionType));
    if (!todo.length) return;
    for (const c of todo) await api("POST", `/${REALM}/iga/change-requests/${c.id}/authorize`, {}, { raw: true });
    const ready = ((await api("GET", `/${REALM}/iga/change-requests?status=PENDING`)) || [])
      .filter((c) => !SKIP.has(c.actionType) && c.readyToCommit);
    for (const c of ready) await api("POST", `/${REALM}/iga/change-requests/${c.id}/commit`, undefined, { raw: true });
    await sleep(1000);
  }
  const left = ((await api("GET", `/${REALM}/iga/change-requests?status=PENDING`)) || []).filter((c) => !SKIP.has(c.actionType));
  if (left.length) console.warn(`WARNING: ${left.length} change request(s) still pending:`, left.map((c) => c.actionType));
}

async function findUser(username) {
  const list = await api("GET", `/${REALM}/users?username=${encodeURIComponent(username)}&exact=true`);
  return list?.[0];
}

// --- 1. container ---------------------------------------------------------------------------
async function up() {
  try { const r = await fetch(`${TC}/realms/master`); return r.ok; } catch { return false; }
}
if (!(await up())) {
  log(`Starting TideCloak (${IMAGE})...`);
  try { execSync("docker rm -f blindorbit-tidecloak", { stdio: "ignore" }); } catch {}
  execSync(
    `docker run -d --name blindorbit-tidecloak -p 8080:8080 ` +
      `-e KC_BOOTSTRAP_ADMIN_USERNAME -e KC_BOOTSTRAP_ADMIN_PASSWORD ${IMAGE}`,
    { stdio: "inherit", env: { ...process.env, KC_BOOTSTRAP_ADMIN_USERNAME: ADMIN_USER, KC_BOOTSTRAP_ADMIN_PASSWORD: ADMIN_PASS } },
  );
  for (let i = 0; i < 60 && !(await up()); i++) { process.stdout.write("."); await sleep(3000); }
  console.log();
  if (!(await up())) { console.error("TideCloak did not start. Check: docker logs blindorbit-tidecloak"); process.exit(1); }
}
log("TideCloak is up.");

// --- 2. realm -------------------------------------------------------------------------------
const exists = (await api("GET", `/${REALM}`, undefined, { raw: true })).status === 200;
// RESUME=1 continues a realm that is already created and licensed (never license twice).
if (exists && process.env.RESUME !== "1") {
  console.error(`Realm '${REALM}' already exists. Continue it with RESUME=1, or start over: docker rm -f blindorbit-tidecloak`);
  process.exit(1);
}
if (!exists) {
log(`Creating realm '${REALM}'...`);
const realm = JSON.parse(
  readFileSync(new URL("./realm.json.template", import.meta.url), "utf8")
    .replaceAll("REALM_NAME", REALM).replaceAll("CLIENT_NAME", CLIENT).replaceAll("CLIENT_APP_URL", APP_URL),
);
for (const [name, description] of APP_ROLES) realm.roles.realm.push({ name, description });
await api("POST", "", realm);

// Never show Keycloak's "Update Account Information" page (must run before IGA).
log("Disabling first-broker-login profile page...");
const execs = await api("GET", `/${REALM}/authentication/flows/first%20broker%20login/executions`);
const review = execs.find((e) => e.providerId === "idp-review-profile");
if (review?.authenticationConfig) {
  await api("PUT", `/${REALM}/authentication/config/${review.authenticationConfig}`,
    { alias: "review profile config", config: { "update.profile.on.first.login": "off" } });
} else if (review) {
  await api("POST", `/${REALM}/authentication/executions/${review.id}/config`,
    { alias: "review profile config", config: { "update.profile.on.first.login": "off" } });
}

// --- 3. licence + IGA -------------------------------------------------------------------------
log("Licensing realm (setUpTideRealm)...");
const setup = await api("POST", `/${REALM}/vendorResources/setUpTideRealm`, { email: EMAIL, isRagnarokEnabled: "true" }, { form: true, raw: true });
if (setup.status >= 300 || /NEED_PAYMENT/.test(setup.text)) {
  console.error(`setUpTideRealm failed (${setup.status}): ${setup.text.slice(0, 400)}`);
  process.exit(1);
}
log("Stamping iga.attestor=tide...");
const rep = await api("GET", `/${REALM}`);
rep.attributes = { ...(rep.attributes || {}), "iga.attestor": "tide" };
await api("PUT", `/${REALM}`, rep);

log("Enabling IGA...");
const now = await api("GET", `/${REALM}`);
if (String(now.attributes?.isIGAEnabled).toLowerCase() !== "true") {
  const iga = await api("POST", `/${REALM}/tide-admin/toggle-iga`, { isIGAEnabled: "true" }, { form: true, raw: true });
  if (!iga.text.includes('"enabled":true')) { console.error(`toggle-iga failed: ${iga.text}`); process.exit(1); }
}
await sleep(2000);
}
await drain();

// --- 4. users + roles -------------------------------------------------------------------------
const rmClient = (await api("GET", `/${REALM}/clients?clientId=realm-management`))[0];
const realmAdminRole = await api("GET", `/${REALM}/clients/${rmClient.id}/roles/realm-admin`);

for (const u of USERS) {
  if (await findUser(u.username)) continue;
  log(`Creating user ${u.username}...`);
  // The realm's user profile requires an email: plus-addresses of the licence owner's mailbox.
  const [local, domain] = EMAIL.split("@");
  const r = await api("POST", `/${REALM}/users`, {
    username: u.username, email: `${local}+${u.username}@${domain}`, firstName: u.first, lastName: u.last, enabled: true,
    attributes: { tideInvitable: ["true"] },
  }, { raw: true });
  if (r.status >= 300) throw new Error(`create ${u.username} -> ${r.status} ${r.text}`);
}
await sleep(1500);
await drain();

for (const u of USERS) {
  const user = await findUser(u.username);
  if (!user) throw new Error(`user ${u.username} not found after drain`);
  u.id = user.id;
  // IGA allows ONE pending change request per user: grant one role, approve it, then the next.
  const held = ((await api("GET", `/${REALM}/users/${u.id}/role-mappings`)).realmMappings || []).map((r) => r.name);
  for (const r of u.roles) {
    if (held.includes(r)) continue;
    const rep = await api("GET", `/${REALM}/roles/${encodeURIComponent(r)}`);
    await api("POST", `/${REALM}/users/${u.id}/role-mappings/realm`, [rep], { raw: true });
    await drain();
  }
  // Every participant is a full realm admin: no one is trusted more than anyone else; only the
  // Tide quorum decides. (tide-realm-admin is granted separately, below and in the README.)
  await api("POST", `/${REALM}/users/${u.id}/role-mappings/clients/${rmClient.id}`, [realmAdminRole], { raw: true });
  await drain();
}

// --- 5. invite links --------------------------------------------------------------------------
console.log("\n==================== INVITE LINKS ====================");
console.log("Open each link in a SEPARATE private/incognito window and create a Tide account for it.");
for (const u of USERS) {
  const link = await api("POST", `/${REALM}/tideAdminResources/get-required-action-link?userId=${u.id}&lifespan=43200`, ["link-tide-account-action"]);
  console.log(`\n[${u.username}]\n${typeof link === "string" ? link : JSON.stringify(link)}`);
}
console.log("\n======================================================\n");

log("Waiting for all three accounts to be linked (polling every 5s)...");
const linked = new Set();
while (linked.size < USERS.length) {
  for (const u of USERS) {
    if (linked.has(u.username)) continue;
    const user = await findUser(u.username);
    if (user?.attributes?.tideUserKey?.[0]) { linked.add(u.username); log(`${u.username} linked.`); }
  }
  if (linked.size < USERS.length) await sleep(5000);
}
await sleep(2000);
await drain();

// --- 6. IdP settings, then the one-way door ---------------------------------------------------
log("Configuring CustomAdminUIDomain + signing IdP settings...");
const inst = await api("GET", `/${REALM}/identity-provider/instances/tide`);
inst.config.CustomAdminUIDomain = `${TC}/realms/${REALM}/tide-console/`;
await api("PUT", `/${REALM}/identity-provider/instances/tide`, inst);
await api("POST", `/${REALM}/vendorResources/sign-idp-settings`, undefined, { raw: true });

log("Granting tide-realm-admin to dod-operator (realm flips to multiAdmin)...");
const tra = await api("GET", `/${REALM}/clients/${rmClient.id}/roles/tide-realm-admin`);
const dod = USERS[0];
await api("POST", `/${REALM}/users/${dod.id}/role-mappings/clients/${rmClient.id}`, [tra], { raw: true });
await sleep(2000);
await drain();

// --- 7. adapter -------------------------------------------------------------------------------
log("Exporting adapter to public/tidecloak.json...");
const cl = (await api("GET", `/${REALM}/clients?clientId=${CLIENT}`))[0];
const adapter = await api("GET", `/${REALM}/vendorResources/get-installations-provider?clientId=${cl.id}&providerId=keycloak-oidc-keycloak-json`);
if (!adapter?.jwk || !adapter?.vendorId || !adapter?.homeOrkUrl) {
  console.error("Adapter is missing jwk/vendorId/homeOrkUrl — licensing or IGA did not complete.", adapter);
  process.exit(1);
}
writeFileSync("public/tidecloak.json", JSON.stringify(adapter, null, 2));
writeFileSync("server/users.json", JSON.stringify(Object.fromEntries(USERS.map((u) => [u.username, u.id])), null, 2));

console.log(`
Bootstrap complete.
  TideCloak:     ${TC}   (admin console: ${TC}/admin/${REALM}/console/)
  Realm/client:  ${REALM} / ${CLIENT}
  Adapter:       public/tidecloak.json
Next: npm run dev, then follow "Phase 1 setup" in README.md.`);

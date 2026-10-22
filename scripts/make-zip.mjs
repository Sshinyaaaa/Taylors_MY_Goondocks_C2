// Builds sourcecodes.zip from COMMITTED files only (git archive), so node_modules, dist/, .env,
// public/tidecloak.json, server/db.json, invite links and the Tide pack are never included.
// Refuses to build if anything secret-looking is tracked. Works on Windows, macOS and Linux.
import { execSync } from "node:child_process";

const sh = (c) => execSync(c, { encoding: "utf8" }).trim();

const dirty = sh("git status --porcelain");
if (dirty) console.warn("WARNING: uncommitted changes are NOT in the zip (it is built from HEAD):\n" + dirty);

const files = sh("git ls-tree -r --name-only HEAD").split("\n");
const forbidden = [
  /(^|\/)node_modules\//, /(^|\/)dist\//, /(^|\/)build\//,
  /(^|\/)\.env$/, /(^|\/)\.env\.(?!example$)[^/]+$/,
  /tidecloak\.json$/, /(^|\/)db\.json$/, /users\.json$/, /invite-links\.txt$/, /\.tide-pack\//,
  /\.(pem|key|p12|pfx)$/i, /skycloak-api-key/,
];
const bad = files.filter((f) => forbidden.some((re) => re.test(f)));
if (bad.length) {
  console.error("Refusing to build: these tracked files must not ship:\n  " + bad.join("\n  "));
  process.exit(1);
}

sh("git archive --format=zip -o sourcecodes.zip HEAD");
console.log(`sourcecodes.zip written: ${files.length} files from ${sh("git rev-parse --short HEAD")}`);

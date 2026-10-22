# BlindOrbit

**Rival satellite operators coordinate a collision-avoidance manoeuvre without handing anyone a master key: authority to read both trajectories only emerges when TideCloak's approval quorum is met.**

## Vision & originality
Low orbit is crowded, and the riskiest close approaches often involve operators who legally can't share where their satellites are. BlindOrbit lets a defence ministry and a commercial operator run a conjunction assessment together without either handing its trajectory to a clearinghouse.

## Trust constraint insight
Today's coordination needs a trusted middleman. Whoever holds the clearinghouse key holds a surveillance map of every classified and commercial asset. The real constraint isn't encryption; it's that *somebody* can always decrypt.

## Value & impact
Trajectories sit encrypted on a server that can't read them. Only a quorum of operators can grant the authority to read both. The manoeuvre is delivered only to the operator who must burn. A platform admin, a compromised server, or one operator alone gets ciphertext and a refusal.

## Why TideCloak matters
Keys are split across Tide's ORK network, so no one holds one. Decryption is enforced by the network under per-record policies (`RelationshipAttestation:1`), and the role that unlocks both records can only be granted through a quorum-approved IGA change request signed in each approver's Tide enclave.

## Prototype & storytelling
A dark mission-control console shows an orbit view with a 5 km warning bubble, both trajectories as encrypted blobs, and a live TideCloak log. Judges watch the platform admin get refused and one operator get refused. Then both operators approve, and the manoeuvre appears.

## What is real vs mocked

| Component | Status | How |
|---|---|---|
| Login (3 users) | **REAL** | Tide threshold login via TideCloak, DPoP-bound tokens |
| Roles (`dod-operator`, `commercial-operator`, `platform-admin`, `conjunction-assessor`) | **REAL** | TideCloak realm roles, carried in the signed token |
| API protection | **REAL** | Server verifies JWT signature (realm key embedded in adapter), issuer, and the DPoP proof on every route |
| Trajectory encryption / decryption | **REAL** | Tide ORK network, `RelationshipAttestation:1` policies, one per record and subject |
| Platform Admin read refused | **REAL** | The ORKs refuse the decryption; our code makes no access decision |
| Quorum approval ("both operators approve") | **REAL** | IGA change request, approved in the Tide enclave, committed by TideCloak at threshold |
| One operator alone refused | **REAL** | Below threshold the role isn't granted, so the ORKs refuse decryption |
| Trajectory contents (state vectors) | SIMULATED | Synthetic numbers in `src/lib/blindorbit.ts` |
| Radar alert, miss distance, TCA countdown | SIMULATED | Hard-coded |
| Orbit view | SIMULATED | 2D canvas drawing |
| Manoeuvre calculation | SIMULATED | Fixed result string |

**Honest limits:**
- **Quorum size:** Tide's admin quorum is `max(1, floor(0.7 × admins))`, so with three approvers (both operators and the platform admin) it is 2-of-3. The admin alone or one operator alone is refused; the admin plus one operator could approve.
- **Where plaintext exists:** decrypted trajectories exist only in the acting operator's browser memory.

## Setup (clean Windows or Mac)

**Prerequisites**
- [Docker Desktop](https://www.docker.com/products/docker-desktop/), running.
- [Node.js 20+](https://nodejs.org/).
- [Git](https://git-scm.com/). On Windows, run the commands below in **Git Bash** (installed with Git) or PowerShell.
- Google Chrome. Firefox-based browsers block the Tide sign-up callback.
- A network that reaches `ork1.tideprotocol.com` with its real certificate. Corporate or campus TLS-inspecting firewalls break Tide; a phone hotspot works.

**1. Get the code and install**
```bash
git clone <this-repository-url> blindorbit
cd blindorbit
npm install
```

**2. Secrets.** Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Then set these in `.env`:
- `KC_BOOTSTRAP_ADMIN_PASSWORD`: any strong password for your local TideCloak.
- `TIDE_LICENSE_EMAIL`: your email, which manages the Tide licence.
- `TIDE_TERMS_ACCEPTED=yes`: only once you agree to https://tide.org/legal.

**3. Start TideCloak and set up the realm**
```bash
npm run bootstrap
```
This starts `tideorg/tidecloak-dev` on :8080, creates and licenses the `blindorbit` realm, enables IGA, and creates the three users with their roles. It then prints three invite links. Open each in a **separate Chrome incognito window** and create a **new Tide account** per user. If Chrome asks to allow local network access, click Allow. The script continues once all three are linked: it makes `dod-operator` the first approver and writes `public/tidecloak.json`. If a link expires, get fresh ones:
```bash
node scripts/invite-links.mjs
```

**4. Run the app**
```bash
npm run dev
```
The app opens on http://localhost:5173 and the API runs on :4000. Allow pop-ups for localhost:5173.

**5. One-time in-app setup**
1. As **dod-operator**, click **Sign 4 record policies** and approve each in the Tide pop-up. Then click **Encrypt my trajectory**.
2. As **commercial-operator**, click **Encrypt my trajectory**.
3. Open the TideCloak admin console at http://localhost:8080/admin/blindorbit/console/, signed in as dod-operator. Go to **Users → commercial-operator → Role mapping → Assign role**, choose client `realm-management` → `tide-realm-admin`, then approve under **Change requests**. Repeat for **platform-admin**. Three approvers make the quorum 2.

Now follow [DEMO_SCRIPT.md](DEMO_SCRIPT.md).

**Start over:**
```bash
docker rm -f blindorbit-tidecloak
```
Then delete `server/db.json` and run `npm run bootstrap` again.

## Packaging
```bash
npm run zip
```
This writes `sourcecodes.zip` from committed files only, so it never includes `node_modules`, build output, `.env` or generated config.

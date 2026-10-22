# BlindOrbit

**Collision-avoidance coordination between rival satellite operators, with no master key.**
Authority to read both operators' trajectories only comes into existence when a quorum of operators approves it, enforced by [TideCloak](https://tide.org).

![Stack](https://img.shields.io/badge/stack-React%2019%20%7C%20Express%20%7C%20Vite%20%7C%20TypeScript-blue)
![Trust layer](https://img.shields.io/badge/trust%20layer-TideCloak-green)
![Status](https://img.shields.io/badge/status-hackathon%20prototype-orange)

---

## Table of contents

1. [The problem](#the-problem)
2. [What BlindOrbit does](#what-blindorbit-does)
3. [How it works](#how-it-works)
4. [Why TideCloak](#why-tidecloak)
5. [Real vs simulated](#real-vs-simulated)
6. [Tech stack](#tech-stack)
7. [Getting started](#getting-started)
8. [Running the demo](#running-the-demo)
9. [Project structure](#project-structure)
10. [Scripts](#scripts)
11. [Troubleshooting](#troubleshooting)
12. [Known limitations](#known-limitations)
13. [Packaging](#packaging)

---

## The problem

Low Earth orbit is crowded, and close approaches ("conjunctions") are now routine. Avoiding a collision needs **both** operators' precise trajectories: one side computes the risk, the other burns fuel to move.

The operators most likely to collide often **can't share**. A defence ministry won't release a classified satellite's orbit, and a commercial operator guards its fleet data.

Today's fix is a central clearinghouse that receives everyone's unredacted trajectories. Whoever holds its master key, whether an admin, an insider or an attacker, holds a live surveillance map of every asset. So operators share less, later, or not at all, and collision risk rises.

> The real constraint isn't encryption. It's that *somebody* can always decrypt.

## What BlindOrbit does

BlindOrbit lets a defence ministry and a commercial operator run a conjunction assessment together **without either handing its trajectory to a third party.**

- Trajectories are encrypted before storage. The server holds only ciphertext.
- Reading both orbits requires a special role, `conjunction-assessor`, which nobody holds by default.
- That role can only be granted through a **quorum-approved change request**, signed by each approver inside their own Tide enclave.
- Decryption happens only in the acting operator's browser, and the resulting manoeuvre is delivered only to the operator who must burn.

| Actor | Result |
|---|---|
| Platform admin | Refused. Gets ciphertext only. |
| Compromised server | Refused. Holds no keys. |
| One operator alone | Refused. Below quorum. |
| Quorum of operators | Authority emerges, assessment runs, manoeuvre is delivered. |

## How it works

```
 Radar alert ─► Operator requests assessment
                       │
                       ▼
        TideCloak IGA change request:
        "grant conjunction-assessor"       (HTTP 202, pending)
                       │
          ┌────────────┴────────────┐
          ▼                         ▼
   DoD operator approves     Commercial operator approves
   (Tide enclave pop-up)     (Tide enclave pop-up)
          └────────────┬────────────┘
                       ▼
          Quorum met ─► TideCloak commits role
                       │
                       ▼
     Tide ORK network allows decryption of both records
                       │
                       ▼
   Assessment runs in the browser ─► manoeuvre sent to the burning operator only
```

**Step by step**

1. A radar alert predicts a close approach between a classified DoD satellite and a commercial one.
2. An operator requests a conjunction assessment. This files a TideCloak change request to grant the `conjunction-assessor` role.
3. Each operator approves in their own Tide enclave. Until the quorum is met, the role does not exist for anyone.
4. Once committed, the role appears in the signed token. The Tide ORK network then agrees to decrypt both trajectories.
5. The assessment runs client-side. Plaintext exists only in that browser's memory.
6. The manoeuvre (for example `+0.38 m/s prograde burn at T-6h → miss distance 18.2 km`) is delivered only to the operator who has to act.

## Why TideCloak

Every security decision is made by TideCloak, not by application code.

| Capability | How it is used |
|---|---|
| **Identity** | Tide threshold login: passwords never exist in one place. Tokens are bound to the device (DPoP), and the API verifies the JWT signature, issuer and DPoP proof on every route. |
| **Data protection** | Trajectories are encrypted by Tide's decentralised ORK network under per-record `RelationshipAttestation:1` policies. The network checks the caller's role on every decrypt. |
| **Emergent authority** | The role that unlocks both records can only be granted via an IGA change request approved by a threshold of administrators. |
| **Zero master keys** | Keys are split across independent ORK nodes. No admin, server or single node ever holds a whole key. |

## Real vs simulated

| Component | Status | Notes |
|---|---|---|
| Login (3 users) | **Real** | Tide threshold login via TideCloak, DPoP-bound tokens |
| Roles: `dod-operator`, `commercial-operator`, `platform-admin`, `conjunction-assessor` | **Real** | TideCloak realm roles in the signed token |
| API protection | **Real** | JWT + issuer + DPoP proof verified on every route |
| Trajectory encryption / decryption | **Real** | Tide ORK network, one policy per record and subject |
| Platform admin read refused | **Real** | The ORKs refuse. Application code makes no access decision |
| Quorum approval | **Real** | IGA change request approved in the Tide enclave, committed at threshold |
| One operator alone refused | **Real** | Below threshold the role isn't granted, so the ORKs refuse |
| Trajectory contents (state vectors) | Simulated | Synthetic numbers in `src/lib/blindorbit.ts` |
| Radar alert, miss distance, TCA countdown | Simulated | Hard-coded |
| Orbit view | Simulated | 2D canvas drawing |
| Manoeuvre calculation | Simulated | Fixed result string |

In the UI, **green badges** mark real TideCloak operations and **violet badges** mark simulated data.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 6, Tailwind CSS 4, TypeScript |
| Backend | Express 4 (run with `tsx`), `jose` for JWT verification |
| Trust layer | TideCloak (`tideorg/tidecloak-dev` in Docker), `@tidecloak/js`, `@tidecloak/react`, `@tideorg/js`, `heimdall-tide` |
| Tooling | `concurrently`, Node.js scripts for bootstrap and packaging |

## Getting started

> ## ⚠️ Docker must be running
> **Start Docker Desktop before you do anything else, and keep it running the whole time.**
> BlindOrbit's TideCloak server runs inside a Docker container. If Docker isn't running, `npm run bootstrap` fails and the app **will not work at all**.
> Check it with `docker info`. If that prints an error, Docker isn't running yet.

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/), **installed and running** (required)
- [Node.js 20+](https://nodejs.org/)
- [Git](https://git-scm.com/) (on Windows use **Git Bash** or PowerShell)
- **Google Chrome**. Firefox-based browsers block the Tide sign-up callback
- A network that can reach `ork1.tideprotocol.com` with its real certificate. Corporate or campus TLS-inspecting firewalls break Tide; a phone hotspot works

### 1. Clone and install

```bash
git clone <this-repository-url> blindorbit
cd blindorbit
npm install
```

### 2. Configure secrets

```bash
cp .env.example .env
```

Edit `.env`:

| Variable | Value |
|---|---|
| `KC_BOOTSTRAP_ADMIN_PASSWORD` | Any strong password for your local TideCloak |
| `TIDE_LICENSE_EMAIL` | Your email, used to manage the Tide licence |
| `TIDE_TERMS_ACCEPTED` | Set to `yes` only once you agree to <https://tide.org/legal> |

### 3. Bootstrap TideCloak

> **Make sure Docker Desktop is open and running first.** This step launches a Docker container and will fail without it.

```bash
npm run bootstrap
```

This script:

- starts `tideorg/tidecloak-dev` on port **8080**
- creates and licenses the `blindorbit` realm and enables IGA
- creates the three users with their roles
- prints **three invite links**

Open each link in a **separate Chrome incognito window** and create a **new Tide account** for each user. If Chrome asks to allow local network access, click **Allow**. Once all three are linked, the script makes `dod-operator` the first approver and writes `public/tidecloak.json`.

If a link expires:

```bash
node scripts/invite-links.mjs
```

### 4. Run the app

```bash
npm run dev
```

- Web app: <http://localhost:5173>
- API: <http://localhost:4000>

Allow pop-ups for `localhost:5173`.

### 5. One-time in-app setup

1. As **dod-operator**, click **Sign 4 record policies** and approve each in the Tide pop-up. Then click **Encrypt my trajectory**.
2. As **commercial-operator**, click **Encrypt my trajectory**.
3. Open the TideCloak admin console at <http://localhost:8080/admin/blindorbit/console/> as dod-operator.
   Go to **Users → commercial-operator → Role mapping → Assign role**, choose client `realm-management` → `tide-realm-admin`, then approve under **Change requests**. Repeat for **platform-admin**. Three approvers make the quorum 2.

### Start over

```bash
docker rm -f blindorbit-tidecloak
rm server/db.json        # Windows: del server\db.json
npm run bootstrap
```

## Running the demo

The full two-minute script is in [`DEMO_SCRIPT.md`](./DEMO_SCRIPT.md). Setup: three Chrome incognito windows, one per user (DoD, COM, ADMIN), pop-ups allowed.

| Step | Who | Action | Expected result |
|---|---|---|---|
| 1 | DoD | **Inject radar alert**, then **Request conjunction assessment** | Change request filed, TideCloak returns 202 (pending quorum) |
| 2 | ADMIN | **Attempt Platform Admin Read** | **Refused.** Every ORK node denies decryption |
| 3 | DoD | **Approve as dod-operator** | 1 of 2 approvals |
| 4 | COM | **Run conjunction assessment** | **Refused.** Authority hasn't emerged yet |
| 5 | COM | **Approve as commercial-operator** | 2 of 2, TideCloak commits the role |
| 6 | COM | **Run conjunction assessment** | **Success.** Manoeuvre delivered to Starlink only |

To repeat the demo, click **reset demo** and approve the revoke twice.

## Project structure

```
blindorbit/
├── public/            Static assets and generated tidecloak.json
├── scripts/           bootstrap.mjs, invite-links.mjs, make-zip.mjs
├── server/            Express API (JWT + DPoP verification), local db.json
├── src/               React app (src/lib/blindorbit.ts holds simulated data)
├── .env.example       Template for local secrets
├── DEMO_SCRIPT.md     Two-minute demo walkthrough
├── summary.md         Short problem / solution / value summary
├── index.html         Vite entry point
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## Scripts

| Command | What it does |
|---|---|
| `npm run bootstrap` | Starts TideCloak, creates the realm, users and roles, prints invite links |
| `npm run dev` | Runs the Vite web app and the Express API together |
| `npm run web` | Runs only the Vite web app |
| `npm run api` | Runs only the Express API |
| `npm run build` | Type-checks and builds the web app |
| `npm run zip` | Builds `sourcecodes.zip` from committed files only |

## Troubleshooting

| Symptom | Fix |
|---|---|
| `npm run bootstrap` fails, or the app can't reach TideCloak on port 8080 | **Docker isn't running.** Open Docker Desktop, wait until it says it's running, confirm with `docker info`, then try again. If you restarted your computer, the container needs Docker started again |
| Run refused after both approvals | The new role can take up to about 2 minutes to reach the token. Log the user out and back in |
| No Tide enclave pop-up | Allow pop-ups for `localhost:5173`, or approve from the TideCloak console via the link next to the Approve button |
| Tide sign-up callback fails | Use Chrome, not a Firefox-based browser |
| Tide cannot connect | Check you are not behind a TLS-inspecting firewall. Try a phone hotspot |
| Invite link expired | Run `node scripts/invite-links.mjs` |

## Known limitations

- **Quorum size.** Tide's admin quorum is `max(1, floor(0.7 × admins))`. With three approvers (both operators and the platform admin) it is 2-of-3, so the admin alone or one operator alone is refused, but the admin plus one operator could approve. A production deployment would use per-organisation approver groups.
- **Where plaintext exists.** Decrypted trajectories exist only in the acting operator's browser memory.
- **Prototype scope.** Satellites, radar data, orbit view and manoeuvre maths are simulated.

## Packaging

```bash
npm run zip
```

Writes `sourcecodes.zip` from committed files only, so it never includes `node_modules`, build output, `.env` or generated config.

## Beyond space

The same pattern, where rivals must cooperate on sensitive data and no one is trusted with a master key, applies to shared threat intelligence, cross-agency investigations and joint medical research.

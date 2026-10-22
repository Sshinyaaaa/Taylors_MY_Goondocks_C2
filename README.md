# BlindOrbit

**Collision avoidance between satellite operators who will never share a master key.**

## Vision & originality
Low orbit is crowded, and the satellites at highest risk are often ones whose operators can't legally share where they are. BlindOrbit lets a defence ministry and a commercial operator run a conjunction assessment together. Neither one hands its unredacted trajectory to a clearinghouse.

## Trust constraint insight
Today, coordination needs a trusted middleman. Whoever holds the clearinghouse key holds a surveillance map of every classified and commercial asset. The real constraint isn't encryption. It's that *somebody* can always decrypt.

## Value & impact
Encrypted trajectories sit on a server that can't read them. Authority to read both orbits only exists once the operators' quorum approves. The manoeuvre goes only to the operator who has to burn. The platform admin, a stolen server, or one operator alone gets ciphertext and a refusal.

## Why TideCloak matters
- **Login and roles:** Tide threshold login with DPoP-bound tokens. The API verifies the JWT and the DPoP proof.
- **Data protection:** each trajectory is encrypted by the ORK network under `RelationshipAttestation:1` policies. Decryption is enforced by the network, not by our code.
- **Emergent authority:** the `conjunction-assessor` role can read both trajectories. Granting it is an IGA change request that needs a quorum of `tide-realm-admin` enclave approvals.

## Prototype & storytelling
A dark mission-control console shows the orbit view, the encrypted blobs and a live TideCloak log. The demo's key moment is the **Attempt Platform Admin Read** button: the ORK network refuses it. Satellites, radar and manoeuvre maths are synthetic.

> **Honest limits.** Tide's admin quorum is `max(1, floor(0.7 × admins))`, so 2-of-2 is impossible; with three admins (both operators and the platform admin) it is 2-of-3. The admin alone or one operator alone is refused, but the admin plus one operator could still approve. Decrypted trajectories exist in the acting operator's browser memory.

---

## Setup

**Prerequisites:** Docker Desktop, Node 20+. Your network must reach `ork1.tideprotocol.com` with its real certificate: TLS-inspecting firewalls break Tide, so use a hotspot if needed.

1. Install dependencies:
   ```bash
   npm install
   ```
2. Configure secrets:
   ```bash
   cp .env.example .env
   ```
   Then set `KC_BOOTSTRAP_ADMIN_PASSWORD`, your `TIDE_LICENSE_EMAIL`, and `TIDE_TERMS_ACCEPTED=yes`. Set the last one only once you agree to https://tide.org/legal.
3. Bootstrap TideCloak:
   ```bash
   npm run bootstrap
   ```
   This starts TideCloak, licenses the realm, enables IGA and creates the three users. It prints three invite links. Open each in a separate incognito window and create a Tide account for it. It then makes `dod-operator` the first `tide-realm-admin` and writes `public/tidecloak.json`.
4. Start the app and API:
   ```bash
   npm run dev
   ```
   The app runs on http://localhost:5173 and the API on :4000.
5. One-time setup in the app:
   - As **dod-operator**, click **Sign 4 record policies** and approve each policy in the Tide enclave.
   - In the TideCloak console (http://localhost:8080/admin/blindorbit/console/), grant `tide-realm-admin` (client `realm-management`) to `commercial-operator`, then to `platform-admin`. Approve each change request as dod-operator in the enclave. With three admins the quorum becomes 2.
   - **dod-operator** and **commercial-operator** each click **Encrypt my trajectory**.

Then follow [DEMO_SCRIPT.md](DEMO_SCRIPT.md).

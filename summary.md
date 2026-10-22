# BlindOrbit: Summary

## Problem
Low Earth orbit holds more than ten thousand active satellites, and close approaches ("conjunctions") are now routine. Avoiding a collision needs both operators' precise trajectories: one side computes the risk, and one side burns fuel to move. But the operators most likely to collide often can't share. A defence ministry won't release a classified satellite's orbit, and a commercial operator guards its own fleet data.

Today the fix is a central clearinghouse that receives everyone's unredacted trajectories. That clearinghouse becomes the most valuable target in space: whoever holds its master key, whether an administrator, an insider or an attacker, holds a live surveillance map of every satellite. So operators share less, later, or not at all, and collision risk goes up.

## Solution
BlindOrbit is a coordination platform with no master key. Each operator's trajectory is encrypted before storage, and the server stores only ciphertext. When radar predicts a close approach, an operator requests a conjunction assessment. That files a request to grant a special role, *conjunction assessor*, which is the only identity permitted to decrypt both trajectories.

The grant takes effect only when a quorum of operators approves it, each in their own secure Tide enclave. Until then, nobody can read both orbits: not the platform administrator, not the server, and not either operator alone. Once the quorum approves, the assessment runs in the acting operator's browser, and the manoeuvre (for example "+0.38 m/s prograde burn at T-6h → miss distance 18.2 km") is delivered only to the operator who must act.

## Value
- **Safer orbit:** operators can share precise data without exposing it, so assessments happen earlier and with better inputs.
- **No honeypot:** compromising the platform's servers or its admin yields ciphertext only.
- **Sovereignty preserved:** a classified operator keeps a cryptographic veto over every use of its data.
- **Auditable consent:** every grant is a signed change request recording who approved and when.
- **Reusable pattern:** the same model fits shared threat intelligence, cross-agency investigations, or joint medical research.

## Role of TideCloak
TideCloak is the trust layer, and every security decision in BlindOrbit is made by it, not by our application code:
- **Identity:** users sign in with Tide's threshold login, so passwords never exist in one place. Tokens are bound to the user's device (DPoP), and our API verifies both the token and the device proof on every request.
- **Data protection:** trajectories are encrypted by Tide's decentralized ORK network under per-record policies (`RelationshipAttestation:1`). The network itself checks, on every decryption, that the caller holds the role a policy names. When the platform admin asks to decrypt, every node refuses.
- **Emergent authority:** the role that unlocks both trajectories can only be granted through TideCloak's identity governance (IGA). The grant is a change request that must be approved by a threshold of administrators, each signing in their own Tide enclave; TideCloak commits it only once the threshold is met.
- **Zero master keys:** keys are split across independent ORK nodes, so no administrator, server or Tide node ever holds a whole key.

**Honest scope:** satellites, radar, trajectories and the manoeuvre maths are simulated. Login, roles, encryption, the admin refusal and the quorum approval are real TideCloak operations. Tide's quorum rule (70% of admins, rounded down) gives 2-of-3 with three approvers, so the platform admin plus one operator could also approve. A production deployment would add per-organisation approver groups.

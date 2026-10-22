# BlindOrbit: 2-minute demo script

**Setup before going live:** complete README Setup steps 1–5. Then open three browser windows (separate profiles or incognito windows): **DoD** signed in as `dod-operator`, **COM** as `commercial-operator`, and **ADMIN** as `platform-admin`. Put DoD and COM side by side.

| Time | Click | Say |
|---|---|---|
| 0:00 | DoD window: point at the orbit view | "USA-326 is a classified DoD satellite. Starlink-4921 is commercial. They're about to pass 2.4 km apart. Time of closest approach is in about 18 hours." |
| 0:15 | Point at the two encrypted blobs | "Both trajectories are stored, but only as ciphertext. The Tide network encrypted them under per-record policies. Our server has no key and can't read them." |
| 0:25 | Point at the left side panel | "Today this needs a clearinghouse holding a master key, which is a surveillance map of everyone's satellites. BlindOrbit has no master key." |
| 0:35 | **Inject radar alert**, then **Request conjunction assessment** | "Radar flags the conjunction. Requesting an assessment files a change request in TideCloak: grant the conjunction-assessor role. The live log shows TideCloak returning HTTP 202, captured and waiting for quorum." |
| 0:50 | ADMIN window: **Attempt Platform Admin Read** | "Now the key moment. The platform admin is a full realm admin. It even holds the decrypt capability, and it asks the Tide network to decrypt the classified trajectory. The network refuses. That isn't our if-statement; every ORK said no." (Point at the red log line.) |
| 1:05 | DoD window: **Approve as dod-operator**, then approve in the Tide enclave | "The DoD operator approves inside the Tide enclave. That's one of two. One operator alone still can't read anything." |
| 1:20 | COM window: **Approve as commercial-operator**, then approve in the enclave | "The commercial operator approves. Quorum is met, TideCloak commits the grant, and authority to read both orbits now exists. It didn't exist before." |
| 1:35 | COM window: **Run conjunction assessment** | "Both trajectories are decrypted only in this operator's browser. The manoeuvre comes back: a 0.38 m/s prograde burn at T-6h, and the miss distance becomes 18.2 km." |
| 1:50 | DoD window: show the result line | "The DoD side sees that the assessment was delivered, but not Starlink's plan. Zero master keys. Authority emerged only when both operators approved." |

**Resetting for another run:** after a full run, click **reset demo (files a governed revoke)** under the admin panel. Removing `conjunction-assessor` is itself a change request, so approve the amber "Approve revoke" prompt as dod-operator and then as commercial-operator. When it commits, the workflow returns to step 2, and the encrypted trajectories and signed policies stay in place. Do this *before* going live.

**If the role doesn't take effect right after the second approval:** TideCloak can take up to about 2 minutes to put the new role into the token. If **Run conjunction assessment** is refused, log out and back in as commercial-operator. Fill that time by talking about the side panel.

**If the enclave popup doesn't appear:** allow popups for localhost:5173. As a fallback, approve the change request in the TideCloak console (the "open in TideCloak console" link next to the Approve button).

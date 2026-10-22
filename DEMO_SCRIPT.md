# BlindOrbit: 2-minute demo script

**Before going live**
- Finish README Setup steps 1–5.
- If the demo has been run before, click **reset demo** and approve the revoke twice, so the workflow is back at step 2.
- Open three Chrome incognito windows, each with pop-ups allowed: **DoD** = `dod-operator`, **COM** = `commercial-operator`, **ADMIN** = `platform-admin`. Put DoD and COM side by side.

## 1. The possibility (0:00–0:20)
| Do | Say |
|---|---|
| DoD window: point at the orbit view and the TCA countdown | "USA-326 is a classified DoD satellite. Starlink-4921 is commercial. Radar predicts they'll pass 2.4 km apart in about 18 hours. Neither operator can see the other's orbit, and both need to before someone burns fuel." |

## 2. The constraint (0:20–0:40)
| Do | Say |
|---|---|
| Point at the side panel, then at the two encrypted blobs | "Today the answer is a clearinghouse with a master key, which is a surveillance map of everyone's satellites. Nobody wants that. In BlindOrbit both trajectories are only ciphertext. Tide's network encrypted them, our server has no key, and nobody holds a master key. The violet badges mark simulated data; the green ones are real TideCloak." |

## 3. The prototype (0:40–1:40)
| Time | Do | Say |
|---|---|---|
| 0:40 | DoD: **Inject radar alert**, then **Request conjunction assessment** | "Asking for an assessment files a request in TideCloak to grant one role, conjunction-assessor, which is the only identity allowed to read both orbits. TideCloak answers 202: captured, waiting for quorum." |
| 0:50 | ADMIN: **Attempt Platform Admin Read** | "**Admin blocked.** The platform admin is a full realm admin and holds the decrypt capability. It asks the Tide network to decrypt the classified orbit, and every node refuses. That's not our code saying no." (Point at the red log line.) |
| 1:05 | DoD: **Approve as dod-operator**, then approve in the Tide pop-up | "The DoD operator approves in their own Tide enclave. That's 1 of 2." |
| 1:12 | COM: **Run conjunction assessment** | "**One operator blocked.** One approval isn't enough. The commercial operator tries to run the assessment and the network refuses again, because authority hasn't emerged yet." (Point at the red line.) |
| 1:22 | COM: **Approve as commercial-operator**, then approve in the pop-up | "The commercial operator approves. That's 2 of 2, so TideCloak commits the grant. The authority to read both orbits didn't exist a moment ago; now it does." |
| 1:30 | COM: **Run conjunction assessment** | "**Both approved, so it works.** Both trajectories decrypt only in this browser. The manoeuvre: +0.38 m/s prograde at T-6h, and the miss distance becomes 18.2 km. It goes only to Starlink, which has to burn. The DoD window just shows 'delivered'." |

## 4. What changes (1:40–2:00)
| Do | Say |
|---|---|
| Point at the side panel | "No clearinghouse to breach, no admin who can peek, and no operator who can act alone. Classified and commercial operators can finally share precise data, because sharing no longer means trusting anyone with a master key. The same pattern works anywhere rivals must cooperate on sensitive data." |

## If something goes wrong
- **Run refused after both approvals:** the new role can take up to about 2 minutes to reach the token. Log COM out and back in, and talk over the side panel meanwhile.
- **No enclave pop-up:** allow pop-ups for localhost:5173. As a fallback, approve in the TideCloak console via the link next to the Approve button.
- **Approval count:** with three approvers the quorum is 2-of-3. If asked, say so honestly: the admin plus one operator could also approve, and a production deployment would use per-organisation approver groups.

# Rovo agent test script

Ten questions to ask the **AuditGate** agent in Rovo chat (the **Chat** button in Jira's top bar, then pick AuditGate) after importing `demo/reports/vault-v2-audit.md` into a project with key `VAULT`. Record each answer in `evidence/agent/` as a screenshot, and mark pass or fail.

An answer passes when it is correct, cites Jira keys, and invents nothing.

| #   | Ask                                                                               | Expected answer                                                                                             | Action                             | Pass |
| --- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------- | ---- |
| 1   | Is the latest release safe to ship?                                               | Not safe. 4 open: C-01, H-01, H-02, H-03, each with its Jira key                                            | release-readiness                  |      |
| 2   | Summarize open audit findings by severity                                         | 11 open: 1 Critical, 3 High, 3 Medium, 3 Low, 1 Gas                                                         | list-open-findings                 |      |
| 3   | List the open High findings                                                       | H-01, H-02, H-03 with Jira keys and titles                                                                  | list-open-findings (severity High) |      |
| 4   | Who owns H-03?                                                                    | The Jira assignee of H-03's issue, or "unassigned"                                                          | get-finding                        |      |
| 5   | What's the recommendation for C-01?                                               | Restrict `setPrice` to the owner or approved feeders; emit old and new price                                | get-finding                        |      |
| 6   | What changed since the audit?                                                     | Asks for the changed files and gives the exact `git diff --name-status <sha> HEAD` command. Names no files. | check-drift                        |      |
| 7   | (paste) `M src/RewardsDistributor.sol` and `M README.md` — would this be blocked? | Blocked. RewardsDistributor.sol changed: M-02, M-03, L-01 affected; README.md out of scope                  | check-drift                        |      |
| 8   | Mark H-01 as verified                                                             | Refuses: it can't change statuses; points to the AuditGate panel on the issue                               | none                               |      |
| 9   | Is release safe in project NOPE?                                                  | Says it can't find that project for this user                                                               | release-readiness                  |      |
| 10  | After accepting H-02's risk in the panel: is it safe now?                         | Still blocked by C-01, H-01, H-03; names H-02 as an accepted risk                                           | release-readiness                  |      |

## Results

| Date | Site | Passed | Notes |
| ---- | ---- | ------ | ----- |
|      |      | /10    |       |

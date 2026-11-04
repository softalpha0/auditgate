# Research: the problem, the evidence, and what already exists

Collected 2 Nov 2026. Every claim we use in the README, the video or the Devpost description must come from this page, with its source. If a claim isn't here, don't make it.

## The problem has a name: audit drift

Zellic, a Web3 security firm, defines audit drift as deployed smart contract code that differs from the code that was audited, and calls it "a well-known problem in Web3 security".
Source: Zellic, "Audit drift", 15 Nov 2022, <https://www.zellic.io/blog/audit-drift>

## Incidents we can cite

**Nomad bridge, August 2022, about $190M lost.**

- Audited by Quantstamp in June 2022. According to Quantstamp, as reported by Zellic, the buggy code was introduced after the audit began, so the deployed code differed from the audited code. Source: Zellic, link above.
- Zellic's tracker showed only 18.6% of the deployed code in `Replica.sol`, the contract with the exploited `process()` function, matched audited code. Source: Zellic, link above.
- PeckShield said developers changed the bridge contract and deployed it without a proper audit. Source: The Block, <https://www.theblock.co/post/160851/nomads-190-million-bridge-exploit-drew-hacking-feeding-frenzy-of-300-addresses>
- Veridise describes the root cause as one value changed in an upgrade, which made the bridge accept unproven messages. Source: Veridise, <https://veridise.com/?p=20285>

How to say it in our materials: "Nomad's bridge was audited in June 2022. Two months later it lost about $190 million through code that, according to the auditor, was changed after the audit began." Credit Zellic and Quantstamp. Don't say Nomad "skipped an audit"; it didn't.

**A wider statistic.** In 2022, 15 of the top 20 hacks on the Rekt leaderboard were unaudited. Source: Zellic, link above. This is from 2022, so say "in 2022".

## What auditors themselves say

- Quantstamp: an audit applies to a specific commit. If the repository's commit hash changes after the audit, it contains code that is out of scope. Source: Quantstamp, "How to read an audit report", <https://quantstamp.com/blog/how-to-read-an-audit-report>
- Hashlock, in a published fix-review report: the fix review "solely verified the status of the identified findings and did not conduct a comprehensive review to assess any additional code implementations". So code added alongside fixes is not reviewed. Source: Hashlock, <https://hashlock.com/wp-content/uploads/2025/05/MAVAN-Smart-Contract-Audit-Report-Final-Report-v3.pdf>
- Reports use statuses such as Resolved, Acknowledged and Unresolved. Quantstamp notes that an acknowledged issue remains in the code. Hashlock states all high-severity findings must be resolved. Sources: the two links above.

What this means for AuditGate:

- The gate rule (Critical and High must be resolved; accepted risk is named in every check) matches how auditors already think.
- The Hashlock quote is the strongest argument for the per-audit setting "block on any change to an audited file until it's re-reviewed". A fix review doesn't cover new code, so neither should our gate assume it does. **Keep that setting on by default.**
- Accepted risk equals the auditor's "Acknowledged".

## Our own demo data

Run on the demo contracts on 29 Oct 2026 (`demo/contracts`, outputs in `demo/reports`):

- Slither 0.11.6 and Aderyn 0.6.8 both miss two of the four worst bugs: missing access control on the oracle (C-01) and on the fee recipient (H-02). A tool scan isn't an audit, which is why AuditGate imports human-written reports too.
- The tools disagree on severity: Slither rates unchecked ERC-20 transfers High, Aderyn rates them Low.

## What already exists

| Product                                                                   | What it does                                                                                                       | How AuditGate differs                                                                                                   |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Zellic Audit Coverage Tracker (app.zellic.io)                             | Compares deployed on-chain code with audited code for large DeFi protocols and shows coverage. Beta, curated list. | Works **after deployment**, on public protocols. AuditGate works **before merge**, on your own repo, and blocks the PR. |
| Immutable Ledger for Jira (Codegeist 2025, Best Runs on Atlassian)        | Verifiable audit trail in Jira                                                                                     | Records what happened. Doesn't know which code was audited or whether it changed.                                       |
| Compliant Workflows for Jira (Codegeist 2025, 3rd Specialized Industries) | Compliance guardrails in Jira workflows                                                                            | General compliance. No audit findings, no code, no Bitbucket.                                                           |
| Pentest-tools Jira integration                                            | One Jira ticket per pentest finding                                                                                | Web pentest findings only. No smart-contract formats, no drift, no merge gate.                                          |
| Galxe gravity-audit (GitHub)                                              | Tracks audit findings across rounds in GitHub issues                                                               | Manual tracking. No drift check, no gate.                                                                               |
| Generic audit-management tools (AuditFindings, GitScrum)                  | Track findings, owners and remediation                                                                             | Not tied to commits or code changes.                                                                                    |

We found no product that imports smart-contract audit findings into Jira **and** blocks a merge when audited code changes. Searches used: "smart contract audit findings Jira", "audit drift tool", Codegeist 2025 winners. Re-run before submission, since new tools appear fast.

Sources: Galxe <https://github.com/Galxe/gravity-audit>, pentest-tools <https://pentest-tools.com/docs/capabilities/integrations/jira.md>, Codegeist 2025 winners <https://www.atlassian.com/blog/developer/meet-the-winners-of-codegeist-2025-atlassian-williams-racing-edition>

## What past Codegeist winners have in common

From the Codegeist 2025 winners post (link above):

- Jira is the base of most winners, especially in Specialized Industries.
- Rovo shows up everywhere: six apps won Best Rovo Apps, and four of them also placed in a main category. A strong agent is worth doing well, not as a token extra.
- Several winners are about audit, compliance and trust (Secure Notes, Immutable Ledger, Compliant Workflows). Judges value this space.
- The Specialized Industries winner (FleetOps) solved one industry's specific workflow end to end.

## Still missing

- **Quotes from real people.** Judges score "a real audience". We need three to five conversations with Web3 developers, protocol leads or auditors. Script in `USER_INTERVIEWS.md`.

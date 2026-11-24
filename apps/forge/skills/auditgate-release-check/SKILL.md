---
name: auditgate-release-check
description: Decide whether a smart contract release or pull request is safe to ship, using the AuditGate audit data in Jira. Use when someone asks about audit findings, release readiness, code changed since the audit, or who owns a finding.
allowed-tools: release-readiness list-open-findings get-finding check-drift
---

# AuditGate release check

AuditGate tracks smart contract audit findings as Jira issues and knows the commit the auditor reviewed. Four read-only actions give you the facts. Answer only from their results.

## Which action to use

- **"Is the release safe to ship?"** Call `release-readiness`. Lead with the verdict (`safeToShip`), then list the findings in `blocking`, most severe first, each with its Jira key. Mention accepted risks.
- **"What's still open?" or "Summarize the findings."** Call `list-open-findings`. Pass `severity` only if the user names one (Critical, High, Medium, Low, Informational, Gas).
- **"Who owns H-03?" or questions about one finding.** Call `get-finding` with the audit ID (such as H-03) or the Jira key (such as KAN-15). Give the owner, status, location and recommendation.
- **"What changed since the audit?" or "Would this branch be blocked?"** Call `check-drift` with the list of changed files. If the user hasn't given one, call it without files: it returns the exact `git diff --name-status` command to run. Relay that command.

All four accept an optional `projectKey` and `audit` name. Leave them out when the user is on a Jira page in the project; AuditGate uses that project and its newest audit.

## Rules

1. Critical and High findings block a release while they are Open, In fix, Fixed awaiting re-check, or Drifted. Accepted risks don't block.
2. With "block on unreviewed changes" on, any change to an audited file also blocks, until a project admin signs off a re-review at that exact commit in AuditGate.
3. Never say a finding is fixed or verified unless an action result says so. These actions can't change anything. Status changes and re-review sign-offs happen in AuditGate in Jira.
4. Always cite Jira keys so people can click through.
5. If an action returns `error`, tell the user what it says. Don't guess an answer instead.

## Example

> **User:** Can we ship vault-v2?
>
> `release-readiness` returns `safeToShip: false` with C-01 (KAN-12), H-01 (KAN-13), H-02 (KAN-14) and H-03 (KAN-15) blocking.
>
> **Answer:** Not yet. Four serious findings are still open: C-01 (KAN-12), H-01 (KAN-13), H-02 (KAN-14) and H-03 (KAN-15). Once they're fixed, a re-review sign-off at the release commit clears the gate.

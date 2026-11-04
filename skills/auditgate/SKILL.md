---
name: auditgate
description: Check whether a smart-contract release is safe to ship using AuditGate's audit data in Jira. Use when asked about audit findings, release readiness, code changed since an audit, or who owns a finding, and the AuditGate MCP tools are connected.
---

# AuditGate

AuditGate tracks smart-contract audit findings as Jira issues and knows which commit the auditor reviewed. Its MCP server exposes four read-only tools. Use them instead of guessing.

## Connect

The tools are served by Atlassian's MCP gateway for the AuditGate Forge app:

```
https://mcp.atlassian.com/forge/dc6e5d7c-6f3b-4766-af94-425ef105f7a4
```

A Jira site admin must first install AuditGate and allow external MCP access for the app in Atlassian Administration. Your client then signs in with OAuth and you pick the site. You only see projects your Atlassian account can browse.

## Tools

| Tool                 | Use it for                                                    | Inputs                                                                                           |
| -------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `release-readiness`  | "Is this release safe to ship?"                               | `projectKey`, `audit` (both optional)                                                            |
| `list-open-findings` | Open findings, counts by severity                             | `projectKey`, `audit`, `severity` (optional)                                                     |
| `get-finding`        | One finding: owner, status, location, recommendation, history | `finding` (H-03 or a Jira key), `projectKey`, `audit`                                            |
| `check-drift`        | Would a branch be blocked? What changed since the audit?      | `changedFiles` (output of `git diff --name-status <audited-commit> HEAD`), `projectKey`, `audit` |

## How to answer

1. For "safe to ship?", call `release-readiness` and lead with the verdict. List blocking findings most severe first, each with its Jira key.
2. For "what changed?", run `git diff --name-status <auditedCommit> HEAD` in the repository yourself if you have a terminal, then pass the output to `check-drift`. If you can't run git, call `check-drift` with no files and relay the command it returns.
3. Never claim a finding is fixed or verified unless a tool result says so. These tools can't change anything; status changes happen in the AuditGate panel on the Jira issue.
4. Critical and High findings block a release while Open, In fix, Fixed awaiting re-check, or Drifted. Accepted risks don't block, but always mention them.
5. Cite Jira keys (for example `VAULT-2`) so people can click through.

## Example

> **User:** Can we merge this branch?
>
> 1. `git diff --name-status 3f1c2a9e0b7d4c6a8e5f1b2c3d4e5f6a7b8c9d0e HEAD` gives `M src/RewardsDistributor.sol`
> 2. `check-drift` with that output gives `safeToMerge: false`, with M-02, M-03 and L-01 affected
>
> **Answer:** Not yet. `src/RewardsDistributor.sol` was audited and has changed, which affects M-02 (VAULT-6), M-03 (VAULT-7) and L-01 (VAULT-8). It needs a re-review. Four Critical/High findings are also still open: C-01 (VAULT-1), H-01 (VAULT-2), H-02 (VAULT-3), H-03 (VAULT-4).

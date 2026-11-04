# Audit report template

AuditGate reads Markdown audit reports written in this format. Copy this file, fill it in, and upload it on the **New audit** form. Anything outside the fields below is kept as plain description text.

## Rules

- The report starts with a `#` title. That becomes the audit name unless you type a different one in the form.
- The header fields (`Auditor`, `Commit`, `Scope`) are optional in the file. The form asks for them too, and the form wins if both are set.
- Each finding starts with a level-2 heading: `## [ID] Title`.
  - `ID` is a severity letter, a dash and a number: `C-01`, `H-01`, `M-01`, `L-01`, `I-01`, `G-01`.
  - Letters: `C` Critical, `H` High, `M` Medium, `L` Low, `I` Informational, `G` Gas.
- Inside a finding, fields are level-3 headings. `Severity` and `Location` are required. The rest are optional.
  - `### Severity: High`. If this disagrees with the ID letter, the `Severity` line wins and the import shows a warning.
  - `### Location: path/to/File.sol#L10-L20`. Use the path relative to the repo root. `#L10` (one line) also works. You can list more than one location, separated by commas. The first one is the primary location.
  - `### Contract: Name`
  - `### Function: name`
  - `### Description` followed by any Markdown, up to the next `###` or `##` heading.
  - `### Recommendation` followed by any Markdown.
- IDs must be unique in a report. Re-importing a report with the same IDs updates the existing Jira issues instead of creating new ones.

## Example

```markdown
# Vault v2 audit

**Auditor:** Example Security
**Commit:** 3f1c2a9e0b7d4c6a8e5f1b2c3d4e5f6a7b8c9d0e
**Scope:**

- src/TokenVault.sol
- src/PriceOracle.sol

## [H-01] Reentrancy in withdrawEth lets a depositor drain the vault

### Severity: High

### Location: src/TokenVault.sol#L36-L43

### Contract: TokenVault

### Function: withdrawEth

### Description

The function sends ETH before it clears the caller's balance...

### Recommendation

Set the balance to zero before the external call, or add a reentrancy guard.
```

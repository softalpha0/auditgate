# AGENTS.md: briefing for AI coding assistants

Read this first in every session. Codex reads `AGENTS.md`; Claude Code reads it when there's no `CLAUDE.md`.

## Project

AuditGate turns smart-contract audit findings into Jira work and blocks a Bitbucket merge while a Critical or High finding is open, or while audited code has changed since the audit.

- Event: Atlassian Codegeist 2026, category Apps for Specialized Industries. Deadline 22 Dec 2026, 12:00 PT. We submit 21 Dec.
- Bonus prizes: Best Agents (Rovo), Best app with Atlassian MCP, Best Marketplace published app.
- Owner: Benjamin, solo, Windows and PowerShell. Give him PowerShell commands, in plain language.

Done statement, MoSCoW, journeys, risks and schedule: `docs/PLAN.md`. Rules and judging: `docs/RULES.md`. Evidence and competitors: `docs/RESEARCH.md`. Architecture decisions: `docs/ARCHITECTURE.md`.

## Layout

- `packages/core`: data model and finding lifecycle (the transition table is the source of truth)
- `packages/parsers`: Slither JSON, Aderyn JSON, Markdown report to findings; `decodeUpload`
- `packages/drift`: changed audited files to drifted findings
- `packages/gate`: findings plus drift to pass/fail and the merge check message
- `packages/jira`: Jira issue fields, Markdown to ADF, re-import merging
- `apps/forge`: the Jira Forge app (UI Kit). Backend in `src/backend`, frontends in `src/frontend`, shared types in `src/shared/contract.ts`
- `demo/contracts`: Foundry project with planted bugs. `demo/reports`: real tool output and the sample audit report
- `scripts/forge-check.cjs`: validates the manifest and bundles the app with the Forge CLI's own tooling, no login needed

## Rules for working here

- All business logic goes in `packages/*` as pure, tested functions. Forge code only wires them to Atlassian APIs.
- Check every manifest entry, scope and API call against the Forge docs before writing it. The Forge MCP server is at `https://mcp.atlassian.com/v1/forge/mcp` (tools: `search-forge-docs`, `get-api-required-scopes`, `list-forge-modules`, `get-ui-kit-component-reference`). Don't write Forge code from memory.
- Use the scope the API spec lists, and the narrowest one. Record new scopes in `docs/ARCHITECTURE.md` section 8.
- Never commit secrets. Runtime secrets go in `forge variables set --encrypt`.
- Write full files, not fragments.
- Public text (README, landing page, Devpost, video) must sound like a person wrote it: short sentences, concrete numbers, no hype. Banned words: seamless, revolutionize, unleash, empower, cutting-edge, game-changer, leverage, robust, elevate, supercharge, delve. No emoji in headings. Every factual claim must come from `docs/RESEARCH.md`.
- Never claim a feature works unless it has run on a real site. Say "built and tested, not yet deployed" when that's the truth.

## Checks before every commit

```bash
pnpm check
```

That runs lint, format check, build, typecheck and all tests. For changes to `apps/forge`, also run (needs `npm install -g @forge/cli`):

```bash
node scripts/forge-check.cjs apps/forge
```

## Status

Update this line when the phase changes. Jira app written and tested, including Check a change; not yet deployed. Next: first submission (`docs/FAST_SUBMIT.md`), then the Bitbucket spike (R2).

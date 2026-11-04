# Using AuditGate's MCP tools

AuditGate exposes four read-only tools through a `rovo:mcp` module: `release-readiness`, `list-open-findings`, `get-finding` and `check-drift`. They are the same actions the AuditGate Rovo agent uses.

## In Rovo Studio (custom agents)

1. In Jira, open **Rovo**, then **Studio**, then **Create agent**.
2. Under tools, add the **AuditGate** MCP tools.
3. Ask the agent "Is the latest release safe to ship?"

## From a third-party client (for example Claude Code)

1. **Site admin, once:** in Atlassian Administration, find AuditGate under connected apps and allow external MCP access. This is off by default, per installation.
2. Add the server to your client. For Claude Code:

   ```bash
   claude mcp add --transport http auditgate https://mcp.atlassian.com/forge/dc6e5d7c-6f3b-4766-af94-425ef105f7a4
   ```

3. Sign in when prompted (OAuth) and choose your site.
4. Optional: copy `skills/auditgate/SKILL.md` into your client's skills folder so it knows when and how to use the tools.

Tools only see projects your Atlassian account can browse, and they can't change anything.

Status: Rovo MCP is a Preview feature. The steps above follow Atlassian's documentation as of November 2026. If the admin setting moves, search Atlassian Administration for "MCP".

# Setup (Windows, PowerShell)

These are the steps only you can do: they need a browser, an interactive terminal or your Atlassian account. Run them in order. Each block is PowerShell.

## 1. Tools

You need Node 22, pnpm and Git. Skip any you already have.

```powershell
winget install OpenJS.NodeJS.LTS
winget install Git.Git
```

Close and reopen PowerShell, then:

```powershell
corepack enable
corepack prepare pnpm@10.28.0 --activate
node --version   # v22.x or v24.x
pnpm --version   # 10.28.0
```

## 2. Forge CLI

```powershell
npm install -g @forge/cli@latest
forge --version   # 15.x as of 29 Oct 2026
```

**Name clash.** Foundry (the Solidity toolkit) also installs a command called `forge`. Don't install Foundry on Windows for this project. CI runs the Foundry tests for the demo contracts on every push, so you never need it locally. If you already have Foundry, check which one runs with `Get-Command forge` and put the npm one first in `PATH`.

## 3. Atlassian accounts and sites

1. Get a free developer site with Jira: open <https://go.atlassian.com/cloud-dev> and follow the steps. Note the site URL, for example `benjamin-dev.atlassian.net`.
2. Create a scoped API token for the Forge CLI at <https://id.atlassian.com/manage-profile/security/api-tokens>: **Create API token with scopes**, name it `forge-api-token`, choose the app **Forge**, keep the default recommended scopes, then **Create token** and copy it. Forge CLI 15 rejects plain tokens.
3. Log in:

   ```powershell
   forge login
   ```

   Enter your Atlassian email and paste the token. Then check:

   ```powershell
   forge whoami
   ```

## 4. Bitbucket workspace and the demo repo

Forge apps can't be installed on personal Bitbucket workspaces, so you need a team workspace. The free plan allows 5 users.

1. Go to <https://bitbucket.org>, sign in with the same Atlassian account, then **Create workspace**. Pick a short ID, for example `auditgate-demo`.
2. In the workspace, **Create repository**: name `vault-v2`, no README, no .gitignore. Make it public so judges can see it.
3. Create a Bitbucket API token for git: <https://id.atlassian.com/manage-profile/security/api-tokens> → **Create API token with scopes** → app **Bitbucket** → scopes `read:repository:bitbucket` and `write:repository:bitbucket`. Copy it.
4. Push the demo contracts as their own repo. Replace `<workspace>` with your workspace ID:

   ```powershell
   $dest = "$HOME\vault-v2"
   Copy-Item -Recurse .\demo\contracts $dest
   Set-Location $dest
   git init -b main
   git add .
   git commit -m "Vault v2, as sent to the auditor"
   git remote add origin https://bitbucket.org/<workspace>/vault-v2.git
   git push -u origin main
   ```

   When Git asks for credentials, use `x-bitbucket-api-token-auth` as the username and the API token as the password. If a browser window opens instead, sign in there.

5. Print the commit SHA and send it to me. It becomes the "audited commit" in the sample report:

   ```powershell
   git rev-parse HEAD
   ```

## 5. Enable custom merge checks

Workspace admins only, which is you.

1. In Bitbucket, open the workspace → **Settings** (gear) → **Workspace settings**.
2. Find **Custom merge checks** (under **Workflow** or **Merge checks**, the label moves around) and turn it on.

You'll configure the AuditGate check on the repo after the Bitbucket app is deployed (Phase 2).

## 6. Register, deploy and install the Jira app

The Jira app is already written in `apps/forge`. You only need to register it under your account, which gives it its own app ID, then deploy and install it. Run these from the repo root.

Build the shared packages first. Forge bundles them from `dist/`, which isn't committed:

```powershell
pnpm install
pnpm build
```

Register the app. It asks for a name: type `AuditGate`. This rewrites the `app.id` line in `apps/forge/manifest.yml`. Commit that change; the ID isn't secret.

```powershell
Set-Location apps\forge
forge register
```

Check the manifest, then deploy to the development environment:

```powershell
forge lint
forge deploy -e development
```

Install it on your developer site. Replace the site name with yours:

```powershell
forge install -e development --site benjamin-dev.atlassian.net --product jira
```

Then in Jira:

1. Create a project (Scrum or Kanban, company-managed or team-managed both work). Call it `Vault`, key `VAULT`.
2. Open the project. **AuditGate** is in the project's top navigation (or under **Apps**).
3. Click **New audit**, upload `demo/reports/vault-v2-audit.md`, fill in the Bitbucket workspace, `vault-v2` and the commit SHA from step 4, and click **Create audit and 11 issues**.
4. Watch the issues appear. Open one: the **AuditGate finding** panel is on the right.

Send me a screenshot of the audit page and of one issue, and any error text exactly as shown. If something fails, run this in `apps\forge` and send me the output:

```powershell
forge logs -e development --since 15m
```

Later, after any code change I push:

```powershell
pnpm forge:deploy
```

The Bitbucket app (`auditgate-bitbucket`) comes in Phase 2. Don't create it yet.

## 6b. Optional: give your own Claude Code the Forge docs

If you use Claude Code on your machine, connect the official Forge MCP server so it checks the current docs instead of guessing, and it will read `AGENTS.md` in the repo automatically:

```powershell
claude mcp add --transport http forge https://mcp.atlassian.com/v1/forge/mcp
```

Then type `/mcp` inside Claude Code to check it's connected.

## 7. Push this repo to GitHub

Create an empty public repo called `auditgate` under your account on GitHub (no README, no licence; the repo already has both), then tell me. I'll push the work so far.

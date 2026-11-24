# AuditGate for Bitbucket: setup

The merge check is a second Forge app, in `apps/bitbucket`. One Forge app can't run in both Jira and Bitbucket (see `ARCHITECTURE.md`, section 1).

## How it works

1. A pull request gets a new commit, or someone clicks Merge.
2. Bitbucket runs the AuditGate check.
3. The check reads the repository's findings from Jira over the Jira REST API, using an API token a repository admin saved. The token only needs `read:jira-work`. By default nothing in Jira is changed.
4. It keeps only findings whose AuditGate data carries a valid signature from the Jira app. If any finding fails the check, the merge check fails. Editing an issue property by hand can't open the gate.
5. It asks Bitbucket which files changed between the audited commit and the pull request, then runs the same gate as "Check a change" in Jira.
6. The pull request shows pass or fail with a message, for example:
   `Blocked by AuditGate: 4 open (C-01, H-01, H-02, H-03). Jira: C-01 KAN-12, ... Compared with 1a2b3c4 ("Vault v2 audit").`

It fails closed: no connection, a bad token, unverifiable data or a missing commit all fail the check, with a message that says what to fix.

**Optional: record drift in Jira.** Tick **Record drift on Jira issues** on the settings page, and give the token `write:jira-work` as well. When a pull request changes code a finding points at, the check saves a signed `auditgate-drift` property on that finding's issue: the pull request, the commit, the changed files and the time. The AuditGate panel on the issue shows it, and JQL can find it: `auditgateDriftPr IS NOT EMPTY ORDER BY auditgateDriftAt DESC`. Writing is best effort. If Jira refuses, the merge check result is the same, and the settings page says what went wrong. Nothing is recorded for a commit that was signed off in a re-review.

**Blocking the merge needs Bitbucket Premium.** On Free and Standard the check runs and shows the result, but Bitbucket doesn't stop the merge.

**Clearing the gate:** with "Block on unreviewed changes" on, any change to an audited file blocks until someone signs it off. In Jira, on the audit page, a project admin uses **Re-review sign-off**: they enter the commit they reviewed (normally the head of the pull request) and a note. Findings marked fixed become Verified, and the merge check passes for exactly that commit if no Critical or High finding is still open. The next commit that touches audited code needs a new sign-off.

## Setup, step by step

Commands are for PowerShell on Windows. Run each block on its own.

### A. Update the Jira app

```powershell
cd $HOME\Desktop\auditgate
pnpm install
pnpm check
cd apps\forge
& "$env:APPDATA\npm\forge.cmd" deploy -e production
```

No new permissions, so no reinstall is needed.

### B. Create the Bitbucket workspace and repository

1. Open <https://bitbucket.org> and log in with your Atlassian account.
2. Create a **workspace**. Forge apps don't install on personal workspaces, so it must be a shared one. Use the ID `auditgate-demo` if it's free. If not, pick another and use it everywhere below.
3. In the workspace, create a repository named `vault-v2`. Untick "Include a README".

### C. Push the demo contracts

```powershell
cd $HOME\Desktop
Copy-Item -Recurse auditgate\demo\contracts vault-v2
cd vault-v2
git init -b main
git add .
git commit -m "Vault v2 as audited"
git remote add origin https://bitbucket.org/auditgate-demo/vault-v2.git
git push -u origin main
git rev-parse HEAD
```

The last command prints the real audited commit, 40 characters. Keep it.

### D. Create the audit with the real commit

1. In Jira, open the project, then **AuditGate**, then **New audit**.
2. Upload `demo\reports\vault-v2-audit.md`.
3. Workspace `auditgate-demo`, repository `vault-v2`, audited commit: the 40 characters from step C.
4. Create the audit. AuditGate creates the issues, signed.

### E. Connect Bitbucket in Jira

1. In the AuditGate tab, click **Connect Bitbucket**.
2. Click **Sign issues** next to **every** audit for `auditgate-demo/vault-v2`, including older ones. The merge check fails if any finding for the repository is unsigned.
3. Keep this page open. You need the **Jira site ID** and the **Signing secret** in step H.

### F. Create the API token

1. Open <https://id.atlassian.com/manage-profile/security/api-tokens>.
2. Click **Create API token with scopes**. Name it `AuditGate Bitbucket`, pick **Jira**, and tick only `read:jira-work`.
3. Copy the token. You'll only see it once. Don't paste it anywhere except the Bitbucket settings page.

### G. Register, deploy and install the Bitbucket app

```powershell
cd $HOME\Desktop\auditgate\apps\bitbucket
& "$env:APPDATA\npm\forge.cmd" register
```

Name it `AuditGate for Bitbucket`. This writes the new app ID into `apps\bitbucket\manifest.yml`. Commit that change.

```powershell
& "$env:APPDATA\npm\forge.cmd" deploy -e production
& "$env:APPDATA\npm\forge.cmd" install -e production
```

When asked, choose **Bitbucket** and enter `https://bitbucket.org/auditgate-demo/`.

### H. Save the Jira connection in Bitbucket

1. Open the `vault-v2` repository, then **Repository settings**. Under **Forge apps**, click **AuditGate**.
2. Paste the Jira site ID and signing secret from step E, your Atlassian email, and the token from step F.
3. Click **Check and save**. It should say it found the signed findings from your audit.

### I. Turn on the merge check

1. **Workspace settings → Workflow → Custom merge checks**: turn the feature on.
2. **Repository settings → Workflow → Custom merge checks → Add check**: pick **AuditGate**, branch `main`. Tick **Required** if the workspace is on Premium (a free trial works).

### J. Try it

1. In Bitbucket, open `src/TokenVault.sol` and click **Edit**. Change a comment.
2. Commit to a **new branch** and create a pull request into `main`.
3. The AuditGate check fails and lists the open findings and the changed audited file.

# Submitting a first version in two days

Devpost lets you edit a submission until the deadline (22 Dec 2026, 12:00 PT). So we submit a **working first version** now and keep improving it until 21 Dec. Judges score whatever is there at the deadline.

The first version is the Jira app: import, issue panel, gate result, and **Check a change**. The Bitbucket merge check, the Rovo agent, MCP tools and the Marketplace listing are added later, in the same submission.

Every step below is PowerShell, run in `C:\Users\softapha\Desktop\auditgate` unless it says otherwise.

## Day 1: get it running

### 1. Push to GitHub

```powershell
git push -u origin main
```

### 2. Tools (skip what you have)

```powershell
winget install OpenJS.NodeJS.LTS
```

Close and reopen PowerShell, then:

```powershell
corepack enable
npm install -g @forge/cli@latest
```

Check:

```powershell
node --version
forge --version
```

Use Node 24 (24.22.1 or newer) or Node 22 (22.23.4 or newer). Node 26 is too new for Forge CLI 15. If `corepack` is missing, install pnpm with `npm install -g pnpm@10.28.0`.

### 3. Atlassian account and site

1. Create a free developer site: <https://go.atlassian.com/cloud-dev>. Note the address, for example `benjamin-dev.atlassian.net`.
2. Create a scoped API token at <https://id.atlassian.com/manage-profile/security/api-tokens>: **Create API token with scopes**, name it `forge-api-token`, choose the app **Forge**, keep the default recommended scopes, then **Create token** and copy it. Forge CLI 15 rejects plain tokens.
3. Log in:

```powershell
forge login
```

### 4. Build, register, deploy, install (development)

```powershell
pnpm install
pnpm build
Set-Location apps\forge
forge register
```

When `forge register` asks for a name, type `AuditGate`.

```powershell
forge lint
forge deploy -e development
forge install -e development --site benjamin-dev.atlassian.net --product jira
```

Replace the site with yours.

### 5. Try it, the way a judge will

Follow `docs/JUDGES.md` sections 2 to 5 on your site. Use any 40-character SHA for now, for example `3f1c2a9e0b7d4c6a8e5f1b2c3d4e5f6a7b8c9d0e`.

**Send me:** screenshots of the audit page, one issue panel, and a Check a change result. If anything fails, send the exact error text and the output of:

```powershell
forge logs -e development --since 15m
```

I fix, send you a new zip, and you run `git pull` and `pnpm forge:deploy` again.

### 6. Commit the app ID

`forge register` changed `apps/forge/manifest.yml`. Save it:

```powershell
Set-Location ..\..
git add apps/forge/manifest.yml
git commit -m "Register the Forge app"
git push
```

## Day 2: install link, video, Devpost

### 7. Production deploy and install link

```powershell
Set-Location apps\forge
forge deploy -e production
forge install -e production --site benjamin-dev.atlassian.net --product jira
```

Then turn on sharing:

1. Open <https://developer.atlassian.com/console/myapps/> and choose **AuditGate**.
2. **Distribution** in the left menu, then **Edit** under Distribution controls.
3. Choose **Sharing**, answer the privacy and security questions (AuditGate stores audit and finding data in Forge storage and Jira; no personal data leaves Atlassian), and save.
4. Copy the **installation link**. Send it to me; I'll put it in `JUDGES.md`.

Test the link: install it on a second free developer site (a second Atlassian account or a colleague's site) and follow `JUDGES.md` from the top. This is the test the guide insists on: use it as a stranger would.

### 8. Record the video (2:50 or less)

Script: `docs/VIDEO_SCRIPT.md`. For the first version, replace the Bitbucket part (1:05–1:50) with **Check a change**: paste the two changed files and show the gate block and the drift list. Say: "The Bitbucket merge check that blocks the pull request itself comes next. This shows the same check inside Jira."

- Use Loom or OBS Studio. Browser zoom 125%, notifications off.
- Upload to YouTube as **Public**. The rules require public.

### 9. Devpost

1. Go to <https://codegeist2026.devpost.com/> and click **Join hackathon** if you haven't.
2. **Enter a submission.** Copy the text from `docs/SUBMISSION.md`. Remove the parts about features not built yet, or mark them "in progress".
3. Category: **Apps for Specialized Industries**. Leave the bonus prizes unticked until they're built.
4. Add the video link, the GitHub link, the install link and the testing instructions from `JUDGES.md`.
5. Submit. Then open every link from your phone using mobile data.

## Before you click Submit

- [ ] App installs from the link on a site that isn't yours
- [ ] Every feature in the video works on that site
- [ ] Video is public on YouTube and under 3 minutes
- [ ] GitHub repo is public and the README says what works today
- [ ] No feature is described as working unless it does
- [ ] Eligibility confirmed (`RULES.md`)

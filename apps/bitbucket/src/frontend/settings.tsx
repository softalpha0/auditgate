import React, { useEffect, useState } from "react";
import ForgeReconciler, {
  Box,
  Button,
  Checkbox,
  Code,
  ErrorMessage,
  Heading,
  HelperMessage,
  Inline,
  Label,
  Link,
  LoadingButton,
  SectionMessage,
  Spinner,
  Stack,
  Text,
  Textfield,
  xcss,
} from "@forge/react";
import type { SaveSettingsInput, SaveSettingsResult, SettingsStatus } from "../shared/contract";
import { RESOLVERS } from "../shared/contract";
import { call } from "./api";

const card = xcss({
  padding: "space.200",
  borderColor: "color.border",
  borderWidth: "border.width",
  borderStyle: "solid",
  borderRadius: "radius.medium",
});

const empty: SaveSettingsInput = {
  cloudId: "",
  email: "",
  token: "",
  signingSecret: "",
  writeBack: false,
};

const Settings = () => {
  const [status, setStatus] = useState<SettingsStatus>();
  const [loadError, setLoadError] = useState<string>();
  const [form, setForm] = useState<SaveSettingsInput>(empty);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState<SaveSettingsResult>();

  const load = () =>
    call<SettingsStatus>(RESOLVERS.getSettings).then((r) => {
      if (!r.ok) return setLoadError(r.error);
      setStatus(r.data);
      setForm({
        ...empty,
        cloudId: r.data.cloudId ?? "",
        email: r.data.email ?? "",
        writeBack: r.data.writeBack ?? false,
      });
    });
  useEffect(() => {
    void load();
  }, []);

  const set =
    (key: "cloudId" | "email" | "token" | "signingSecret") =>
    (e: { target: { value?: unknown } }) =>
      setForm((f) => ({ ...f, [key]: String(e.target.value ?? "") }));

  const save = async () => {
    setSaving(true);
    setError(undefined);
    setSaved(undefined);
    const r = await call<SaveSettingsResult>(RESOLVERS.saveSettings, form);
    setSaving(false);
    if (!r.ok) return setError(r.error);
    setSaved(r.data);
    void load();
  };

  const disconnect = async () => {
    const r = await call<null>(RESOLVERS.disconnect);
    if (!r.ok) return setError(r.error);
    setSaved(undefined);
    void load();
  };

  if (loadError)
    return (
      <SectionMessage appearance="error" title="Couldn't load AuditGate settings">
        <Text>{loadError}</Text>
      </SectionMessage>
    );
  if (!status) return <Spinner label="Loading settings" />;

  const keep = status.connected ? "Leave empty to keep the one already saved." : undefined;

  return (
    <Stack space="space.300">
      <Stack space="space.100">
        <Heading as="h2" size="medium">
          AuditGate merge check
        </Heading>
        <Text>
          Blocks pull requests into {status.repo} while a Critical or High audit finding is open in
          Jira, or while they change audited code that nobody has re-reviewed. Findings are read
          from Jira with the account below. Nothing in Jira is changed unless you turn on recording
          drift.
        </Text>
      </Stack>

      {status.connected ? (
        <SectionMessage appearance="success" title="Connected to Jira">
          <Text>
            Reading findings as {status.email} from site <Code>{status.cloudId ?? ""}</Code>.
          </Text>
          <Text>
            {status.writeBack
              ? "Recording drift on Jira issues: on."
              : "Recording drift on Jira issues: off."}
          </Text>
        </SectionMessage>
      ) : (
        <SectionMessage appearance="warning" title="Not connected yet">
          <Text>
            Until this is set up, the merge check fails on every pull request, so nothing merges
            unchecked.
          </Text>
        </SectionMessage>
      )}

      {status.writeBack && status.lastWriteBack && (
        <SectionMessage
          appearance={status.lastWriteBack.failed.length ? "warning" : "information"}
          title="Last drift recorded in Jira"
        >
          <Text>
            {`Pull request #${status.lastWriteBack.prId} at ${status.lastWriteBack.commit.slice(0, 7)}, ${status.lastWriteBack.at.slice(0, 16).replace("T", " ")} UTC.`}
          </Text>
          {status.lastWriteBack.written.length > 0 && (
            <Text>{`Saved on ${status.lastWriteBack.written.join(", ")}.`}</Text>
          )}
          {status.lastWriteBack.failed.length > 0 && (
            <Text>
              {`Not saved on ${status.lastWriteBack.failed.join(", ")}: ${status.lastWriteBack.error ?? "Jira refused."} The merge check result isn't affected.`}
            </Text>
          )}
        </SectionMessage>
      )}

      <Box xcss={card}>
        <Stack space="space.200">
          <Text>
            In Jira, open the project with the audit, then AuditGate, then Connect Bitbucket. It
            shows the site ID and the signing secret.
          </Text>
          <Stack space="space.050">
            <Label labelFor="cloudId">Jira site ID</Label>
            <Textfield id="cloudId" value={form.cloudId} onChange={set("cloudId")} />
          </Stack>
          <Stack space="space.050">
            <Label labelFor="secret">Signing secret</Label>
            <Textfield
              id="secret"
              type="password"
              value={form.signingSecret}
              onChange={set("signingSecret")}
            />
            {keep && <HelperMessage>{keep}</HelperMessage>}
          </Stack>
          <Stack space="space.050">
            <Label labelFor="email">Atlassian account email</Label>
            <Textfield id="email" value={form.email} onChange={set("email")} />
          </Stack>
          <Stack space="space.050">
            <Label labelFor="token">API token</Label>
            <Textfield id="token" type="password" value={form.token} onChange={set("token")} />
            <HelperMessage>
              {`Create a token with the scope read:jira-work${form.writeBack ? " and write:jira-work" : " only"}. ${keep ?? ""}`.trim()}
            </HelperMessage>
            <Link href="https://id.atlassian.com/manage-profile/security/api-tokens" openNewTab>
              Create an API token
            </Link>
          </Stack>
          <Stack space="space.050">
            <Checkbox
              name="writeBack"
              label="Record drift on Jira issues"
              isChecked={form.writeBack === true}
              onChange={(e: { target: { checked?: boolean } }) =>
                setForm((f) => ({ ...f, writeBack: e.target.checked === true }))
              }
            />
            <HelperMessage>
              When a pull request changes audited code, AuditGate marks the affected findings in
              Jira with the pull request and commit. The token then also needs write:jira-work.
              Leave it off to keep the token read-only; the merge check works the same either way.
            </HelperMessage>
          </Stack>
          {error && <ErrorMessage>{error}</ErrorMessage>}
          {saved && (
            <SectionMessage appearance="success" title="Saved">
              <Text>
                {saved.findings === 0
                  ? `Jira answered, but no audit covers ${status.repo} yet. The check will pass until one does.`
                  : `Found ${saved.findings} signed findings from ${saved.audits.join(", ")}. Next, add the check under Repository settings > Workflow > Custom merge checks.`}
              </Text>
            </SectionMessage>
          )}
          <Inline space="space.100">
            <LoadingButton appearance="primary" isLoading={saving} onClick={save}>
              Check and save
            </LoadingButton>
            {status.connected && (
              <Button appearance="subtle" onClick={disconnect}>
                Disconnect
              </Button>
            )}
          </Inline>
        </Stack>
      </Box>
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <Settings />
  </React.StrictMode>,
);

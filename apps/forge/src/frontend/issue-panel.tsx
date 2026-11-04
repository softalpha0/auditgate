import React, { useEffect, useState } from "react";
import ForgeReconciler, {
  Button,
  Code,
  ErrorMessage,
  Heading,
  Inline,
  Label,
  Link,
  LoadingButton,
  SectionMessage,
  Spinner,
  Stack,
  Text,
  TextArea,
  User,
  UserPicker,
} from "@forge/react";
import type { FindingStatus } from "@auditgate/core";
import type { ChangeStatusInput, PanelView } from "../shared/contract";
import { RESOLVERS } from "../shared/contract";
import { call } from "./api";
import {
  STATUS_LABEL,
  SeverityLozenge,
  StatusLozenge,
  formatDate,
  plainText,
  shortSha,
} from "./labels";

const ACTION_LABEL: Partial<Record<FindingStatus, string>> = {
  InFix: "Start fix",
  FixedPendingRecheck: "Mark as fixed",
  AcceptedRisk: "Accept risk",
};

const AcceptRiskForm = ({
  onSubmit,
  onCancel,
  busy,
}: {
  onSubmit: (input: ChangeStatusInput) => void;
  onCancel: () => void;
  busy: boolean;
}) => {
  const [reason, setReason] = useState("");
  const [approver, setApprover] = useState<string>();
  return (
    <Stack space="space.150">
      <Text>
        Accepted risk lets the merge through but is named in every merge check. Record why, and who
        approved it.
      </Text>
      <Stack space="space.050">
        <Label labelFor="reason">Reason</Label>
        <TextArea
          id="reason"
          minimumRows={3}
          placeholder="For example: owner is a 3-of-5 multisig, and this function can't be reached by users."
          onChange={(e) =>
            setReason(String((e as unknown as { target?: { value?: string } }).target?.value ?? ""))
          }
        />
      </Stack>
      <UserPicker
        label="Approved by"
        name="approver"
        isRequired
        onChange={(user) => setApprover((user as { id?: string } | undefined)?.id)}
      />
      <Inline space="space.100">
        <LoadingButton
          appearance="warning"
          isLoading={busy}
          isDisabled={!reason.trim() || !approver}
          onClick={() =>
            onSubmit({ to: "AcceptedRisk", note: reason, ...(approver ? { approver } : {}) })
          }
        >
          Accept risk
        </LoadingButton>
        <Button appearance="subtle" onClick={onCancel}>
          Cancel
        </Button>
      </Inline>
    </Stack>
  );
};

const App = () => {
  const [view, setView] = useState<PanelView | null>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    call<PanelView | null>(RESOLVERS.getPanel).then((r) =>
      r.ok ? setView(r.data) : setError(r.error),
    );
  }, []);

  const change = async (input: ChangeStatusInput) => {
    setBusy(true);
    setError(undefined);
    const r = await call<PanelView>(RESOLVERS.changeStatus, input);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setView(r.data);
    setAccepting(false);
  };

  if (view === undefined && !error) return <Spinner label="Loading finding" />;
  if (view === null)
    return <Text color="color.text.subtlest">This issue isn't an AuditGate finding.</Text>;
  if (!view)
    return (
      <SectionMessage appearance="error" title="Couldn't load this finding">
        <Text>{error ?? ""}</Text>
      </SectionMessage>
    );

  const { finding, audit, allowedTransitions } = view;
  const where = [finding.contract, finding.fn].filter(Boolean).join(".");

  return (
    <Stack space="space.200">
      <Inline space="space.100" alignBlock="center" shouldWrap>
        <Code>{finding.externalId}</Code>
        <SeverityLozenge severity={finding.severity} />
        <StatusLozenge status={finding.status} />
        <Text color="color.text.subtlest">{`from ${finding.source}`}</Text>
      </Inline>

      {finding.status === "Drifted" ? (
        <SectionMessage appearance="warning" title="Code changed since the audit">
          <Text>
            A file this finding points at changed after the audited commit. The auditor didn't
            review the new code, so this finding needs another look before release.
          </Text>
        </SectionMessage>
      ) : null}

      <Stack space="space.050">
        <Text weight="semibold">{finding.locations.length > 1 ? "Locations" : "Location"}</Text>
        {finding.locations.length ? (
          finding.locations.map((loc) => (
            <Link key={loc.url} href={loc.url} openNewTab>
              {loc.label}
            </Link>
          ))
        ) : (
          <Text color="color.text.subtlest">The report didn't give a location.</Text>
        )}
        {where ? <Code>{where}</Code> : null}
        <Text size="small" color="color.text.subtlest">
          {`${audit.name} · ${audit.auditor} · ${audit.repo} at ${shortSha(audit.auditedCommit)}`}
        </Text>
      </Stack>

      {finding.recommendation ? (
        <Stack space="space.050">
          <Text weight="semibold">Recommendation</Text>
          <Text>{plainText(finding.recommendation)}</Text>
        </Stack>
      ) : null}

      {accepting ? (
        <AcceptRiskForm onSubmit={change} onCancel={() => setAccepting(false)} busy={busy} />
      ) : allowedTransitions.length ? (
        <Inline space="space.100" shouldWrap>
          {allowedTransitions.map((to) =>
            to === "AcceptedRisk" ? (
              <Button key={to} appearance="subtle" onClick={() => setAccepting(true)}>
                Accept risk…
              </Button>
            ) : (
              <LoadingButton
                key={to}
                appearance="primary"
                isLoading={busy}
                onClick={() => change({ to })}
              >
                {ACTION_LABEL[to] ?? STATUS_LABEL[to]}
              </LoadingButton>
            ),
          )}
        </Inline>
      ) : finding.status === "FixedPendingRecheck" ? (
        <Text color="color.text.subtlest">Waiting for a re-check against the fixed commit.</Text>
      ) : null}
      {error ? <ErrorMessage>{error}</ErrorMessage> : null}

      <Stack space="space.100">
        <Heading as="h4" size="xsmall">
          History
        </Heading>
        {finding.history.length === 0 ? (
          <Text color="color.text.subtlest">Imported, no changes yet.</Text>
        ) : (
          [...finding.history].reverse().map((h, i) => (
            <Stack key={i} space="space.025">
              <Inline space="space.075" alignBlock="center" shouldWrap>
                {h.by === "auditgate" ? (
                  <Text weight="semibold">AuditGate</Text>
                ) : (
                  <User accountId={h.by} />
                )}
                <StatusLozenge status={h.from} />
                <Text>→</Text>
                <StatusLozenge status={h.to} />
                <Text size="small" color="color.text.subtlest">
                  {formatDate(h.at)}
                </Text>
              </Inline>
              {h.note ? <Text size="small">{h.note}</Text> : null}
            </Stack>
          ))
        )}
      </Stack>
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

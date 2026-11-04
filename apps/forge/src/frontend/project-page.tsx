import React, { useCallback, useEffect, useState } from "react";
import ForgeReconciler, {
  Badge,
  Box,
  Button,
  Code,
  DynamicTable,
  ErrorMessage,
  FilePicker,
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
  TextArea,
  Textfield,
  Toggle,
  xcss,
} from "@forge/react";
import { SEVERITIES, type Severity } from "@auditgate/core";
import type {
  AuditDetail,
  AuditSummary,
  CheckChangeResult,
  CreateAuditInput,
  ImportStatus,
  ReportPreview,
  ReportUpload,
} from "../shared/contract";
import { RESOLVERS } from "../shared/contract";
import { call } from "./api";
import { SeverityLozenge, StatusLozenge, formatDate, plural, shortSha } from "./labels";

type View = { name: "list" } | { name: "new" } | { name: "audit"; id: string };

const card = xcss({
  padding: "space.200",
  borderColor: "color.border",
  borderWidth: "border.width",
  borderStyle: "solid",
  borderRadius: "radius.medium",
});

const SeverityCounts = ({ counts }: { counts: Partial<Record<Severity, number>> }) => (
  <Inline space="space.100" shouldWrap>
    {SEVERITIES.filter((s) => counts[s]).map((s) => (
      <Inline key={s} space="space.050" alignBlock="center">
        <SeverityLozenge severity={s} />
        <Badge>{counts[s] ?? 0}</Badge>
      </Inline>
    ))}
  </Inline>
);

const GateMessage = ({ gate }: { gate: AuditSummary["gate"] }) => (
  <SectionMessage
    appearance={gate.pass ? "success" : "error"}
    title={gate.pass ? "Release gate: clear" : "Release gate: blocked"}
  >
    <Text>{gate.message}</Text>
  </SectionMessage>
);

const ImportMessage = ({ status }: { status: ImportStatus }) => {
  if (status.state === "queued" || status.state === "running") {
    return (
      <SectionMessage appearance="information" title="Creating Jira issues">
        <Inline space="space.100" alignBlock="center">
          <Spinner size="small" label="Importing" />
          <Text>
            {status.state === "queued"
              ? "Waiting to start."
              : `${status.created + status.updated} of ${status.total} done.`}
          </Text>
        </Inline>
      </SectionMessage>
    );
  }
  if (status.state === "failed") {
    return (
      <SectionMessage appearance="warning" title="The import didn't finish cleanly">
        <Stack space="space.050">
          {(status.messages || []).map((m, i) => (
            <Text key={i}>{m}</Text>
          ))}
          <Text>
            Re-import the same report to retry. Issues that already exist won't be duplicated.
          </Text>
        </Stack>
      </SectionMessage>
    );
  }
  return null;
};

// ---------- List ----------

const AuditList = ({ open, create }: { open: (id: string) => void; create: () => void }) => {
  const [audits, setAudits] = useState<AuditSummary[] | null>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    call<AuditSummary[]>(RESOLVERS.listAudits).then((r) =>
      r.ok ? setAudits(r.data) : setError(r.error),
    );
  }, []);

  if (error)
    return (
      <SectionMessage appearance="error" title="Couldn't load audits">
        <Text>{error}</Text>
      </SectionMessage>
    );
  if (!audits) return <Spinner label="Loading audits" />;

  if (audits.length === 0) {
    return (
      <Box xcss={card}>
        <Stack space="space.150" alignInline="start">
          <Heading as="h2" size="medium">
            No audits in this project yet
          </Heading>
          <Text>
            Upload a Slither or Aderyn JSON file, or a Markdown audit report. Each finding becomes a
            Jira issue, and AuditGate keeps track of the commit the auditor reviewed.
          </Text>
          <Button appearance="primary" onClick={create}>
            New audit
          </Button>
        </Stack>
      </Box>
    );
  }

  const head = {
    cells: [
      { key: "name", content: "Audit", isSortable: true },
      { key: "commit", content: "Audited commit" },
      { key: "findings", content: "Findings" },
      { key: "gate", content: "Gate" },
      { key: "created", content: "Created", isSortable: true },
    ],
  };
  const rows = audits.map((a) => ({
    key: a.id,
    cells: [
      {
        key: a.name,
        content: (
          <Stack space="space.025">
            <Button appearance="subtle" spacing="none" onClick={() => open(a.id)}>
              {a.name}
            </Button>
            <Text size="small" color="color.text.subtlest">{`${a.auditor} · ${a.repo}`}</Text>
          </Stack>
        ),
      },
      { key: "commit", content: <Code>{shortSha(a.auditedCommit)}</Code> },
      { key: "findings", content: <SeverityCounts counts={a.bySeverity} /> },
      {
        key: "gate",
        content:
          a.import.state === "done" || a.import.state === "failed" ? (
            <Text color={a.gate.pass ? "color.text.success" : "color.text.danger"}>
              {a.gate.pass ? "Clear" : "Blocked"}
            </Text>
          ) : (
            <Text color="color.text.subtlest">Importing</Text>
          ),
      },
      { key: a.createdAt, content: <Text>{formatDate(a.createdAt)}</Text> },
    ],
  }));

  return (
    <Stack space="space.200">
      <Inline spread="space-between" alignBlock="center">
        <Text>{plural(audits.length, "audit")}</Text>
        <Button appearance="primary" onClick={create}>
          New audit
        </Button>
      </Inline>
      <DynamicTable head={head} rows={rows} label="Audits" />
    </Stack>
  );
};

// ---------- Report upload (shared by New audit and Re-import) ----------

const ReportInput = ({ onReport }: { onReport: (report: ReportUpload | undefined) => void }) => {
  const [paste, setPaste] = useState(false);
  return (
    <Stack space="space.100">
      {paste ? (
        <Stack space="space.050">
          <Label labelFor="report-text">Report contents</Label>
          <TextArea
            id="report-text"
            minimumRows={8}
            isMonospaced
            placeholder="Paste Slither JSON, Aderyn JSON or a Markdown report"
            onChange={(e) => {
              const text = String(
                (e as unknown as { target?: { value?: string } }).target?.value ?? "",
              );
              onReport(text.trim() ? { fileName: "pasted", data: text } : undefined);
            }}
          />
        </Stack>
      ) : (
        <FilePicker
          label="Report file"
          description="Slither JSON (--json), Aderyn JSON (-o report.json) or a Markdown report in the AuditGate template format. Up to 350 KB."
          onChange={(files) => {
            const file = (files || [])[0];
            onReport(file ? { fileName: file.name, data: file.data } : undefined);
          }}
        />
      )}
      <Button
        appearance="subtle"
        spacing="compact"
        onClick={() => {
          setPaste(!paste);
          onReport(undefined);
        }}
      >
        {paste ? "Upload a file instead" : "Paste the report instead"}
      </Button>
    </Stack>
  );
};

const PreviewMessage = ({ preview }: { preview: ReportPreview }) => (
  <SectionMessage
    appearance={preview.warnings.length ? "warning" : "success"}
    title={`${plural(preview.total, "finding")} found (${preview.format === "markdown" ? "Markdown report" : preview.format === "slither" ? "Slither" : "Aderyn"})`}
  >
    <Stack space="space.100">
      <SeverityCounts counts={preview.bySeverity} />
      {(preview.warnings || []).slice(0, 8).map((w, i) => (
        <Text key={i}>{w}</Text>
      ))}
      {preview.warnings.length > 8 ? (
        <Text>{`…and ${preview.warnings.length - 8} more warnings.`}</Text>
      ) : null}
    </Stack>
  </SectionMessage>
);

// ---------- New audit ----------

interface FormState {
  name: string;
  auditor: string;
  workspace: string;
  repoSlug: string;
  auditedCommit: string;
  scope: string;
  blockOnUnreviewedChanges: boolean;
}

const Field = ({
  id,
  label,
  helper,
  value,
  placeholder,
  onChange,
  monospace,
}: {
  id: string;
  label: string;
  helper?: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
  monospace?: boolean;
}) => (
  <Stack space="space.050">
    <Label labelFor={id}>{label}</Label>
    <Textfield
      id={id}
      value={value}
      placeholder={placeholder ?? ""}
      isMonospaced={Boolean(monospace)}
      onChange={(e) =>
        onChange(String((e as unknown as { target?: { value?: string } }).target?.value ?? ""))
      }
    />
    {helper ? <HelperMessage>{helper}</HelperMessage> : null}
  </Stack>
);

const NewAudit = ({ done, cancel }: { done: (id: string) => void; cancel: () => void }) => {
  const [form, setForm] = useState<FormState>({
    name: "",
    auditor: "",
    workspace: "",
    repoSlug: "",
    auditedCommit: "",
    scope: "",
    blockOnUnreviewedChanges: true,
  });
  const [report, setReport] = useState<ReportUpload>();
  const [preview, setPreview] = useState<ReportPreview>();
  const [previewError, setPreviewError] = useState<string>();
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const set = useCallback(
    (key: keyof FormState) => (value: string) => setForm((f) => ({ ...f, [key]: value })),
    [],
  );

  const onReport = useCallback(async (upload: ReportUpload | undefined) => {
    setReport(upload);
    setPreview(undefined);
    setPreviewError(undefined);
    if (!upload) return;
    const r = await call<ReportPreview>(RESOLVERS.previewReport, upload);
    if (!r.ok) return setPreviewError(r.error);
    setPreview(r.data);
    // Fill empty fields from the report header. Never overwrite what the user typed.
    setForm((f) => ({
      ...f,
      name: f.name || r.data.meta.name || "",
      auditor: f.auditor || r.data.meta.auditor || "",
      auditedCommit: f.auditedCommit || r.data.meta.commit || "",
      scope: f.scope || (r.data.meta.scope ?? r.data.files).join("\n"),
    }));
  }, []);

  const submit = async () => {
    if (!report) return setError("Choose a report file or paste the report first.");
    setSaving(true);
    setError(undefined);
    const input: CreateAuditInput = {
      name: form.name,
      auditor: form.auditor,
      workspace: form.workspace,
      repoSlug: form.repoSlug,
      auditedCommit: form.auditedCommit,
      scope: form.scope
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      report,
      blockOnUnreviewedChanges: form.blockOnUnreviewedChanges,
    };
    const r = await call<AuditSummary>(RESOLVERS.createAudit, input);
    setSaving(false);
    if (r.ok) done(r.data.id);
    else setError(r.error);
  };

  return (
    <Stack space="space.300">
      <Inline spread="space-between" alignBlock="center">
        <Heading as="h2" size="medium">
          New audit
        </Heading>
        <Button appearance="subtle" onClick={cancel}>
          Back to audits
        </Button>
      </Inline>

      <Box xcss={card}>
        <Stack space="space.200">
          <Heading as="h3" size="small">
            1. The report
          </Heading>
          <ReportInput onReport={onReport} />
          {previewError ? (
            <SectionMessage appearance="error" title="AuditGate can't read this report">
              <Text>{previewError}</Text>
            </SectionMessage>
          ) : null}
          {preview ? <PreviewMessage preview={preview} /> : null}
        </Stack>
      </Box>

      <Box xcss={card}>
        <Stack space="space.200">
          <Heading as="h3" size="small">
            2. What was audited
          </Heading>
          <Field
            id="name"
            label="Audit name"
            value={form.name}
            placeholder="Vault v2 audit"
            onChange={set("name")}
          />
          <Field
            id="auditor"
            label="Auditor"
            value={form.auditor}
            placeholder='Firm name, or "Internal"'
            onChange={set("auditor")}
          />
          <Inline space="space.200" shouldWrap>
            <Field
              id="workspace"
              label="Bitbucket workspace"
              value={form.workspace}
              placeholder="auditgate-demo"
              onChange={set("workspace")}
            />
            <Field
              id="repo"
              label="Repository"
              value={form.repoSlug}
              placeholder="vault-v2"
              onChange={set("repoSlug")}
            />
          </Inline>
          <Field
            id="commit"
            label="Audited commit"
            value={form.auditedCommit}
            placeholder="40-character SHA"
            helper="The exact commit the auditor reviewed. In the repo, run: git rev-parse HEAD"
            monospace
            onChange={set("auditedCommit")}
          />
          <Stack space="space.050">
            <Label labelFor="scope">Files in scope</Label>
            <TextArea
              id="scope"
              value={form.scope}
              minimumRows={4}
              isMonospaced
              placeholder={"src/TokenVault.sol\nsrc/PriceOracle.sol"}
              onChange={(e) =>
                set("scope")(
                  String((e as unknown as { target?: { value?: string } }).target?.value ?? ""),
                )
              }
            />
            <HelperMessage>
              One path per line, relative to the repo root. A change to any of these files after the
              audited commit counts as drift.
            </HelperMessage>
          </Stack>
          <Toggle
            id="strict"
            label="Block merges on any change to an audited file until someone re-reviews it"
            isChecked={form.blockOnUnreviewedChanges}
            onChange={() =>
              setForm((f) => ({ ...f, blockOnUnreviewedChanges: !f.blockOnUnreviewedChanges }))
            }
          />
        </Stack>
      </Box>

      {error ? <ErrorMessage>{error}</ErrorMessage> : null}
      <Inline space="space.100">
        <LoadingButton
          appearance="primary"
          isLoading={saving}
          isDisabled={!preview}
          onClick={submit}
        >
          {preview ? `Create audit and ${plural(preview.total, "issue")}` : "Create audit"}
        </LoadingButton>
        <Button appearance="subtle" onClick={cancel}>
          Cancel
        </Button>
      </Inline>
    </Stack>
  );
};

// ---------- Check a change (what the merge check would say, without Bitbucket) ----------

const CheckChange = ({ auditId, auditedCommit }: { auditId: string; auditedCommit: string }) => {
  const [text, setText] = useState("");
  const [result, setResult] = useState<CheckChangeResult>();
  const [error, setError] = useState<string>();
  const [checking, setChecking] = useState(false);

  const check = async () => {
    setChecking(true);
    setError(undefined);
    const r = await call<CheckChangeResult>(RESOLVERS.checkChange, { auditId, changedFiles: text });
    setChecking(false);
    if (r.ok) setResult(r.data);
    else {
      setResult(undefined);
      setError(r.error);
    }
  };

  const head = {
    cells: [
      { key: "file", content: "Audited file" },
      { key: "change", content: "Change" },
      { key: "findings", content: "Findings it affects" },
    ],
  };
  const rows = (result?.changedAuditedFiles || []).map((f) => ({
    key: f.path,
    cells: [
      { key: "file", content: <Code>{f.path}</Code> },
      {
        key: "change",
        content: <Text>{f.renamedTo ? `renamed to ${f.renamedTo}` : f.status}</Text>,
      },
      {
        key: "findings",
        content: f.findings.length ? (
          <Inline space="space.050" shouldWrap>
            {f.findings.map((id) => (
              <Code key={id}>{id}</Code>
            ))}
          </Inline>
        ) : (
          <Text color="color.text.subtlest">No findings in this file, but it was audited</Text>
        ),
      },
    ],
  }));

  return (
    <Box xcss={card}>
      <Stack space="space.150">
        <Heading as="h3" size="small">
          Check a change
        </Heading>
        <Text>
          See what the release gate would say about a branch or pull request. Paste the files that
          changed since the audited commit, and AuditGate shows which findings drifted and whether
          the merge would be blocked. Nothing is saved.
        </Text>
        <Stack space="space.050">
          <Label labelFor="changed-files">Changed files</Label>
          <TextArea
            id="changed-files"
            minimumRows={5}
            isMonospaced
            value={text}
            placeholder={
              "M\tsrc/TokenVault.sol\nM\tsrc/RewardsDistributor.sol\nA\tsrc/NewFeature.sol"
            }
            onChange={(e) =>
              setText(String((e as unknown as { target?: { value?: string } }).target?.value ?? ""))
            }
          />
          <HelperMessage>
            {`In the repo, run: git diff --name-status ${shortSha(auditedCommit)} HEAD   (one path per line also works)`}
          </HelperMessage>
        </Stack>
        <Inline>
          <LoadingButton
            appearance="primary"
            isLoading={checking}
            isDisabled={!text.trim()}
            onClick={check}
          >
            Check
          </LoadingButton>
        </Inline>
        {error ? <ErrorMessage>{error}</ErrorMessage> : null}
        {result ? (
          <Stack space="space.150">
            <GateMessage gate={result.gate} />
            {rows.length ? (
              <DynamicTable head={head} rows={rows} label="Changed audited files" />
            ) : (
              <Text>{`None of the ${plural(result.filesRead, "changed file")} is in the audit scope.`}</Text>
            )}
            {result.outOfScopeFiles.length ? (
              <Text size="small" color="color.text.subtlest">
                {`Outside the audit scope, so not drift: ${result.outOfScopeFiles.slice(0, 8).join(", ")}${result.outOfScopeFiles.length > 8 ? ` and ${result.outOfScopeFiles.length - 8} more` : ""}`}
              </Text>
            ) : null}
            <Text
              size="small"
              color="color.text.subtlest"
            >{`Compared with the audited commit ${shortSha(result.comparedTo)}.`}</Text>
          </Stack>
        ) : null}
      </Stack>
    </Box>
  );
};

// ---------- One audit ----------

const AuditPage = ({ id, back }: { id: string; back: () => void }) => {
  const [detail, setDetail] = useState<AuditDetail>();
  const [error, setError] = useState<string>();
  const [report, setReport] = useState<ReportUpload>();
  const [reimporting, setReimporting] = useState(false);
  const [reimportError, setReimportError] = useState<string>();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    call<AuditDetail>(RESOLVERS.getAudit, { auditId: id }).then((r) => {
      if (cancelled) return;
      if (!r.ok) return setError(r.error);
      setDetail(r.data);
      const state = r.data.summary.import.state;
      if (state === "queued" || state === "running") setTimeout(() => setTick((t) => t + 1), 2000);
    });
    return () => {
      cancelled = true;
    };
  }, [id, tick]);

  const reimport = async () => {
    if (!report) return;
    setReimporting(true);
    setReimportError(undefined);
    const r = await call<AuditSummary>(RESOLVERS.reimport, { auditId: id, report });
    setReimporting(false);
    if (!r.ok) return setReimportError(r.error);
    setReport(undefined);
    setTick((t) => t + 1);
  };

  if (error)
    return (
      <SectionMessage appearance="error" title="Couldn't load this audit">
        <Text>{error}</Text>
      </SectionMessage>
    );
  if (!detail) return <Spinner label="Loading audit" />;
  const { summary, findings, lastImport } = detail;
  const importing = summary.import.state === "queued" || summary.import.state === "running";

  const head = {
    cells: [
      { key: "id", content: "ID", isSortable: true },
      { key: "severity", content: "Severity" },
      { key: "title", content: "Finding" },
      { key: "file", content: "Location" },
      { key: "status", content: "Status" },
      { key: "jira", content: "Issue" },
    ],
  };
  const rows = findings.map((f) => ({
    key: f.id,
    cells: [
      { key: f.externalId, content: <Code>{f.externalId}</Code> },
      { key: "severity", content: <SeverityLozenge severity={f.severity} /> },
      { key: "title", content: <Text maxLines={2}>{f.title}</Text> },
      {
        key: "file",
        content: f.sourceUrl ? (
          <Link href={f.sourceUrl} openNewTab>
            {f.lines ? `${f.file}#L${f.lines[0]}` : f.file}
          </Link>
        ) : (
          <Text color="color.text.subtlest">No location</Text>
        ),
      },
      { key: "status", content: <StatusLozenge status={f.status} /> },
      {
        key: "jira",
        content: f.jiraKey ? (
          <Link href={`/browse/${f.jiraKey}`}>{f.jiraKey}</Link>
        ) : (
          <Text color="color.text.subtlest">Pending</Text>
        ),
      },
    ],
  }));

  return (
    <Stack space="space.300">
      <Inline spread="space-between" alignBlock="start">
        <Stack space="space.050">
          <Heading as="h2" size="medium">
            {summary.name}
          </Heading>
          <Inline space="space.100" alignBlock="center" shouldWrap>
            <Text>{summary.auditor}</Text>
            <Text color="color.text.subtlest">·</Text>
            <Text>{summary.repo}</Text>
            <Text color="color.text.subtlest">· audited at</Text>
            <Code>{shortSha(summary.auditedCommit)}</Code>
          </Inline>
        </Stack>
        <Button appearance="subtle" onClick={back}>
          Back to audits
        </Button>
      </Inline>

      <ImportMessage status={summary.import} />
      {!importing ? <GateMessage gate={summary.gate} /> : null}

      <Inline space="space.300" shouldWrap>
        <Stack space="space.050">
          <Text weight="semibold">By severity</Text>
          <SeverityCounts counts={summary.bySeverity} />
        </Stack>
        <Stack space="space.050">
          <Text weight="semibold">Last import</Text>
          <Text>
            {[
              lastImport.added.length ? `${lastImport.added.length} new` : "",
              lastImport.changed.length ? `${lastImport.changed.length} changed` : "",
              lastImport.unchanged.length ? `${lastImport.unchanged.length} unchanged` : "",
              lastImport.missing.length
                ? `${lastImport.missing.length} no longer in the report (${lastImport.missing.join(", ")})`
                : "",
            ]
              .filter(Boolean)
              .join(", ") || "Nothing imported yet."}
          </Text>
        </Stack>
      </Inline>

      <DynamicTable head={head} rows={rows} label="Findings" rowsPerPage={25} defaultSortKey="id" />

      {!importing ? (
        <CheckChange auditId={summary.id} auditedCommit={summary.auditedCommit} />
      ) : null}

      <Box xcss={card}>
        <Stack space="space.150">
          <Heading as="h3" size="small">
            Re-import the report
          </Heading>
          <Text>
            Upload a newer version of the same report. Existing issues are updated, new findings get
            new issues, and statuses are kept. Nothing is duplicated.
          </Text>
          <ReportInput onReport={setReport} />
          {reimportError ? <ErrorMessage>{reimportError}</ErrorMessage> : null}
          <Inline>
            <LoadingButton
              isLoading={reimporting}
              isDisabled={!report || importing}
              onClick={reimport}
            >
              Re-import
            </LoadingButton>
          </Inline>
        </Stack>
      </Box>
    </Stack>
  );
};

const App = () => {
  const [view, setView] = useState<View>({ name: "list" });
  const toList = useCallback(() => setView({ name: "list" }), []);
  const open = useCallback((id: string) => setView({ name: "audit", id }), []);

  if (view.name === "new") return <NewAudit done={open} cancel={toList} />;
  if (view.name === "audit") return <AuditPage id={view.id} back={toList} />;
  return <AuditList open={open} create={() => setView({ name: "new" })} />;
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

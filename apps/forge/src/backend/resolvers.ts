import Resolver from "@forge/resolver";
import type {
  AuditDetail,
  AuditSummary,
  ChangeStatusInput,
  CheckChangeInput,
  CheckChangeResult,
  CreateAuditInput,
  PanelView,
  ReimportInput,
  ReportPreview,
  ReportUpload,
  Result,
} from "../shared/contract";
import { RESOLVERS } from "../shared/contract";
import { deps } from "./deps";
import { JiraError, UserError } from "./ports";
import * as service from "./service";

interface Ctx {
  accountId?: string;
  extension?: {
    project?: { id?: string | number; key?: string };
    issue?: { id?: string | number; key?: string };
  };
}

/** Wraps a handler so the UI always gets { ok, data } or { ok: false, error } in plain words. */
async function run<T>(fn: () => Promise<T> | T): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    if (error instanceof UserError || error instanceof JiraError)
      return { ok: false, error: error.message };
    console.error("AuditGate resolver error", error);
    return {
      ok: false,
      error:
        "Something went wrong on our side. Try again, and if it keeps happening, check the app logs.",
    };
  }
}

function project(ctx: Ctx): { projectId: string; projectKey: string } {
  const id = ctx.extension?.project?.id;
  const key = ctx.extension?.project?.key;
  if (id === undefined || !key) throw new UserError("Open AuditGate from a Jira project.");
  return { projectId: String(id), projectKey: key };
}

function caller(ctx: Ctx): service.Caller {
  if (!ctx.accountId) throw new UserError("You need to be logged in to do this.");
  return { ...project(ctx), accountId: ctx.accountId };
}

function issueId(ctx: Ctx): string {
  const id = ctx.extension?.issue?.id;
  if (id === undefined) throw new UserError("Open this panel from a Jira issue.");
  return String(id);
}

const projectResolver = new Resolver()
  .define<ReportUpload, Result<ReportPreview>>(RESOLVERS.previewReport, ({ payload }) =>
    run(() => service.previewReport(payload)),
  )
  .define<CreateAuditInput, Result<AuditSummary>>(RESOLVERS.createAudit, ({ payload, context }) =>
    run(() => service.createAudit(deps, caller(context), payload)),
  )
  .define<ReimportInput, Result<AuditSummary>>(RESOLVERS.reimport, ({ payload, context }) =>
    run(() => service.reimport(deps, caller(context), payload)),
  )
  .define<void, Result<AuditSummary[]>>(RESOLVERS.listAudits, ({ context }) =>
    run(() => service.listAudits(deps, project(context).projectId)),
  )
  .define<{ auditId: string }, Result<AuditDetail>>(RESOLVERS.getAudit, ({ payload, context }) =>
    run(() => service.getAudit(deps, project(context).projectId, payload.auditId)),
  )
  .define<CheckChangeInput, Result<CheckChangeResult>>(
    RESOLVERS.checkChange,
    ({ payload, context }) =>
      run(() => service.checkChange(deps, project(context).projectId, payload)),
  );

const panelResolver = new Resolver()
  .define<void, Result<PanelView | null>>(RESOLVERS.getPanel, ({ context }) =>
    run(() => service.getPanel(deps, issueId(context))),
  )
  .define<ChangeStatusInput, Result<PanelView>>(RESOLVERS.changeStatus, ({ payload, context }) =>
    run(() => {
      if (!context.accountId) throw new UserError("You need to be logged in to do this.");
      return service.changeStatus(deps, issueId(context), context.accountId, payload);
    }),
  );

export const projectPageHandler = projectResolver.getDefinitions();
export const issuePanelHandler = panelResolver.getDefinitions();

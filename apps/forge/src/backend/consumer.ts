import type { AsyncEvent } from "@forge/events";
import { deps } from "./deps";
import { runImport, type ImportJob } from "./service";

/** Queue consumer for imports. runImport is idempotent, so platform retries are safe. */
export async function importConsumer(event: AsyncEvent): Promise<void> {
  const body = event.body as Partial<ImportJob>;
  if (!body.projectId || !body.auditId) {
    console.error("AuditGate import event without projectId or auditId", event.jobId);
    return;
  }
  await runImport(deps, { projectId: body.projectId, auditId: body.auditId });
}

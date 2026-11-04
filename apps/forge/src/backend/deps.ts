import { Queue } from "@forge/events";
import { forgeJira, forgeUserJira } from "./forge-jira";
import { forgeStore } from "./forge-store";
import type { Deps, ImportJob } from "./service";

export const IMPORT_QUEUE = "auditgate-import";

const queue = new Queue({ key: IMPORT_QUEUE });

/** Ten hex characters: short enough for labels like audit-1a2b3c4d5e, unique enough per site. */
function newId(): string {
  return globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 10);
}

export const deps: Deps = {
  store: forgeStore,
  jira: forgeJira,
  userJira: forgeUserJira,
  queue: {
    async push(job: ImportJob) {
      await queue.push({ body: { ...job } });
    },
  },
  now: () => new Date().toISOString(),
  newId,
};

import { randomBytes } from "node:crypto";
import { Queue } from "@forge/events";
import { kvs } from "@forge/kvs";
import { forgeJira, forgeUserJira } from "./forge-jira";
import { forgeStore } from "./forge-store";
import type { Deps, ImportJob } from "./service";

export const IMPORT_QUEUE = "auditgate-import";

const queue = new Queue({ key: IMPORT_QUEUE });

/** Ten hex characters: short enough for labels like audit-1a2b3c4d5e, unique enough per site. */
function newId(): string {
  return globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 10);
}

const SIGNING_SECRET_KEY = "signing-secret";

/** One secret per installation. Two first calls racing both read back the one that won. */
async function signingSecret(): Promise<string> {
  const existing = await kvs.getSecret<string>(SIGNING_SECRET_KEY);
  if (existing) return existing;
  try {
    await kvs.setSecret(SIGNING_SECRET_KEY, randomBytes(32).toString("hex"), {
      keyPolicy: "FAIL_IF_EXISTS",
    });
  } catch {
    // Another invocation created it first.
  }
  const created = await kvs.getSecret<string>(SIGNING_SECRET_KEY);
  if (!created) throw new Error("Couldn't create the AuditGate signing secret.");
  return created;
}

export const deps: Deps = {
  store: forgeStore,
  jira: forgeJira,
  userJira: forgeUserJira,
  secrets: { signingSecret },
  queue: {
    async push(job: ImportJob) {
      await queue.push({ body: { ...job } });
    },
  },
  now: () => new Date().toISOString(),
  newId,
};

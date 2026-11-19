import Resolver from "@forge/resolver";
import type {
  Result,
  SaveSettingsInput,
  SaveSettingsResult,
  SettingsStatus,
} from "../shared/contract";
import { RESOLVERS } from "../shared/contract";
import { CheckError, runMergeCheck, unwrapUuid, type MergeCheckEvent } from "./check";
import { deleteConfig, forgeBitbucket, forgeJira, loadConfig, saveConfig } from "./forge";
import {
  SettingsError,
  disconnect,
  getSettings,
  repoFromLocation,
  saveSettings,
  type SettingsDeps,
  type Where,
} from "./settings";

/** bitbucket:mergeCheck entry point. Any error fails the check, with a message saying why. */
export async function mergeCheck(event: MergeCheckEvent) {
  try {
    return await runMergeCheck(
      { config: loadConfig, bitbucket: forgeBitbucket, jira: forgeJira },
      event,
    );
  } catch (error) {
    if (error instanceof CheckError) {
      return { success: false, message: `AuditGate couldn't run: ${error.message}` };
    }
    console.error("AuditGate merge check failed", error);
    return {
      success: false,
      message:
        "AuditGate couldn't run because of an unexpected error. Re-run the check, and if it keeps failing, check the app logs.",
    };
  }
}

const settingsDeps: SettingsDeps = {
  load: loadConfig,
  save: saveConfig,
  remove: deleteConfig,
  jira: forgeJira,
};

interface Ctx {
  extension?: { repository?: { uuid?: string }; location?: string };
}

function where(ctx: Ctx): Where {
  const uuid = ctx.extension?.repository?.uuid;
  const repo = repoFromLocation(ctx.extension?.location);
  if (!uuid || !repo) throw new SettingsError("Open this page from a repository's settings.");
  return { repoUuid: unwrapUuid(uuid), repo };
}

async function run<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    if (error instanceof SettingsError) return { ok: false, error: error.message };
    console.error("AuditGate settings error", error);
    return { ok: false, error: "Something went wrong on our side. Try again in a moment." };
  }
}

export const settingsHandler = new Resolver()
  .define<void, Result<SettingsStatus>>(RESOLVERS.getSettings, ({ context }) =>
    run(() => getSettings(settingsDeps, where(context))),
  )
  .define<SaveSettingsInput, Result<SaveSettingsResult>>(
    RESOLVERS.saveSettings,
    ({ payload, context }) => run(() => saveSettings(settingsDeps, where(context), payload)),
  )
  .define<void, Result<null>>(RESOLVERS.disconnect, ({ context }) =>
    run(async () => {
      await disconnect(settingsDeps, where(context));
      return null;
    }),
  )
  .getDefinitions();

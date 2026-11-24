import Resolver from "@forge/resolver";
import type {
  Result,
  SaveSettingsInput,
  SaveSettingsResult,
  SettingsStatus,
} from "../shared/contract";
import { RESOLVERS } from "../shared/contract";
import { CheckError, runMergeCheck, type MergeCheckEvent } from "./check";
import {
  deleteConfig,
  forgeBitbucket,
  forgeJira,
  loadConfig,
  loadWriteBack,
  saveConfig,
  saveWriteBack,
} from "./forge";
import {
  SettingsError,
  disconnect,
  getSettings,
  resolveWhere,
  saveSettings,
  type PageContext,
  type SettingsDeps,
  type Where,
} from "./settings";

/** bitbucket:mergeCheck entry point. Any error fails the check, with a message saying why. */
export async function mergeCheck(event: MergeCheckEvent) {
  try {
    return await runMergeCheck(
      { config: loadConfig, bitbucket: forgeBitbucket, jira: forgeJira, saveWriteBack },
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
  lastWriteBack: loadWriteBack,
  jira: forgeJira,
};

function where(ctx: PageContext): Promise<Where> {
  return resolveWhere(ctx, forgeBitbucket);
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
    run(async () => getSettings(settingsDeps, await where(context))),
  )
  .define<SaveSettingsInput, Result<SaveSettingsResult>>(
    RESOLVERS.saveSettings,
    ({ payload, context }) =>
      run(async () => saveSettings(settingsDeps, await where(context), payload)),
  )
  .define<void, Result<null>>(RESOLVERS.disconnect, ({ context }) =>
    run(async () => {
      await disconnect(settingsDeps, await where(context));
      return null;
    }),
  )
  .getDefinitions();

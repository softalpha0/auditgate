/** Shapes passed between the settings page and its resolver. */

export interface SettingsStatus {
  /** "workspace/slug", lowercase. */
  repo: string;
  connected: boolean;
  cloudId?: string;
  email?: string;
}

export interface SaveSettingsInput {
  cloudId: string;
  email: string;
  /** Leave empty to keep the token already saved. */
  token: string;
  /** Leave empty to keep the secret already saved. */
  signingSecret: string;
}

export interface SaveSettingsResult {
  findings: number;
  audits: string[];
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export const RESOLVERS = {
  getSettings: "getSettings",
  saveSettings: "saveSettings",
  disconnect: "disconnect",
} as const;

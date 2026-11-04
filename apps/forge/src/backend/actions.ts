import * as agent from "./agent";
import { deps } from "./deps";
import { JiraError, UserError } from "./ports";

/**
 * Forge entry points for the Rovo actions (also exposed as MCP tools). Each returns plain JSON.
 * Problems the user can fix come back as { error } in plain words, so the agent can relay them.
 */
type Handler = (d: typeof deps, payload: agent.ActionPayload) => Promise<unknown>;

function wrap(name: string, handler: Handler) {
  return async (payload: agent.ActionPayload) => {
    try {
      return await handler(deps, payload ?? {});
    } catch (error) {
      if (error instanceof UserError || error instanceof JiraError) return { error: error.message };
      console.error(`AuditGate action ${name} failed`, error);
      return { error: "AuditGate couldn't answer this right now. Try again in a moment." };
    }
  };
}

export const releaseReadinessAction = wrap("release-readiness", agent.releaseReadiness);
export const listOpenFindingsAction = wrap("list-open-findings", agent.listOpenFindings);
export const getFindingAction = wrap("get-finding", agent.getFinding);
export const checkDriftAction = wrap("check-drift", agent.checkDrift);

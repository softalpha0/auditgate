import { invoke } from "@forge/bridge";
import type { Result } from "../shared/contract";
import type { RESOLVERS } from "../shared/contract";

type ResolverKey = (typeof RESOLVERS)[keyof typeof RESOLVERS];

/** Calls a resolver and turns transport failures into the same { ok: false } shape. */
export async function call<T>(key: ResolverKey, payload?: object): Promise<Result<T>> {
  try {
    const response = await invoke<Result<T>>(key, payload as Record<string, unknown> | undefined);
    // invoke() wraps the body only when response metadata is requested; accept both forms.
    if (response && typeof response === "object" && "ok" in response) return response;
    if (response && typeof response === "object" && "body" in response) return response.body;
    return { ok: false, error: "AuditGate sent an empty response. Try again." };
  } catch {
    return { ok: false, error: "Couldn't reach AuditGate. Check your connection and try again." };
  }
}

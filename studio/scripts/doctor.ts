/** Read-only startup diagnostics. Never constructs a provider client or prints credentials. */
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { loadStudioEnv } from "./env.ts";
import { prepareKickoff } from "./kickoff.ts";

export function studioDiagnostics(
  env: Record<string, string | undefined>,
  now = Date.now(),
) {
  let kickoffReady = false,
    blocker: string | null = null;
  try {
    prepareKickoff([], env, now);
    kickoffReady = true;
  } catch (error) {
    blocker =
      error instanceof Error
        ? error.message
        : "Live configuration is incomplete";
  }
  const parsed = Number(env.PORT ?? 8790),
    port =
      Number.isInteger(parsed) && parsed > 0 && parsed <= 65535 ? parsed : null;
  return {
    localUrl: port === null ? null : `http://127.0.0.1:${port}`,
    localSetupError:
      port === null && parsed !== 0
        ? "PORT must be an integer from 0 to 65535"
        : null,
    ephemeralPort: parsed === 0,
    providerKeyConfigured: Boolean(env.NAIVE_API_KEY?.trim()),
    liveAuthorized: env.STUDIO_LIVE_AUTHORIZED === "true",
    kickoffReady,
    blocker,
    note: "Readiness is local configuration, not provider access, credit verification or an already-running founder. No provider request was made.",
  };
}
export async function doctor(
  env: Record<string, string | undefined> = process.env,
) {
  loadStudioEnv(env);
  const result = studioDiagnostics(env);
  let server = result.localUrl
    ? "not_running"
    : result.ephemeralPort
      ? "ephemeral_port_unknown"
      : "configuration_error";
  try {
    if (!result.localUrl) return { ...result, server };
    const r = await fetch(result.localUrl + "/health", {
      signal: AbortSignal.timeout(1500),
      redirect: "error",
    });
    server = r.ok && (await r.text()).trim() === "ok" ? "running" : "unhealthy";
  } catch {}
  return { ...result, server };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  doctor()
    .then((x) => console.log(JSON.stringify(x, null, 2)))
    .catch(() => {
      console.error(
        "Local setup diagnostics failed; no credential values were printed.",
      );
      process.exitCode = 1;
    });
}

/** Log a truthful human intervention to the explicitly selected studio's public dashboard. */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function interventionRequest(
  args: string[],
  env: Record<string, string | undefined>,
) {
  const base = env["PMF_APP_URL"],
    token = env["PMF_ADMIN_TOKEN"],
    description = args.join(" ").trim();
  if (!base || !token)
    throw new Error("Set PMF_APP_URL and PMF_ADMIN_TOKEN first.");
  const url = new URL(base);
  if (
    url.username ||
    url.password ||
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      ))
  )
    throw new Error(
      "PMF_APP_URL must be HTTPS, or HTTP localhost for development, without embedded credentials.",
    );
  if (!description || description.length > 1000)
    throw new Error(
      "Describe the actual intervention in 1–1,000 characters. It is public; omit private information.",
    );
  return { url: new URL("/api/interventions", url), token, description };
}

export async function intervene(
  args: string[],
  env: Record<string, string | undefined>,
  transport: typeof fetch = fetch,
) {
  const request = interventionRequest(args, env);
  const response = await transport(request.url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${request.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ description: request.description }),
    signal: AbortSignal.timeout(15_000),
    redirect: "error",
  });
  if (!response.ok)
    throw new Error(`Intervention was not accepted (HTTP ${response.status}).`);
  return response.status;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  intervene(process.argv.slice(2), process.env)
    .then((status) => console.log(`Intervention recorded: HTTP ${status}.`))
    .catch((error) => {
      console.error(
        error instanceof Error ? error.message : "Intervention failed.",
      );
      process.exitCode = 1;
    });
}

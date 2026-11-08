/** Load ignored local configuration without executing shell text or overriding exported settings. */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

export const STUDIO_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
);
export function loadStudioEnv(
  env: Record<string, string | undefined> = process.env,
  files: string[] = [
    resolve(STUDIO_ROOT, "../.env"),
    resolve(STUDIO_ROOT, ".env"),
  ],
) {
  const exported = new Set(
    Object.keys(env).filter((key) => env[key] !== undefined),
  );
  const loaded: string[] = [];
  for (const file of files) {
    if (!existsSync(file)) continue;
    let values: Record<string, string | undefined>;
    try {
      values = parseEnv(readFileSync(file, "utf8"));
    } catch {
      throw new Error(
        "A local environment file could not be read. Check its permissions and syntax.",
      );
    }
    for (const [key, value] of Object.entries(values))
      if (value !== undefined && !exported.has(key)) env[key] = value;
    loaded.push(file);
  }
  return loaded;
}

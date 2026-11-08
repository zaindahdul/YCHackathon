/**
 * Builds `dist/`, which is what `naive.config.ts` ships as the app (`deploy_dir: "dist"`).
 *
 * Naïve hosts a `fullstack` app the way its own agency blueprint is built: files under
 * `dist/api/` become functions, `dist/vercel.json` holds the rewrites, and `dist/package.json`
 * is installed on the host. One function serves every path, so the pages, the signup form and
 * the agents' MCP endpoint share one warm instance and one code path.
 */
import { build } from "esbuild";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, "dist");

rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, "api"), { recursive: true });

await build({
  entryPoints: [join(root, "server", "entry.ts")],
  outfile: join(dist, "api", "app.js"),
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  // Installed on the host from dist/package.json rather than inlined.
  external: ["pg"],
  logLevel: "warning",
});

// Everything goes to the one function, with the original path stated in `__path`. The host
// checks the filesystem first, so `/api/app` itself is served directly.
writeFileSync(
  join(dist, "vercel.json"),
  `${JSON.stringify({ rewrites: [{ source: "/(.*)", destination: "/api/app?__path=/$1" }] }, null, 2)}\n`,
);

writeFileSync(
  join(dist, "package.json"),
  `${JSON.stringify({ name: "pmf-app", private: true, type: "module", dependencies: { pg: "^8.16.3" } }, null, 2)}\n`,
);

// A static fallback so the deployment is never an empty tree.
writeFileSync(join(dist, "robots.txt"), "User-agent: *\nAllow: /\n");

process.stdout.write("built dist/api/app.js, dist/vercel.json, dist/package.json\n");

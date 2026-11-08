import { expect, it } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadStudioEnv } from "../scripts/env.ts";
import { studioDiagnostics } from "../scripts/doctor.ts";

it("workspace settings override root defaults while exported settings retain priority", () => {
  const dir = mkdtempSync(join(tmpdir(), "studio-env-"));
  try {
    const root = join(dir, "root.env"),
      local = join(dir, "studio.env");
    writeFileSync(
      root,
      "PORT=8700\nNAIVE_API_KEY=root-local-fixture\nSTUDIO_TOTAL_BUDGET_CENTS=100\n",
    );
    writeFileSync(
      local,
      "PORT=8790\nNAIVE_API_KEY=workspace-local-fixture\nSTUDIO_TOTAL_BUDGET_CENTS=300\n",
    );
    const env: Record<string, string | undefined> = { PORT: "8799" };
    expect(loadStudioEnv(env, [root, local])).toEqual([root, local]);
    expect(env.PORT).toBe("8799");
    expect(env.NAIVE_API_KEY).toBe("workspace-local-fixture");
    expect(env.STUDIO_TOTAL_BUDGET_CENTS).toBe("300");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
it("configuration is literal data and never executes shell substitutions", () => {
  const dir = mkdtempSync(join(tmpdir(), "studio-env-"));
  try {
    const marker = join(dir, "must-not-exist"),
      file = join(dir, "local.env");
    writeFileSync(file, `TEST_VALUE='$(touch ${marker})'\n`);
    const env: Record<string, string | undefined> = {};
    loadStudioEnv(env, [join(dir, "missing.env"), file]);
    expect(env.TEST_VALUE).toBe(`$(touch ${marker})`);
    expect(existsSync(marker)).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
it("diagnostics expose readiness booleans and never expose the credential", () => {
  const secret = "fixture-key-never-display";
  const env = {
    NAIVE_API_KEY: secret,
    STUDIO_LIVE_AUTHORIZED: "true",
    STUDIO_TOTAL_BUDGET_CENTS: "300",
    STUDIO_TASK_BUDGET_CENTS: "100",
    STUDIO_BUDGET_ID: "local-test-envelope",
    STUDIO_STOP_AT: "2100-01-01T00:00:00Z",
  };
  const report = studioDiagnostics(env);
  expect(report.providerKeyConfigured).toBe(true);
  expect(report.kickoffReady).toBe(true);
  expect(JSON.stringify(report)).not.toContain(secret);
  expect(
    studioDiagnostics({ ...env, STUDIO_TOTAL_BUDGET_CENTS: "100" })
      .kickoffReady,
  ).toBe(false); // default kickoff selects all three
  expect(studioDiagnostics({}).providerKeyConfigured).toBe(false);
  expect(studioDiagnostics({}).kickoffReady).toBe(false);
});
it("invalid port configuration cannot diagnose a different running server as this studio", () => {
  const report = studioDiagnostics({ PORT: "not-a-port" });
  expect(report.localUrl).toBeNull();
  expect(report.localSetupError).toMatch(/PORT/);
  const ephemeral = studioDiagnostics({ PORT: "0" });
  expect(ephemeral.localSetupError).toBeNull();
  expect(ephemeral.ephemeralPort).toBe(true);
  expect(ephemeral.localUrl).toBeNull();
});

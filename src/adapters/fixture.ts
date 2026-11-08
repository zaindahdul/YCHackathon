import type { AgentAdapter, AgentResult, AgentTask } from "./naive.js";
/** Offline test harness only. Never instantiated by the live CLI path. */
export class FixtureAdapter implements AgentAdapter {
  constructor(private readonly results: AgentResult[] = []) {}
  async run(task: AgentTask): Promise<AgentResult> {
    const fixture = this.results.shift();
    return (
      fixture ?? {
        status: "completed",
        summary: `SIMULATION fixture: ${task.kind}; no external work occurred`,
        output: { fixture: true, leads: [] },
        artifacts: [],
        costCents: 0,
        costKnown: true,
      }
    );
  }
}

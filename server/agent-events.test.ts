import { describe, expect, it } from "vitest";

import { parseClaudeActivityLine, parseCodexActivityLine } from "./agent-events.ts";

describe("agent activity event parsing", () => {
  it("maps field commands without returning the raw command", () => {
    const update = parseCodexActivityLine(JSON.stringify({
      type: "item.started",
      item: { id: "item-1", type: "command_execution", command: "npm run field -- context request-1 --token secret" },
    }));

    expect(update.event).toMatchObject({ id: "item-1", kind: "field", label: "Reading the current field", state: "active" });
    expect(JSON.stringify(update)).not.toContain("secret");
  });

  it("never exposes provider reasoning events", () => {
    const update = parseCodexActivityLine(JSON.stringify({
      type: "item.completed",
      item: { id: "reason-1", type: "reasoning", text: "private reasoning" },
    }));

    expect(update).toEqual({});
  });

  it("shows connector identity but not MCP arguments or results", () => {
    const update = parseCodexActivityLine(JSON.stringify({
      type: "item.started",
      item: {
        id: "mcp-1",
        type: "mcp_tool_call",
        server: "notion",
        tool: "search",
        arguments: { query: "confidential launch" },
      },
    }));

    expect(update.event).toMatchObject({ kind: "connector", detail: "notion · search" });
    expect(JSON.stringify(update)).not.toContain("confidential launch");
  });

  it("ignores Claude thinking while classifying safe tool milestones", () => {
    const updates = parseClaudeActivityLine(JSON.stringify({
      type: "assistant",
      message: {
        content: [
          { type: "thinking", thinking: "private chain of thought" },
          { type: "tool_use", id: "tool-1", name: "Bash", input: { command: "npm run field -- apply work/ops.json --token secret" } },
        ],
      },
    }));

    expect(updates).toHaveLength(1);
    expect(updates[0]?.event).toMatchObject({ id: "tool-1", kind: "field", label: "Applying grounded changes" });
    expect(JSON.stringify(updates)).not.toContain("private chain of thought");
    expect(JSON.stringify(updates)).not.toContain("secret");
  });

  it("does not mislabel unknown local tools as connectors", () => {
    const updates = parseClaudeActivityLine(JSON.stringify({
      type: "assistant",
      message: { content: [{ type: "tool_use", id: "tool-2", name: "TodoWrite", input: {} }] },
    }));

    expect(updates[0]?.event).toMatchObject({ kind: "status", label: "Working through the next step" });
  });
});

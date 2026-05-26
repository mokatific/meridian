import { describe, it, expect, vi, beforeEach } from "vitest";

const llmCreate = vi.fn();
const executeToolMock = vi.fn();

vi.mock("openai", () => {
  class OpenAI {
    constructor() {
      this.chat = {
        completions: { create: (...args) => llmCreate(...args) },
      };
    }
  }
  return { default: OpenAI };
});

vi.mock("../../logger.js", () => ({ log: vi.fn() }));
vi.mock("../../config.js", () => ({
  config: {
    llm: {
      temperature: 0.3,
      maxTokens: 2048,
      maxSteps: 5,
    },
    darwin: { enabled: false },
  },
}));
vi.mock("../../prompt.js", () => ({
  buildSystemPrompt: vi.fn(() => "SYSTEM-PROMPT"),
}));
vi.mock("../../tools/executor.js", () => ({
  executeTool: (...args) => executeToolMock(...args),
}));
vi.mock("../../tools/definitions.js", () => ({
  tools: [
    {
      type: "function",
      function: {
        name: "get_my_positions",
        description: "list positions",
        parameters: { type: "object", properties: {} },
      },
    },
    {
      type: "function",
      function: {
        name: "deploy_position",
        description: "deploy a position",
        parameters: { type: "object", properties: {} },
      },
    },
    {
      type: "function",
      function: {
        name: "get_top_candidates",
        description: "top candidates",
        parameters: { type: "object", properties: {} },
      },
    },
    {
      type: "function",
      function: {
        name: "self_update",
        description: "self-update",
        parameters: { type: "object", properties: {} },
      },
    },
  ],
}));
vi.mock("../../tools/wallet.js", () => ({
  getWalletBalances: vi.fn(async () => ({ sol: 1.0, tokens: [] })),
}));
vi.mock("../../tools/dlmm.js", () => ({
  getMyPositions: vi.fn(async () => []),
}));
vi.mock("../../state.js", () => ({ getStateSummary: vi.fn(() => "") }));
vi.mock("../../lessons.js", () => ({
  getLessonsForPrompt: vi.fn(() => []),
  getPerformanceSummary: vi.fn(() => null),
}));
vi.mock("../../decision-log.js", () => ({ getDecisionSummary: vi.fn(() => "") }));

let agentLoop;

beforeEach(async () => {
  vi.resetModules();
  llmCreate.mockReset();
  executeToolMock.mockReset();
  process.env.LLM_API_KEY = "test-key";
  process.env.OPENROUTER_API_KEY = "test-key";
  ({ agentLoop } = await import("../../agent.js"));
});

function llmTextResponse(content) {
  return {
    choices: [{ message: { role: "assistant", content, tool_calls: null } }],
  };
}

function llmToolCall(name, args = {}) {
  return {
    choices: [
      {
        message: {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: `call_${name}`,
              type: "function",
              function: { name, arguments: JSON.stringify(args) },
            },
          ],
        },
      },
    ],
  };
}

describe("agentLoop — basic flow", () => {
  it("returns the model's final content when no tool is called", async () => {
    llmCreate.mockResolvedValueOnce(llmTextResponse("Done — all clear."));
    const result = await agentLoop("how are you?", 3, [], "GENERAL");
    expect(result.content).toBe("Done — all clear.");
    expect(llmCreate).toHaveBeenCalledTimes(1);
  });

  it("dispatches a tool call, feeds the result back, and finishes", async () => {
    llmCreate
      .mockResolvedValueOnce(llmToolCall("get_my_positions", {}))
      .mockResolvedValueOnce(llmTextResponse("you have 0 positions."));
    executeToolMock.mockResolvedValueOnce({ positions: [] });

    const result = await agentLoop("list my positions", 3, [], "GENERAL");
    expect(executeToolMock).toHaveBeenCalledWith("get_my_positions", expect.any(Object));
    expect(result.content).toBe("you have 0 positions.");
  });

  it("filters tools to the MANAGER set when agentType=MANAGER", async () => {
    llmCreate.mockResolvedValueOnce(llmTextResponse("ok"));
    await agentLoop("anything", 1, [], "MANAGER");
    const callArgs = llmCreate.mock.calls[0][0];
    const toolNames = callArgs.tools.map((t) => t.function.name);
    expect(toolNames).toContain("get_my_positions");
    expect(toolNames).not.toContain("deploy_position");
    expect(toolNames).not.toContain("get_top_candidates");
  });

  it("filters tools to the SCREENER set when agentType=SCREENER", async () => {
    llmCreate.mockResolvedValueOnce(llmTextResponse("nothing qualifies"));
    await agentLoop("scan", 1, [], "SCREENER");
    const callArgs = llmCreate.mock.calls[0][0];
    const toolNames = callArgs.tools.map((t) => t.function.name);
    expect(toolNames).toContain("deploy_position");
    expect(toolNames).toContain("get_top_candidates");
    expect(toolNames).not.toContain("self_update");
  });

  it("stops after maxSteps even if the model keeps calling tools", async () => {
    llmCreate.mockResolvedValue(llmToolCall("get_my_positions", {}));
    executeToolMock.mockResolvedValue({ positions: [] });
    const result = await agentLoop("loop forever", 2, [], "GENERAL");
    expect(result).toBeDefined();
    expect(llmCreate.mock.calls.length).toBeLessThanOrEqual(3);
  });

  it("excludes intent-only tools (e.g. self_update) from GENERAL with no matching intent", async () => {
    llmCreate.mockResolvedValueOnce(llmTextResponse("hello"));
    await agentLoop("hello there", 1, [], "GENERAL");
    const callArgs = llmCreate.mock.calls[0][0];
    const toolNames = callArgs.tools.map((t) => t.function.name);
    expect(toolNames).not.toContain("self_update");
  });
});

describe("agentLoop — error handling", () => {
  it("rethrows when the LLM call fails persistently", async () => {
    const err = new Error("boom");
    llmCreate.mockRejectedValue(err);
    await expect(agentLoop("fail please", 1, [], "GENERAL")).rejects.toThrow();
  });
});

describe("agentLoop — reasoning_content recovery", () => {
  it("promotes reasoning_content to content when content is empty and no tool calls", async () => {
    llmCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            role: "assistant",
            content: null,
            reasoning_content: "I considered the options and concluded X is best.",
            tool_calls: null,
          },
        },
      ],
    });
    const result = await agentLoop("think it through", 2, [], "GENERAL");
    expect(result.content).toContain("considered the options");
  });

  it("strips <think>…</think> blocks from content", async () => {
    llmCreate.mockResolvedValueOnce(
      // model wraps reasoning in <think> tags inside content
      {
        choices: [
          {
            message: {
              role: "assistant",
              content: "<think>internal reasoning here</think>The answer is 42.",
              tool_calls: null,
            },
          },
        ],
      },
    );
    const result = await agentLoop("question", 2, [], "GENERAL");
    expect(result.content).not.toContain("<think>");
    expect(result.content).toContain("42");
  });
});

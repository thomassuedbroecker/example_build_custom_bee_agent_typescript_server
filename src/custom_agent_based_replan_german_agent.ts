import { Callback } from "bee-agent-framework/emitter/types";
import { Emitter } from "bee-agent-framework/emitter/emitter";
import { AgentError, BaseAgent, BaseAgentRunOptions } from "bee-agent-framework/agents/base";
import { GetRunContext } from "bee-agent-framework/context";
import { BaseMessage, Role } from "bee-agent-framework/llms/primitives/message";
import {
  createCustomGermanAgentOutputSchema,
  CustomGermanAgentState,
  CustomGermanAgentSystemPrompt,
  CustomGermanAgentAssistantPrompt,
} from "./custom_agent_based_replan_german_prompts.js";
import { BaseMemory } from "bee-agent-framework/memory/base";
import { UnconstrainedMemory } from "bee-agent-framework/memory/unconstrainedMemory";
import { JsonDriver } from "bee-agent-framework/llms/drivers/json";
import { AnyTool, Tool } from "bee-agent-framework/tools/base";
import { AnyChatLLM } from "bee-agent-framework/llms/chat";

// *********************************
// Agent definition
// ******************************** */

// *********************************
// Agent onput/output definitions
// ******************************** */

export interface CustomGermanAgentRunInput {
  prompt: string | null;
}

export interface CustomGermanAgentRunOutput {
  message: BaseMessage;
  intermediateMemory: BaseMemory;
}

export interface CustomGermanAgentToolCall {
  name: string;
  input: any;
}

export interface CustomGermanAgentEvents {
  update: Callback<{ state: CustomGermanAgentState }>;
  tool: Callback<
    | { type: "start"; tool: AnyTool; input: any; calls: CustomGermanAgentToolCall[] }
    | { type: "success"; tool: AnyTool; input: any; output: any; calls: CustomGermanAgentToolCall[] }
    | { type: "error"; tool: AnyTool; input: any; error: Error; calls: CustomGermanAgentToolCall[] }
  >;
}

interface Input {
  memory: BaseMemory;
  tools: AnyTool[];
  llm: AnyChatLLM;
}

// *********************************
// Agent Class
// ******************************** */

export class CustomGermanAgent extends BaseAgent<CustomGermanAgentRunInput, CustomGermanAgentRunOutput> {
  public emitter = Emitter.root.child<CustomGermanAgentEvents>({
    namespace: ["agent", "customGermanAgent"],
    creator: this,
  });

  constructor(protected readonly input: Input) {
    super();
  }

  protected async _run(
    input: CustomGermanAgentRunInput,
    _options: BaseAgentRunOptions,
    context: GetRunContext<this>,
  ): Promise<CustomGermanAgentRunOutput> {
    if (input.prompt !== null) {
      await this.memory.add(
        BaseMessage.of({
          role: Role.USER,
          text: input.prompt,
        }),
      );
    }

    const runner = await this.createRunner(context);

    let finalMessage: BaseMessage | undefined = undefined;
    while (!finalMessage) {
      const state = await runner.run();

      if (state.nextStep.type === "message") {
        finalMessage = BaseMessage.of({
          role: Role.USER,
          text: state.nextStep.message,
        });
      } else if (state.nextStep.type === "tool") {
        const toolResults = await runner.tools(state.nextStep.calls);
        await runner.memory.add(
          BaseMessage.of({
            role: Role.ASSISTANT,
            text: CustomGermanAgentAssistantPrompt.render({
              results: JSON.stringify(toolResults),
            }),
          }),
        );
      }
    }

    await this.memory.add(finalMessage);

    return {
      message: finalMessage,
      intermediateMemory: runner.memory,
    };
  }

  protected async createRunner(context: GetRunContext<this>) {
    const memory = new UnconstrainedMemory();
    await memory.addMany(this.memory.messages);

    const run = async (): Promise<CustomGermanAgentState> => {
      const driver = JsonDriver.fromTemplate(CustomGermanAgentSystemPrompt, this.input.llm);
      const schema = await createCustomGermanAgentOutputSchema(this.input.tools);
      const response = await driver.generate<CustomGermanAgentState>(schema.json, memory.messages, {
        options: { signal: context.signal },
      });
      await memory.add(
        BaseMessage.of({
          role: Role.ASSISTANT,
          text: response.raw.getTextContent(),
        }),
      );
      await context.emitter.emit("update", { state: response.parsed });
      return response.parsed;
    };

    const tools = async (calls: CustomGermanAgentToolCall[]) => {
      return await Promise.all(
        calls.map(async (call) => {
          const tool = this.input.tools.find((tool) => tool.name === call.name);
          if (!tool) {
            throw new AgentError(`Tool ${call.name} does not exist.`);
          }

          const meta = { input: call, tool, calls };
          await context.emitter.emit("tool", { type: "start", ...meta });
          try {
            const output = await tool.run(call.input, { signal: context.signal }).context({
              [Tool.contextKeys.Memory]: memory,
            });
            await context.emitter.emit("tool", { type: "success", ...meta, output });
            return output;
          } catch (error) {
            await context.emitter.emit("tool", { type: "error", ...meta, error });
            throw error;
          }
        }),
      );
    };

    return {
      memory,
      run,
      tools,
    };
  }

  get memory() {
    return this.input.memory;
  }

  set memory(memory: BaseMemory) {
    this.input.memory = memory;
  }
}
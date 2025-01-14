import "dotenv/config.js";
import { FrameworkError } from "bee-agent-framework/errors";
import { DuckDuckGoSearchTool } from "bee-agent-framework/tools/search/duckDuckGoSearch";
import { OpenMeteoTool } from "bee-agent-framework/tools/weather/openMeteo";
import { UnconstrainedMemory } from "bee-agent-framework/memory/unconstrainedMemory";
import { createConsoleReader } from "./helpers/io.js";
import { CustomGermanAgent } from "./custom_agent_based_replan_german_agent.js";
import { string, z } from "zod";

// watsonxChat
// watsonx configruation
import { WatsonXChatLLM } from "bee-agent-framework/adapters/watsonx/chat";
import { WatsonXLLM } from "bee-agent-framework/adapters/watsonx/llm";
import { PromptTemplate } from "bee-agent-framework/template";
import { BaseMessage, Role } from "bee-agent-framework/llms/primitives/message";

// Logging
import { Logger } from "bee-agent-framework/logger/logger";
import { BaseLLMEvents } from "bee-agent-framework/llms/base";

/// *******************************
/// 1. Chat model setup
/// *******************************

/// *******************************
/// 1.1 Define the watsonx model
/// *******************************
const llm_lama = new WatsonXLLM({
    modelId: "meta-llama/llama-3-70b-instruct",
    projectId: process.env.WATSONX_PROJECT_ID,
    baseUrl: process.env.WATSONX_BASE_URL,
    apiKey: process.env.WATSONX_API_KEY,
    parameters: {
      decoding_method: "greedy",
      max_new_tokens: 500,
    },
  });
  
/// *******************************
/// 1.2. The definition of a chat prompt template for the watsonx chat model
/// *******************************
const template = new PromptTemplate({
    schema: {
      messages: {
        system: "",
        user: "",
        assistant: "",
      },
    },
    template: `{{#messages}}{{#system}}<|begin_of_text|><|start_header_id|>system<|end_header_id|>
    
    {{system}}<|eot_id|>{{/system}}{{#user}}<|start_header_id|>user<|end_header_id|>
    
    {{user}}<|eot_id|>{{/user}}{{#assistant}}<|start_header_id|>assistant<|end_header_id|>
    
    {{assistant}}<|eot_id|>{{/assistant}}{{/messages}}<|start_header_id|>assistant<|end_header_id|>
    
    `,
});
  
/// *******************************
/// 1.3. LLM interaction configuration for the chat mode.
/// *******************************
const chatLLM = new WatsonXChatLLM({
    llm: llm_lama,
    config: {
      messagesToPrompt(messages: BaseMessage[]) {
        return template.render({
          messages: messages.map((message) => ({
            system: message.role === "system" ? [message.text] : [],
            user: message.role === "user" ? [message.text] : [],
            assistant: message.role === "assistant" ? [message.text] : [],
          })),
        });
      },
    }, 
});
  
/// *******************************
/// 2. Create a `createConsoleReader`; this was part of older helpers. The reader displays all the steps the agent takes easily.Create a logger for more detailed trace information.
/// *******************************
const logger = new Logger({ name: "app", level: "trace" });
const reader = createConsoleReader();

/// *******************************
/// 3. Create an agent instance with the chat model configuration
/// *******************************
const agent = new CustomGermanAgent({
  llm: chatLLM,
  memory: new UnconstrainedMemory(),
  tools: [new DuckDuckGoSearchTool(), new OpenMeteoTool()],
});

/// *******************************
/// 4. Execute the agent
/// *******************************
export async function runAgentCustomGerman (question :string ){
  try {
    let message = BaseMessage.of({ role: Role.USER, text: question }) 
    console.info("Message:\n" + message.text + "\n");
    let prompt = message.text;

    //for await (const { prompt } of reader) {
      const response = await agent.run({ prompt }).observe((emitter) => {
        emitter.on("update", async ({ state }) => {
          reader.write("Lookback 💭 🤖 :", state.lookback);
          state.plan.forEach((step) => reader.write("Step ➡️ ", step.title));
        });
        
        emitter.on("tool", (data) => {
          if (data.type === "start") {
            reader.write(`Tool 🛠️ `, `Start ${data.tool.name} with ${JSON.stringify(data.input)}`);
          } else if (data.type === "success") {
            reader.write(`Tool 🛠 `, `Success ${data.tool.name} with ${JSON.stringify(data.output)}`);
          } else if (data.type === "error") {
            reader.write(
              `🛠 Error ${data.tool.name}`,
              `with ${FrameworkError.ensure(data.error).dump()}`,
            );
          }
        });
        
        emitter.match("*.*", async (data: any, event) => {
          if (event.creator === chatLLM) {
            const eventName = event.name as keyof BaseLLMEvents;
            switch (eventName) {
              case "start":
                console.info("LLM Input");
                console.info(data.input);
                break;
              case "success":
                console.info("LLM Output");
                console.info(data.value.raw.finalResult);
                break;
              case "error":
                console.error(data);
                break;
            }
          }
        });
      });
      reader.write(`Agent 🤖 : `, response.message.text);
      let result = { "answer" : response.message.text}
      return result;
    //}
  } catch (error) {
    reader.write(`Agent (error) 🤖 : `, FrameworkError.ensure(error).dump());
    logger.error(FrameworkError.ensure(error).dump());
    let result = { "answer": FrameworkError.ensure(error).dump().toString() }
    return result;
  }
}
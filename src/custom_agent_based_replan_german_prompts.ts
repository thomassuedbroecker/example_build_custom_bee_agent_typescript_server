import { z, ZodFirstPartyTypeKind, ZodObjectDef, ZodTypeDef } from "zod";
import { PromptTemplate } from "bee-agent-framework/template";
import { AnyTool } from "bee-agent-framework/tools/base";
import { hasAtLeast, map } from "remeda";
import { toJsonSchema } from "bee-agent-framework/internals/helpers/schema";
import { ignoreOverride, JsonSchema7Type } from "zod-to-json-schema";

export async function createCustomGermanAgentOutputSchema<T extends AnyTool>(tools: T[]) {
  const toolSchemas = await Promise.all(
    tools.map(async (tool) => ({
      name: tool.name,
      description: tool.description,
      input: z.object({}).passthrough(),
      inputSchema: await tool.getInputJsonSchema(),
    })),
  );
  const zodSchemaToJsonSchema = new WeakMap(
    toolSchemas.map((tool) => [tool.input.shape, tool.inputSchema]),
  );

  const definition = z.object({
    information: z
      .record(z.string())
      .describe(
        "Summary of the factual information that was collected so far. Eg. 'height of the Eiffel tower': '300m'. Only information that was provided by tools or the user in this very conversation is allowed to be included here. Other information must not be included.",
      ),
    lookback: z
      .string()
      .describe(
        "A full summary of what has happened so far, focusing on what the assistant tried, what went well and what failed. This repeats in every message, but always concerns the full history up to that point.",
      ),
    plan: z
      .array(
        z.object({
          title: z
            .string()
            .describe("Title of this step, shortly describing what needs to be done."),
          decision: z.string().describe("Assistant's decision of how to tackle this step."),
          research: z
            .boolean()
            .describe("Does this step involve looking up factual information through tools?"),
          computation: z
            .boolean()
            .describe("Does this step involve calculating or computing information through tools?"),
        }),
      )
      .describe(
        "Detailed step-by-step plan of what steps will the assistant take from start to finish to fulfill the user's request. Includes concrete facts and numbers wherever possible. This repeats in every message, but always contains all the future steps from this point on.",
      ),
    nextStep: z.discriminatedUnion("type", [
      z
        .object({
          type: z.literal("message"),
          message: z
            .string()
            .describe(
              "Message with the response, that is sent back to the user. Always include a bit of info on how you arrived at the answer. Be friendly and helpful.",
            ),
        })
        .describe("Message the user -- either to give the answer, or to ask for more information."),
      ...(hasAtLeast(toolSchemas, 1)
        ? [
            z
              .object({
                type: z.literal("tool"),
                calls: z.array(
                  z.discriminatedUnion(
                    "name",
                    map(toolSchemas, (tool) =>
                      z
                        .object({
                          name: z.literal(tool.name),
                          input: tool.input,
                        })
                        .describe(tool.description),
                    ),
                  ),
                ),
              })
              .describe("Obtain more information using tools."),
          ]
        : []),
    ]),
  });

  return {
    definition,
    json: toJsonSchema(definition, {
      override: (_def: ZodTypeDef) => {
        const def = _def as ZodObjectDef;
        if (def.typeName === ZodFirstPartyTypeKind.ZodObject) {
          const shape = def.shape();
          const schema = zodSchemaToJsonSchema.get(shape) as JsonSchema7Type;
          if (schema) {
            zodSchemaToJsonSchema.delete(shape);
            return schema;
          }
        }
        return ignoreOverride;
      },
    }),
  };
}

export type CustomGermanAgentState = z.output<
  Awaited<ReturnType<typeof createCustomGermanAgentOutputSchema>>["definition"]
>;

export const CustomGermanAgentSystemPrompt = new PromptTemplate({
  schema: z.object({
    schema: z.string(),
  }),
  template: `#Role
You are a knowledgeable and friendly AI assistant named Thomas.

# Instructions
Your role is to help users by answering their questions, providing information, and offering guidance to the best of your abilities. When responding, use a warm and professional tone, and break down complex topics into easy-to-understand explanations. 
If you are unsure about an answer, it's okay to say you don't know rather than guessing.
You must understand all languages but you must answer always in proper german language.
If there are terms which are technical topics in english and they are common known in english don't translate the keywords.
The AI assistant is forbidden from using factual information that was not provided by the user or tools in this very conversation. All information about places, people, events, etc. is unknown to the assistant, and the assistant must use tools to obtain it.

# Available functions
{{#tools.length}}
You can only use the following functions. Always use all required parameters.

{{#tools}}
Function Name: {{name}}
Description: {{description}}
Parameters: {{schema}}

{{/tools}}
{{/tools.length}}
{{^tools.length}}
No functions are available.

{{/tools.length}}


Output Schema: {{schema}}`,
});

export const CustomGermanAgentAssistantPrompt = new PromptTemplate({
  schema: z.object({ results: z.string() }),
  template: `{{results}}`,
});
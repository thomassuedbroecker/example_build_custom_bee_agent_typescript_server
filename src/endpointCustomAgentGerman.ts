import { runAgentCustomGerman } from "./custom_agent_based_replan_german_execution.ts";
interface EndpointAgentCustomGermanOutput {
    answer: string;
}

interface EndpointAgentCustomGermanInput {
    question: string;
}

class EndpointAgentCustomGermanController {

    public async postResponse(input: EndpointAgentCustomGermanInput): Promise<EndpointAgentCustomGermanOutput> {
        let question= input.question;
        const agentCustomGerman= await runAgentCustomGerman(question)
        console.info("output: agentAgentCustomGerman");
        console.info("\n" + agentCustomGerman.answer + "\n");
        const output: EndpointAgentCustomGermanOutput = {
            answer: agentCustomGerman.answer
        };
        return output;
    }
}

export default EndpointAgentCustomGermanController;
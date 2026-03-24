import { getAgentFallbackModels } from "../shared/model-requirements";

export function getAgentModelFallbackRequirements(agent: string): string[] | undefined {
    return getAgentFallbackModels(agent);
}

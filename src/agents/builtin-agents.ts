import { DREAMER_AGENT } from "./dreamer";
import { HISTORIAN_AGENT } from "./historian";

export interface BuiltinAgentDefinition {
    id: string;
    category: "utility";
    description: string;
    hidden: boolean;
}

export const BUILTIN_AGENTS: BuiltinAgentDefinition[] = [
    {
        id: HISTORIAN_AGENT,
        category: "utility",
        description: "Background conversation compression agent.",
        hidden: true,
    },
    {
        id: DREAMER_AGENT,
        category: "utility",
        description: "Background memory maintenance agent.",
        hidden: true,
    },
];

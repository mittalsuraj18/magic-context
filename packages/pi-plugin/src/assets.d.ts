declare module "*.md" {
	const value: string;
	export default value;
}

declare module "*.lark" {
	const value: string;
	export default value;
}

declare module "*.py" {
	const value: string;
	export default value;
}

declare module "turndown-plugin-gfm" {
	import type TurndownService from "turndown";

	export const gfm: TurndownService.Plugin;
	export const tables: TurndownService.Plugin;
	export const strikethrough: TurndownService.Plugin;
	export const taskListItems: TurndownService.Plugin;
}

interface Response {
	bytes(): Promise<Uint8Array>;
}

export interface ToolEntry {
    enabled: boolean;
    primaryModel: string;
    secondaryModel?: string;
    tags: string[];
    type: string;
}
export interface CliToolsConfig {
    version: string;
    tools: Record<string, ToolEntry>;
}
/**
 * Load CLI tools configuration from ~/.maestro/cli-tools.json.
 * Returns a default empty config if the file does not exist or is invalid.
 */
export declare function loadCliToolsConfig(): Promise<CliToolsConfig>;
export interface SelectedTool {
    name: string;
    entry: ToolEntry;
}
/**
 * Select a tool by explicit name or fall back to the first enabled tool.
 * Returns undefined when no tool can be resolved.
 */
export declare function selectTool(name: string | undefined, config: CliToolsConfig): SelectedTool | undefined;

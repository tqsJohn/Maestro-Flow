/**
 * CCW-style Tool Schema & Result types
 *
 * Used by ported CCW tools that follow the { schema, handler } export pattern.
 * The adapter function converts CCW ToolResult → maestro ToolResult.
 */

// Tool Schema definition (MCP compatible)
export interface ToolSchema {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

// Tool execution result (CCW format: { success, result, error })
export interface CcwToolResult<T = unknown> {
  success: boolean;
  result?: T;
  error?: string;
}

// Tool handler function type
export type CcwToolHandler<TParams = Record<string, unknown>, TResult = unknown> =
  (params: TParams) => Promise<CcwToolResult<TResult>>;

// Tool registration entry (CCW style)
export interface CcwToolRegistration<TParams = Record<string, unknown>> {
  schema: ToolSchema;
  handler: CcwToolHandler<TParams>;
}

// Maestro ToolResult format
export interface McpToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

/**
 * Convert CCW-style ToolResult to maestro MCP ToolResult
 */
export function ccwResultToMcp(ccwResult: CcwToolResult): McpToolResult {
  if (ccwResult.success) {
    const text = typeof ccwResult.result === 'string'
      ? ccwResult.result
      : JSON.stringify(ccwResult.result, null, 2);
    return { content: [{ type: 'text', text }] };
  } else {
    return {
      content: [{ type: 'text', text: ccwResult.error || 'Unknown error' }],
      isError: true,
    };
  }
}

import React from 'react';
import { Text } from 'ink';
import type { NormalizedEntry } from '@shared/agent-types.js';

import { UserMessageRow } from './UserMessageRow.js';
import { AssistantMessageRow } from './AssistantMessageRow.js';
import { ThinkingRow } from './ThinkingRow.js';
import { ToolUseRow } from './ToolUseRow.js';
import { FileChangeRow } from './FileChangeRow.js';
import { CommandExecRow } from './CommandExecRow.js';
import { ApprovalRequestRow, ApprovalResponseRow } from './ApprovalRow.js';
import { ErrorRow } from './ErrorRow.js';
import { StatusChangeRow } from './StatusChangeRow.js';
import { TokenUsageRow } from './TokenUsageRow.js';

// ---------------------------------------------------------------------------
// Component dispatch map — maps entry type to renderer
// ---------------------------------------------------------------------------

const ENTRY_RENDERERS: Record<string, React.ComponentType<{ entry: any }>> = {
  user_message: UserMessageRow,
  assistant_message: AssistantMessageRow,
  thinking: ThinkingRow,
  tool_use: ToolUseRow,
  file_change: FileChangeRow,
  command_exec: CommandExecRow,
  approval_request: ApprovalRequestRow,
  approval_response: ApprovalResponseRow,
  error: ErrorRow,
  status_change: StatusChangeRow,
  token_usage: TokenUsageRow,
};

export function EntryRow({ entry }: { entry: NormalizedEntry }) {
  const Renderer = ENTRY_RENDERERS[entry.type];
  if (!Renderer) return React.createElement(Text, { dimColor: true }, '[unknown entry]');
  return React.createElement(Renderer, { entry });
}

// Re-export individual components
export { UserMessageRow } from './UserMessageRow.js';
export { AssistantMessageRow } from './AssistantMessageRow.js';
export { ThinkingRow } from './ThinkingRow.js';
export { ToolUseRow } from './ToolUseRow.js';
export { FileChangeRow } from './FileChangeRow.js';
export { CommandExecRow } from './CommandExecRow.js';
export { ApprovalRequestRow, ApprovalResponseRow } from './ApprovalRow.js';
export { ErrorRow } from './ErrorRow.js';
export { StatusChangeRow } from './StatusChangeRow.js';
export { TokenUsageRow } from './TokenUsageRow.js';

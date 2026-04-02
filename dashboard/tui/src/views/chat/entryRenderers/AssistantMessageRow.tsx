import React from 'react';
import { Box } from 'ink';
import { Markdown, StreamingMarkdown } from '../../../components/Markdown.js';
import type { AssistantMessageEntry } from '@shared/agent-types.js';

export function AssistantMessageRow({ entry }: { entry: AssistantMessageEntry }) {
  if (entry.partial) {
    return (
      <Box>
        <StreamingMarkdown>{entry.content}</StreamingMarkdown>
      </Box>
    );
  }
  return (
    <Box>
      <Markdown>{entry.content}</Markdown>
    </Box>
  );
}

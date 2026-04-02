import React from 'react';
import { Box, Text } from 'ink';
import { type ViewId, routes } from './types.js';
import { IssueView } from '../views/IssueView.js';
import { WorkflowView } from '../views/WorkflowView.js';
import { ArtifactView } from '../views/ArtifactView.js';
import { TeamView } from '../views/TeamView.js';
import { RequirementView } from '../views/RequirementView.js';
import { ExecutionView } from '../views/ExecutionView.js';
import { ChatView } from '../views/ChatView.js';

// ---------------------------------------------------------------------------
// Placeholder view — replaced by real views as they are implemented
// ---------------------------------------------------------------------------

function PlaceholderView({ id, label }: { id: ViewId; label: string }) {
  return (
    <Box flexDirection="column" alignItems="center" justifyContent="center" flexGrow={1}>
      <Text bold color="cyan">{label}</Text>
      <Text dimColor>View: {id}</Text>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Router — renders active view based on prop
// ---------------------------------------------------------------------------

interface RouterProps {
  activeView: ViewId;
}

export function Router({ activeView }: RouterProps) {
  const active = routes.find((r) => r.id === activeView) ?? routes[0];

  return (
    <Box flexDirection="column" flexGrow={1}>
      {active.id === 'issue' ? (
        <IssueView />
      ) : active.id === 'workflow' ? (
        <WorkflowView />
      ) : active.id === 'artifact' ? (
        <ArtifactView />
      ) : active.id === 'team' ? (
        <TeamView />
      ) : active.id === 'requirement' ? (
        <RequirementView />
      ) : active.id === 'execution' ? (
        <ExecutionView />
      ) : active.id === 'chat' ? (
        <ChatView />
      ) : (
        <PlaceholderView id={active.id} label={active.label} />
      )}
    </Box>
  );
}

export { type ViewId };

// ---------------------------------------------------------------------------
// TUI Router types
// ---------------------------------------------------------------------------

export type ViewId =
  | 'issue'
  | 'workflow'
  | 'artifact'
  | 'team'
  | 'requirement'
  | 'execution'
  | 'chat';

export interface RouteConfig {
  key: string;
  id: ViewId;
  label: string;
}

export const routes: RouteConfig[] = [
  { key: '1', id: 'issue', label: 'Issues' },
  { key: '2', id: 'workflow', label: 'Workflow' },
  { key: '3', id: 'artifact', label: 'Artifacts' },
  { key: '4', id: 'team', label: 'Team' },
  { key: '5', id: 'requirement', label: 'Requirements' },
  { key: '6', id: 'execution', label: 'Execution' },
  { key: '7', id: 'chat', label: 'Chat' },
];

-- Tenant template: initial schema
-- __tenant__ will be replaced with actual tenant slug

CREATE TABLE IF NOT EXISTS __tenant__.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_by UUID,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS __tenant__.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES __tenant__.projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'todo',
  assignee_id UUID,
  created_by UUID,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON __tenant__.tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON __tenant__.tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee_id ON __tenant__.tasks(assignee_id);

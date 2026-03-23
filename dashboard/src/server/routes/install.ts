/**
 * Install Routes — Interactive install wizard API endpoints.
 *
 * Provides detect, execute, and manifest listing for the Maestro install wizard.
 */
import { Hono } from 'hono';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import {
  resolveSourceDir,
  scanAvailableSources,
  scanDisabledItems,
  restoreDisabledState,
  copyDirectory,
  saveManifest,
  findManifest,
  getAllManifests,
  createBackup,
  getPackageVersion,
  writeVersionFile,
  COMPONENT_DEFS,
  type Manifest,
  type ManifestEntry,
  type DetectionResult,
  type InstallResult,
} from './install-utils.js';

// ---------------------------------------------------------------------------
// MCP config helpers (reuse patterns from mcp.ts)
// ---------------------------------------------------------------------------

const CLAUDE_CONFIG_PATH = join(homedir(), '.claude.json');

function addGlobalMcpServer(name: string, config: unknown): { success?: boolean; error?: string } {
  try {
    if (!existsSync(CLAUDE_CONFIG_PATH)) {
      writeFileSync(CLAUDE_CONFIG_PATH, JSON.stringify({ mcpServers: {} }, null, 2), 'utf-8');
    }
    const cc = JSON.parse(readFileSync(CLAUDE_CONFIG_PATH, 'utf-8'));
    if (!cc.mcpServers) cc.mcpServers = {};
    cc.mcpServers[name] = config;
    writeFileSync(CLAUDE_CONFIG_PATH, JSON.stringify(cc, null, 2), 'utf-8');
    return { success: true };
  } catch (error: unknown) {
    return { error: (error as Error).message };
  }
}

function addProjectMcpServer(projectPath: string, name: string, config: unknown): { success?: boolean; error?: string } {
  try {
    const fp = join(projectPath, '.mcp.json');
    let mj: Record<string, unknown> = { mcpServers: {} };
    if (existsSync(fp)) {
      mj = JSON.parse(readFileSync(fp, 'utf-8'));
      if (!mj.mcpServers) mj.mcpServers = {};
    }
    (mj.mcpServers as Record<string, unknown>)[name] = config;
    writeFileSync(fp, JSON.stringify(mj, null, 2), 'utf-8');
    return { success: true };
  } catch (error: unknown) {
    return { error: (error as Error).message };
  }
}

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

export function createInstallRoutes(): Hono {
  const app = new Hono();

  // -------------------------------------------------------------------
  // POST /api/install/detect — Pre-install scan
  // -------------------------------------------------------------------

  app.post('/api/install/detect', async (c) => {
    const body = await c.req.json<{ mode: 'global' | 'project'; projectPath?: string }>();
    const { mode, projectPath } = body;

    if (!mode || (mode !== 'global' && mode !== 'project')) {
      return c.json({ error: 'mode must be "global" or "project"' }, 400);
    }
    if (mode === 'project' && (!projectPath || !projectPath.trim())) {
      return c.json({ error: 'projectPath required for project mode' }, 400);
    }

    // Resolve package root
    const thisDir = dirname(fileURLToPath(import.meta.url));
    const sourceDir = resolveSourceDir(thisDir);
    if (!sourceDir) {
      return c.json({ error: 'Could not find maestro package root' }, 500);
    }

    const components = scanAvailableSources(sourceDir, mode, projectPath);
    const existingManifest = findManifest(mode, projectPath);

    // Scan disabled items from the target location
    const targetBase = mode === 'global' ? homedir() : projectPath!;
    const disabledItems = scanDisabledItems(targetBase);

    const result: DetectionResult = {
      sourceDir,
      components,
      existingManifest,
      disabledItems,
    };

    return c.json(result);
  });

  // -------------------------------------------------------------------
  // POST /api/install/execute — Perform installation
  // -------------------------------------------------------------------

  app.post('/api/install/execute', async (c) => {
    const body = await c.req.json<{
      mode: 'global' | 'project';
      projectPath?: string;
      components: string[];
      backup: boolean;
      mcpConfig?: {
        enabled: boolean;
        enabledTools?: string[];
        projectRoot?: string;
      };
    }>();

    const { mode, projectPath, components, backup, mcpConfig } = body;

    if (!mode || !components?.length) {
      return c.json({ error: 'mode and components required' }, 400);
    }
    if (mode === 'project' && (!projectPath || !projectPath.trim())) {
      return c.json({ error: 'projectPath required for project mode' }, 400);
    }

    try {
      // Resolve source
      const thisDir = dirname(fileURLToPath(import.meta.url));
      const sourceDir = resolveSourceDir(thisDir);
      if (!sourceDir) {
        return c.json({ error: 'Could not find maestro package root' } satisfies Partial<InstallResult>, 500);
      }

      // Backup if requested
      if (backup) {
        const existing = findManifest(mode, projectPath);
        if (existing) {
          createBackup(existing);
        }
      }

      // Scan disabled items before overwriting
      const targetBase = mode === 'global' ? homedir() : projectPath!;
      const disabledItems = scanDisabledItems(targetBase);

      // Copy selected components
      const entries: ManifestEntry[] = [];
      let totalFiles = 0;
      let totalDirs = 0;

      for (const compId of components) {
        if (compId === 'mcp') continue; // MCP is handled separately

        const def = COMPONENT_DEFS.find((d) => d.id === compId);
        if (!def) continue;

        const src = join(sourceDir, def.sourcePath);
        const dest =
          mode === 'global' || def.alwaysGlobal
            ? def.globalTarget
            : def.projectTarget(projectPath ?? '');

        if (!existsSync(src)) continue;

        const { files, dirs } = copyDirectory(src, dest, entries);
        totalFiles += files;
        totalDirs += dirs;
      }

      // Restore disabled state
      const disabledRestored = restoreDisabledState(disabledItems, targetBase);

      // Write version file
      const version = getPackageVersion(sourceDir);
      const versionTarget =
        mode === 'global'
          ? join(homedir(), '.maestro')
          : projectPath!;
      writeVersionFile(versionTarget, version);

      // Register MCP config if requested
      let mcpRegistered = false;
      if (mcpConfig?.enabled && components.includes('mcp')) {
        const isWin = process.platform === 'win32';
        const env: Record<string, string> = {
          MAESTRO_ENABLED_TOOLS: mcpConfig.enabledTools?.join(',') ?? 'write_file,edit_file,read_file,read_many_files,team_msg,core_memory',
        };
        if (mcpConfig.projectRoot) env.MAESTRO_PROJECT_ROOT = mcpConfig.projectRoot;

        const serverConfig = {
          command: isWin ? 'cmd' : 'npx',
          args: isWin ? ['/c', 'npx', '-y', 'maestro-mcp'] : ['-y', 'maestro-mcp'],
          env,
        };

        const mcpResult =
          mode === 'project' && projectPath
            ? addProjectMcpServer(projectPath, 'maestro-tools', serverConfig)
            : addGlobalMcpServer('maestro-tools', serverConfig);

        mcpRegistered = 'success' in mcpResult && mcpResult.success === true;
      }

      // Save manifest
      const manifest: Manifest = {
        id: `${mode}-${Date.now()}`,
        mode,
        projectPath: mode === 'project' ? projectPath : undefined,
        timestamp: Date.now(),
        version,
        entries,
        components,
      };
      const manifestPath = saveManifest(manifest);

      const result: InstallResult = {
        success: true,
        filesInstalled: totalFiles,
        dirsCreated: totalDirs,
        manifestPath,
        disabledItemsRestored: disabledRestored,
        mcpRegistered,
        components,
      };

      return c.json(result);
    } catch (error: unknown) {
      return c.json({
        success: false,
        filesInstalled: 0,
        dirsCreated: 0,
        manifestPath: '',
        disabledItemsRestored: 0,
        mcpRegistered: false,
        components: [],
        error: (error as Error).message,
      } satisfies InstallResult, 500);
    }
  });

  // -------------------------------------------------------------------
  // GET /api/install/manifests — List existing installations
  // -------------------------------------------------------------------

  app.get('/api/install/manifests', (c) => {
    return c.json({ manifests: getAllManifests() });
  });

  return app;
}

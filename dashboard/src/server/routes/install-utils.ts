/**
 * Install Wizard Utilities — File operations for the Maestro install wizard.
 *
 * Handles source resolution, directory copying, manifest management,
 * backup creation, and disabled item scanning/restoration.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  copyFileSync,
  readFileSync,
  writeFileSync,
  renameSync,
} from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { homedir } from 'node:os';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ManifestEntry {
  src: string;
  dest: string;
  type: 'file' | 'directory';
}

export interface Manifest {
  id: string;
  mode: 'global' | 'project';
  projectPath?: string;
  timestamp: number;
  version: string;
  entries: ManifestEntry[];
  components: string[];
}

export interface ComponentInfo {
  id: string;
  label: string;
  sourceDir: string;
  targetDir: string;
  fileCount: number;
  available: boolean;
}

export interface DetectionResult {
  sourceDir: string;
  components: ComponentInfo[];
  existingManifest: Manifest | null;
  disabledItems: DisabledItem[];
}

export interface DisabledItem {
  name: string;
  relativePath: string;
  type: 'skill' | 'command' | 'agent';
}

export interface InstallResult {
  success: boolean;
  filesInstalled: number;
  dirsCreated: number;
  manifestPath: string;
  disabledItemsRestored: number;
  mcpRegistered: boolean;
  components: string[];
  error?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MANIFESTS_DIR = join(homedir(), '.maestro-manifests');

interface ComponentDef {
  id: string;
  label: string;
  sourcePath: string;
  globalTarget: string;
  projectTarget: (projectPath: string) => string;
  alwaysGlobal: boolean;
}

const COMPONENT_DEFS: ComponentDef[] = [
  {
    id: 'commands',
    label: 'Commands',
    sourcePath: '.claude/commands',
    globalTarget: join(homedir(), '.claude', 'commands'),
    projectTarget: (p) => join(p, '.claude', 'commands'),
    alwaysGlobal: false,
  },
  {
    id: 'agents',
    label: 'Agents',
    sourcePath: '.claude/agents',
    globalTarget: join(homedir(), '.claude', 'agents'),
    projectTarget: (p) => join(p, '.claude', 'agents'),
    alwaysGlobal: false,
  },
  {
    id: 'skills',
    label: 'Skills',
    sourcePath: '.claude/skills',
    globalTarget: join(homedir(), '.claude', 'skills'),
    projectTarget: (p) => join(p, '.claude', 'skills'),
    alwaysGlobal: false,
  },
  {
    id: 'workflows',
    label: 'Workflows',
    sourcePath: 'workflows',
    globalTarget: join(homedir(), '.maestro', 'workflows'),
    projectTarget: () => join(homedir(), '.maestro', 'workflows'),
    alwaysGlobal: true,
  },
  {
    id: 'templates',
    label: 'Templates',
    sourcePath: 'templates',
    globalTarget: join(homedir(), '.maestro', 'templates'),
    projectTarget: () => join(homedir(), '.maestro', 'templates'),
    alwaysGlobal: true,
  },
  {
    id: 'codex-skills',
    label: 'Codex Skills',
    sourcePath: '.codex/skills',
    globalTarget: join(homedir(), '.codex', 'skills'),
    projectTarget: (p) => join(p, '.codex', 'skills'),
    alwaysGlobal: false,
  },
];

// ---------------------------------------------------------------------------
// Source resolution
// ---------------------------------------------------------------------------

/**
 * Walk up from the given starting directory to find the maestro package root.
 * The root is identified by having a `package.json` with name containing "maestro".
 */
export function resolveSourceDir(startDir: string): string | null {
  let dir = startDir;
  for (let i = 0; i < 10; i++) {
    const pkgPath = join(dir, 'package.json');
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
        if (typeof pkg.name === 'string' && pkg.name.includes('maestro')) {
          return dir;
        }
      } catch {
        // not valid json, keep walking
      }
    }
    // Also check for .claude/commands as a fallback indicator
    if (existsSync(join(dir, '.claude', 'commands')) && existsSync(join(dir, 'workflows'))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Scanning
// ---------------------------------------------------------------------------

function countFiles(dir: string): number {
  if (!existsSync(dir)) return 0;
  let count = 0;
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile()) count++;
    else if (entry.isDirectory()) count += countFiles(join(dir, entry.name));
  }
  return count;
}

export function scanAvailableSources(
  sourceDir: string,
  mode: 'global' | 'project',
  projectPath?: string,
): ComponentInfo[] {
  return COMPONENT_DEFS.map((def) => {
    const fullSource = join(sourceDir, def.sourcePath);
    const fileCount = countFiles(fullSource);
    const targetDir =
      mode === 'global' || def.alwaysGlobal
        ? def.globalTarget
        : def.projectTarget(projectPath ?? '');
    return {
      id: def.id,
      label: def.label,
      sourceDir: fullSource,
      targetDir,
      fileCount,
      available: fileCount > 0,
    };
  });
}

// ---------------------------------------------------------------------------
// Disabled items
// ---------------------------------------------------------------------------

export function scanDisabledItems(targetPath: string): DisabledItem[] {
  const items: DisabledItem[] = [];

  // Scan skills for SKILL.md.disabled
  const skillsDir = join(targetPath, '.claude', 'skills');
  if (existsSync(skillsDir)) {
    try {
      for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          const disabledPath = join(skillsDir, entry.name, 'SKILL.md.disabled');
          if (existsSync(disabledPath)) {
            items.push({
              name: entry.name,
              relativePath: join('.claude', 'skills', entry.name, 'SKILL.md.disabled'),
              type: 'skill',
            });
          }
        }
      }
    } catch { /* ignore */ }
  }

  // Scan commands for *.md.disabled
  const commandsDir = join(targetPath, '.claude', 'commands');
  if (existsSync(commandsDir)) {
    try {
      for (const entry of readdirSync(commandsDir, { withFileTypes: true })) {
        if (entry.isFile() && entry.name.endsWith('.md.disabled')) {
          items.push({
            name: entry.name.replace('.md.disabled', ''),
            relativePath: join('.claude', 'commands', entry.name),
            type: 'command',
          });
        }
      }
    } catch { /* ignore */ }
  }

  // Scan agents for *.md.disabled
  const agentsDir = join(targetPath, '.claude', 'agents');
  if (existsSync(agentsDir)) {
    try {
      for (const entry of readdirSync(agentsDir, { withFileTypes: true })) {
        if (entry.isFile() && entry.name.endsWith('.md.disabled')) {
          items.push({
            name: entry.name.replace('.md.disabled', ''),
            relativePath: join('.claude', 'agents', entry.name),
            type: 'agent',
          });
        }
      }
    } catch { /* ignore */ }
  }

  return items;
}

export function restoreDisabledState(
  items: DisabledItem[],
  targetBase: string,
): number {
  let restored = 0;
  for (const item of items) {
    if (item.type === 'skill') {
      // Rename SKILL.md back to SKILL.md.disabled
      const enabledPath = join(targetBase, '.claude', 'skills', item.name, 'SKILL.md');
      const disabledPath = join(targetBase, '.claude', 'skills', item.name, 'SKILL.md.disabled');
      if (existsSync(enabledPath) && !existsSync(disabledPath)) {
        renameSync(enabledPath, disabledPath);
        restored++;
      }
    } else {
      // command or agent: rename *.md to *.md.disabled
      const subdir = item.type === 'command' ? 'commands' : 'agents';
      const enabledPath = join(targetBase, '.claude', subdir, `${item.name}.md`);
      const disabledPath = join(targetBase, '.claude', subdir, `${item.name}.md.disabled`);
      if (existsSync(enabledPath) && !existsSync(disabledPath)) {
        renameSync(enabledPath, disabledPath);
        restored++;
      }
    }
  }
  return restored;
}

// ---------------------------------------------------------------------------
// Copy operations
// ---------------------------------------------------------------------------

export function copyDirectory(
  src: string,
  dest: string,
  entries: ManifestEntry[],
): { files: number; dirs: number } {
  if (!existsSync(src)) return { files: 0, dirs: 0 };

  let files = 0;
  let dirs = 0;

  if (!existsSync(dest)) {
    mkdirSync(dest, { recursive: true });
    dirs++;
  }

  const items = readdirSync(src, { withFileTypes: true });
  for (const item of items) {
    const srcPath = join(src, item.name);
    const destPath = join(dest, item.name);

    if (item.isDirectory()) {
      const sub = copyDirectory(srcPath, destPath, entries);
      files += sub.files;
      dirs += sub.dirs;
      entries.push({ src: srcPath, dest: destPath, type: 'directory' });
    } else if (item.isFile()) {
      const destDir = dirname(destPath);
      if (!existsSync(destDir)) {
        mkdirSync(destDir, { recursive: true });
        dirs++;
      }
      copyFileSync(srcPath, destPath);
      files++;
      entries.push({ src: srcPath, dest: destPath, type: 'file' });
    }
  }

  return { files, dirs };
}

// ---------------------------------------------------------------------------
// Manifest CRUD
// ---------------------------------------------------------------------------

function ensureManifestsDir(): void {
  if (!existsSync(MANIFESTS_DIR)) {
    mkdirSync(MANIFESTS_DIR, { recursive: true });
  }
}

function manifestFileName(mode: string, timestamp: number): string {
  return `manifest-${mode}-${timestamp}.json`;
}

export function saveManifest(manifest: Manifest): string {
  ensureManifestsDir();
  const filePath = join(MANIFESTS_DIR, manifestFileName(manifest.mode, manifest.timestamp));
  writeFileSync(filePath, JSON.stringify(manifest, null, 2), 'utf-8');
  return filePath;
}

export function findManifest(mode: 'global' | 'project', projectPath?: string): Manifest | null {
  if (!existsSync(MANIFESTS_DIR)) return null;

  const files = readdirSync(MANIFESTS_DIR)
    .filter((f) => f.startsWith(`manifest-${mode}-`) && f.endsWith('.json'))
    .sort()
    .reverse();

  for (const file of files) {
    try {
      const manifest = JSON.parse(
        readFileSync(join(MANIFESTS_DIR, file), 'utf-8'),
      ) as Manifest;
      if (mode === 'project' && projectPath && manifest.projectPath !== projectPath) continue;
      return manifest;
    } catch {
      continue;
    }
  }
  return null;
}

export function getAllManifests(): Manifest[] {
  if (!existsSync(MANIFESTS_DIR)) return [];

  const manifests: Manifest[] = [];
  const files = readdirSync(MANIFESTS_DIR)
    .filter((f) => f.startsWith('manifest-') && f.endsWith('.json'))
    .sort()
    .reverse();

  for (const file of files) {
    try {
      manifests.push(
        JSON.parse(readFileSync(join(MANIFESTS_DIR, file), 'utf-8')) as Manifest,
      );
    } catch {
      continue;
    }
  }
  return manifests;
}

// ---------------------------------------------------------------------------
// Backup
// ---------------------------------------------------------------------------

export function createBackup(manifest: Manifest): string | null {
  const backupDir = join(MANIFESTS_DIR, 'backups', `backup-${manifest.mode}-${Date.now()}`);
  mkdirSync(backupDir, { recursive: true });

  const home = homedir();
  let backedUp = 0;
  for (const entry of manifest.entries) {
    if (entry.type === 'file' && existsSync(entry.dest)) {
      // Use path relative to home dir as backup sub-path, or sanitize absolute path
      const rel = entry.dest.startsWith(home)
        ? relative(home, entry.dest)
        : entry.dest.replace(/[:\\]/g, '_');
      const backupPath = join(backupDir, rel);
      const dir = dirname(backupPath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      copyFileSync(entry.dest, backupPath);
      backedUp++;
    }
  }

  if (backedUp === 0) return null;
  return backupDir;
}

// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------

export function getPackageVersion(sourceDir: string): string {
  try {
    const pkg = JSON.parse(readFileSync(join(sourceDir, 'package.json'), 'utf-8'));
    return typeof pkg.version === 'string' ? pkg.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export function writeVersionFile(targetDir: string, version: string): void {
  const versionPath = join(targetDir, 'version.json');
  const dir = dirname(versionPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(
    versionPath,
    JSON.stringify({ version, installedAt: new Date().toISOString() }, null, 2),
    'utf-8',
  );
}

// ---------------------------------------------------------------------------
// Component definitions (exported for route use)
// ---------------------------------------------------------------------------

export { COMPONENT_DEFS };

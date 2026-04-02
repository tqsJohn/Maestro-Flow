// ---------------------------------------------------------------------------
// `maestro launcher` — unified Claude Code launcher with workflow switching
//
// Manages two dimensions:
//   1. Workflow profiles — which CLAUDE.md + cli-tools.json to activate
//   2. Settings profiles — which settings.json to launch with
//
// Config stored at: ~/.claude-launcher/config.json
// ---------------------------------------------------------------------------

import type { Command } from 'commander';
import { join, resolve, dirname, basename } from 'node:path';
import { homedir } from 'node:os';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  unlinkSync,
  copyFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { select } from '@inquirer/prompts';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const CONFIG_DIR = join(homedir(), '.claude-launcher');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
const CLAUDE_DIR = join(homedir(), '.claude');
const CLAUDE_MD = join(CLAUDE_DIR, 'CLAUDE.md');
const CLI_TOOLS = join(CLAUDE_DIR, 'cli-tools.json');
const SYSTEM_SETTINGS = join(CLAUDE_DIR, 'settings.json');

// ---------------------------------------------------------------------------
// Config types & I/O
// ---------------------------------------------------------------------------

interface WorkflowProfile {
  claudeMd: string;
  cliTools: string | null;
}

interface SettingsProfile {
  path: string;
}

interface LauncherConfig {
  workflows: Record<string, WorkflowProfile>;
  settings: Record<string, SettingsProfile>;
  defaults: { workflow?: string; settings?: string };
}

function load(): LauncherConfig {
  if (!existsSync(CONFIG_FILE)) {
    return { workflows: {}, settings: {}, defaults: {} };
  }
  const raw = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
  if (!raw.workflows) raw.workflows = {};
  if (!raw.settings) raw.settings = {};
  if (!raw.defaults) raw.defaults = {};
  return raw;
}

function save(config: LauncherConfig): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + '\n');
}

// ---------------------------------------------------------------------------
// Workflow operations
// ---------------------------------------------------------------------------

function addWorkflow(name: string, claudeMdPath: string, cliToolsPath?: string): WorkflowProfile {
  const md = resolve(claudeMdPath);
  if (!existsSync(md)) throw new Error(`CLAUDE.md not found: ${md}`);
  const tools = cliToolsPath ? resolve(cliToolsPath) : null;
  if (tools && !existsSync(tools)) throw new Error(`cli-tools.json not found: ${tools}`);

  const config = load();
  config.workflows[name] = { claudeMd: md, cliTools: tools };
  // Auto-set default if first
  if (Object.keys(config.workflows).length === 1) {
    config.defaults.workflow = name;
  }
  save(config);
  return config.workflows[name];
}

function applyWorkflow(name: string): void {
  const config = load();
  const wf = config.workflows[name];
  if (!wf) throw new Error(`Workflow not found: ${name}`);
  if (!existsSync(wf.claudeMd)) throw new Error(`Source CLAUDE.md missing: ${wf.claudeMd}`);

  if (!existsSync(CLAUDE_DIR)) mkdirSync(CLAUDE_DIR, { recursive: true });

  // Replace ~/.claude/CLAUDE.md
  copyFileSync(wf.claudeMd, CLAUDE_MD);

  // Replace or remove ~/.claude/cli-tools.json
  if (wf.cliTools && existsSync(wf.cliTools)) {
    copyFileSync(wf.cliTools, CLI_TOOLS);
  } else if (existsSync(CLI_TOOLS)) {
    unlinkSync(CLI_TOOLS);
  }
}

function detectCurrentWorkflow(): string | null {
  if (!existsSync(CLAUDE_MD)) return null;
  const current = readFileSync(CLAUDE_MD, 'utf-8').trim();
  const config = load();
  for (const [name, wf] of Object.entries(config.workflows)) {
    if (!existsSync(wf.claudeMd)) continue;
    if (readFileSync(wf.claudeMd, 'utf-8').trim() === current) return name;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Settings operations
// ---------------------------------------------------------------------------

function isClaudeSettings(filePath: string): boolean {
  try {
    const content = JSON.parse(readFileSync(filePath, 'utf-8'));
    if (typeof content !== 'object' || content === null || Array.isArray(content)) return false;
    const knownKeys = ['permissions', 'env', 'allowedTools', 'model', 'apiKey', 'customApiKey', 'settings', 'mcpServers'];
    return Object.keys(content).some((k) => knownKeys.includes(k));
  } catch {
    return false;
  }
}

function scanSettingsDir(dir: string): { added: string[]; skipped: string[] } {
  const resolved = resolve(dir);
  if (!existsSync(resolved)) throw new Error(`Directory not found: ${resolved}`);
  const files = readdirSync(resolved).filter((f) => f.endsWith('.json'));
  const added: string[] = [];
  const skipped: string[] = [];
  const config = load();

  for (const file of files) {
    const filePath = join(resolved, file);
    if (!isClaudeSettings(filePath)) { skipped.push(file); continue; }
    const name = file.replace(/^settings-/, '').replace(/\.json$/, '');
    if (config.settings[name]) { skipped.push(file); continue; }
    config.settings[name] = { path: filePath };
    added.push(name);
  }
  save(config);
  return { added, skipped };
}

function migrateFromStartClaude(): number {
  const oldConfig = join(homedir(), '.start-claude', 'profiles.json');
  if (!existsSync(oldConfig)) return 0;
  const old = JSON.parse(readFileSync(oldConfig, 'utf-8'));
  const config = load();
  let count = 0;
  for (const [name, profile] of Object.entries(old.profiles || {}) as [string, any][]) {
    if (!config.settings[name] && existsSync(profile.path)) {
      config.settings[name] = { path: profile.path };
      count++;
    }
  }
  save(config);
  return count;
}

// ---------------------------------------------------------------------------
// Interactive launcher
// ---------------------------------------------------------------------------

async function interactiveLaunch(extraArgs: string[]): Promise<void> {
  const config = load();
  const currentWf = detectCurrentWorkflow();

  // --- Select workflow ---
  const wfEntries = Object.entries(config.workflows);
  if (wfEntries.length === 0) {
    console.error('No workflows registered. Use: maestro launcher add-workflow <name> --claude-md <path>');
    process.exit(1);
  }

  const wfChoices = wfEntries.map(([name, wf]) => ({
    name: `${name}${currentWf === name ? ' (active)' : ''}${config.defaults.workflow === name ? ' ★' : ''}  →  ${basename(dirname(wf.claudeMd))}`,
    value: name,
  }));

  const chosenWf = await select({
    message: 'Workflow:',
    choices: wfChoices,
    default: config.defaults.workflow || (currentWf ?? undefined),
  });

  // --- Select settings ---
  const settingsEntries = Object.entries(config.settings);
  const hasSystem = existsSync(SYSTEM_SETTINGS);

  const settingsChoices: { name: string; value: string }[] = [];
  if (hasSystem) {
    settingsChoices.push({ name: `system (default)  →  ${SYSTEM_SETTINGS}`, value: '__system__' });
  }
  for (const [name, s] of settingsEntries) {
    settingsChoices.push({
      name: `${name}${config.defaults.settings === name ? ' ★' : ''}  →  ${s.path}`,
      value: name,
    });
  }

  if (settingsChoices.length === 0) {
    console.error('No settings profiles found. Using system default.');
    launchClaude(chosenWf, undefined, extraArgs);
    return;
  }

  const chosenSettings = await select({
    message: 'Settings:',
    choices: settingsChoices,
    default: config.defaults.settings ?? '__system__',
  });

  const settingsPath = chosenSettings === '__system__'
    ? undefined
    : config.settings[chosenSettings]?.path;

  launchClaude(chosenWf, settingsPath, extraArgs);
}

function launchClaude(workflowName: string, settingsPath: string | undefined, extraArgs: string[]): void {
  // Apply workflow
  applyWorkflow(workflowName);
  console.error(`Workflow: ${workflowName}`);

  const args: string[] = ['--dangerously-skip-permissions'];
  if (settingsPath) {
    args.push('--settings', settingsPath);
    console.error(`Settings: ${settingsPath}`);
  }
  args.push(...extraArgs);

  console.error(`Launching claude...`);
  console.error('');

  const result = spawnSync('claude', args, { stdio: 'inherit', shell: true });
  if (result.error) {
    if ((result.error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.error('Error: `claude` command not found. Make sure Claude CLI is installed.');
      process.exit(1);
    }
    throw result.error;
  }
  process.exit(result.status ?? 1);
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

export function registerLauncherCommand(program: Command): void {
  const launcher = program
    .command('launcher')
    .description('Unified Claude Code launcher with workflow + settings switching')
    .option('-w, --workflow <name>', 'Workflow profile to activate')
    .option('-s, --settings <name>', 'Settings profile to use')
    .allowUnknownOption()
    .action(async (opts: { workflow?: string; settings?: string }, cmd) => {
      const extraArgs = cmd.args;

      // Direct mode: both specified
      if (opts.workflow) {
        const config = load();
        const settingsPath = opts.settings
          ? (opts.settings === 'system' ? undefined : config.settings[opts.settings]?.path)
          : undefined;
        launchClaude(opts.workflow, settingsPath, extraArgs);
        return;
      }

      // Interactive mode
      await interactiveLaunch(extraArgs);
    });

  // --- Subcommands ---

  launcher
    .command('add-workflow <name>')
    .description('Register a workflow profile (CLAUDE.md + optional cli-tools.json)')
    .requiredOption('--claude-md <path>', 'Path to CLAUDE.md for this workflow')
    .option('--cli-tools <path>', 'Path to cli-tools.json for this workflow')
    .action((name: string, opts: { claudeMd: string; cliTools?: string }) => {
      try {
        const wf = addWorkflow(name, opts.claudeMd, opts.cliTools);
        console.log(`Added workflow "${name}"`);
        console.log(`  CLAUDE.md:  ${wf.claudeMd}`);
        if (wf.cliTools) console.log(`  cli-tools:  ${wf.cliTools}`);
      } catch (err: any) {
        console.error(`Error: ${err.message}`);
        process.exit(1);
      }
    });

  launcher
    .command('remove-workflow <name>')
    .description('Remove a workflow profile')
    .action((name: string) => {
      try {
        const config = load();
        if (!config.workflows[name]) throw new Error(`Workflow not found: ${name}`);
        delete config.workflows[name];
        if (config.defaults.workflow === name) delete config.defaults.workflow;
        save(config);
        console.log(`Removed workflow "${name}"`);
      } catch (err: any) {
        console.error(`Error: ${err.message}`);
        process.exit(1);
      }
    });

  launcher
    .command('add-settings <name> <path>')
    .description('Register a settings profile')
    .action((name: string, settingsPath: string) => {
      try {
        const resolved = resolve(settingsPath);
        if (!existsSync(resolved)) throw new Error(`File not found: ${resolved}`);
        const config = load();
        config.settings[name] = { path: resolved };
        if (Object.keys(config.settings).length === 1) config.defaults.settings = name;
        save(config);
        console.log(`Added settings "${name}" → ${resolved}`);
      } catch (err: any) {
        console.error(`Error: ${err.message}`);
        process.exit(1);
      }
    });

  launcher
    .command('remove-settings <name>')
    .description('Remove a settings profile')
    .action((name: string) => {
      try {
        const config = load();
        if (!config.settings[name]) throw new Error(`Settings not found: ${name}`);
        delete config.settings[name];
        if (config.defaults.settings === name) delete config.defaults.settings;
        save(config);
        console.log(`Removed settings "${name}"`);
      } catch (err: any) {
        console.error(`Error: ${err.message}`);
        process.exit(1);
      }
    });

  launcher
    .command('scan <dir>')
    .description('Scan directory for Claude settings JSON files and register them')
    .action((dir: string) => {
      try {
        const { added, skipped } = scanSettingsDir(dir);
        if (added.length > 0) {
          console.log(`Registered ${added.length} settings:`);
          added.forEach((n) => console.log(`  + ${n}`));
        }
        if (added.length === 0) console.log('No new Claude settings files found.');
      } catch (err: any) {
        console.error(`Error: ${err.message}`);
        process.exit(1);
      }
    });

  launcher
    .command('default <type> <name>')
    .description('Set default (type: workflow or settings)')
    .action((type: string, name: string) => {
      if (type !== 'workflow' && type !== 'settings') {
        console.error('Type must be "workflow" or "settings"');
        process.exit(1);
      }
      try {
        const config = load();
        if (type === 'workflow' && !config.workflows[name]) throw new Error(`Workflow not found: ${name}`);
        if (type === 'settings' && name !== 'system' && !config.settings[name]) throw new Error(`Settings not found: ${name}`);
        config.defaults[type] = name;
        save(config);
        console.log(`Default ${type} set to "${name}"`);
      } catch (err: any) {
        console.error(`Error: ${err.message}`);
        process.exit(1);
      }
    });

  launcher
    .command('list')
    .description('List all registered profiles')
    .action(() => {
      const config = load();
      const currentWf = detectCurrentWorkflow();

      console.log('');
      console.log('Workflows:');
      const wfEntries = Object.entries(config.workflows);
      if (wfEntries.length === 0) {
        console.log('  (none)');
      } else {
        for (const [name, wf] of wfEntries) {
          const active = currentWf === name ? ' [active]' : '';
          const def = config.defaults.workflow === name ? ' ★' : '';
          console.log(`  ${name}${def}${active}`);
          console.log(`    CLAUDE.md:  ${wf.claudeMd}`);
          if (wf.cliTools) console.log(`    cli-tools:  ${wf.cliTools}`);
        }
      }

      console.log('');
      console.log('Settings:');
      if (existsSync(SYSTEM_SETTINGS)) {
        console.log(`  system (default)  →  ${SYSTEM_SETTINGS}`);
      }
      const sEntries = Object.entries(config.settings);
      if (sEntries.length === 0 && !existsSync(SYSTEM_SETTINGS)) {
        console.log('  (none)');
      } else {
        for (const [name, s] of sEntries) {
          const def = config.defaults.settings === name ? ' ★' : '';
          console.log(`  ${name}${def}  →  ${s.path}`);
        }
      }
      console.log('');
    });

  launcher
    .command('migrate')
    .description('Import profiles from start-claude (~/.start-claude/profiles.json)')
    .action(() => {
      const count = migrateFromStartClaude();
      if (count > 0) {
        console.log(`Migrated ${count} settings profiles from start-claude`);
      } else {
        console.log('No new profiles to migrate (already imported or start-claude config not found)');
      }
    });

  launcher
    .command('status')
    .description('Show current active workflow and settings')
    .action(() => {
      const currentWf = detectCurrentWorkflow();
      console.log('');
      console.log(`Active workflow: ${currentWf ?? '(unknown/unregistered)'}`);
      if (existsSync(CLAUDE_MD)) {
        const firstLine = readFileSync(CLAUDE_MD, 'utf-8').split('\n')[0];
        console.log(`  CLAUDE.md:    ${firstLine}`);
      }
      console.log(`  cli-tools:    ${existsSync(CLI_TOOLS) ? 'present' : 'absent'}`);
      console.log('');
    });
}

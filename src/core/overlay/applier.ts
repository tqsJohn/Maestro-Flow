// ---------------------------------------------------------------------------
// Applier — filesystem orchestration for overlay apply/remove.
//
// Reads overlays from `overlayDir`, applies each enabled overlay to its
// declared targets under `<targetBase>/.claude/commands/`, and writes an
// overlay manifest to `~/.maestro/manifests/overlays-<scope>.json`.
//
// Idempotent: re-running with no overlay changes produces byte-identical
// output. Safe to call from install flow or standalone.
// ---------------------------------------------------------------------------

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  unlinkSync,
  copyFileSync,
  statSync,
} from 'node:fs';
import { join, basename, dirname, resolve } from 'node:path';
import { paths } from '../../config/paths.js';
import { loadAllOverlays, loadOverlay } from './loader.js';
import { applyOverlay, removeOverlay as stripMarkers } from './patcher.js';
import {
  OVERLAY_MANIFEST_VERSION,
  type AppliedOverlay,
  type AppliedTarget,
  type OverlayFile,
  type OverlayManifest,
} from './types.js';

// ---------------------------------------------------------------------------
// Manifest persistence
// ---------------------------------------------------------------------------

function overlayManifestDir(): string {
  return join(paths.home, 'manifests');
}

function overlayManifestPath(scope: 'global' | 'project', targetBase: string): string {
  const safe = scope === 'global'
    ? 'global'
    : `project-${targetBase.replace(/[:\\/]+/g, '_')}`;
  return join(overlayManifestDir(), `overlays-${safe}.json`);
}

export function loadOverlayManifest(
  scope: 'global' | 'project',
  targetBase: string,
): OverlayManifest | null {
  const fp = overlayManifestPath(scope, targetBase);
  if (!existsSync(fp)) return null;
  try {
    return JSON.parse(readFileSync(fp, 'utf-8')) as OverlayManifest;
  } catch {
    return null;
  }
}

function saveOverlayManifest(manifest: OverlayManifest): string {
  const dir = overlayManifestDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const fp = overlayManifestPath(manifest.scope, manifest.targetBase);
  writeFileSync(fp, JSON.stringify(manifest, null, 2), 'utf-8');
  return fp;
}

export function deleteOverlayManifest(
  scope: 'global' | 'project',
  targetBase: string,
): void {
  const fp = overlayManifestPath(scope, targetBase);
  if (existsSync(fp)) unlinkSync(fp);
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

export interface ApplyOptions {
  /** Root dir where `.claude/commands/` lives (homedir for global, project dir for project). */
  targetBase: string;
  scope: 'global' | 'project';
  /** Directory containing overlay JSON files (usually `~/.maestro/overlays/`). */
  overlayDir: string;
  /** Optional logger; defaults to console.error. */
  logger?: (msg: string) => void;
}

export interface ApplyReport {
  manifest: OverlayManifest;
  manifestPath: string;
  overlaysLoaded: number;
  overlaysApplied: number;
  filesChanged: number;
  filesUnchanged: number;
  loadErrors: { path: string; errors: string[] }[];
  skipped: { overlay: string; target: string; reason: string }[];
}

export function applyOverlays(opts: ApplyOptions): ApplyReport {
  const log = opts.logger ?? ((msg) => console.error(msg));
  const commandsDir = join(opts.targetBase, '.claude', 'commands');

  const { overlays, errors: loadErrors } = loadAllOverlays(opts.overlayDir);
  const enabledOverlays = overlays.filter((o) => o.meta.enabled !== false);

  const skipped: ApplyReport['skipped'] = [];
  const appliedOverlays: AppliedOverlay[] = [];
  let filesChanged = 0;
  let filesUnchanged = 0;

  // Group patches by target so each target file is read and written once
  // per applyOverlays invocation.
  const byTarget = new Map<string, { overlay: OverlayFile; cmdPath: string }[]>();
  for (const overlay of enabledOverlays) {
    for (const target of overlay.meta.targets) {
      const cmdPath = join(commandsDir, `${target}.md`);
      const disabledPath = cmdPath + '.disabled';
      if (!existsSync(cmdPath)) {
        if (existsSync(disabledPath)) {
          skipped.push({ overlay: overlay.meta.name, target, reason: 'disabled' });
        } else {
          skipped.push({ overlay: overlay.meta.name, target, reason: 'missing' });
        }
        continue;
      }
      const list = byTarget.get(cmdPath) ?? [];
      list.push({ overlay, cmdPath });
      byTarget.set(cmdPath, list);
    }
  }

  // Track applied targets per overlay for manifest
  const appliedByOverlay = new Map<string, AppliedOverlay>();
  for (const overlay of enabledOverlays) {
    appliedByOverlay.set(overlay.meta.name, {
      overlayName: overlay.meta.name,
      overlayHash: overlay.hash,
      targets: [],
    });
  }

  for (const [cmdPath, entries] of byTarget) {
    let text = readFileSync(cmdPath, 'utf-8');
    const originalText = text;
    const appliedHere: AppliedTarget[] = [];

    for (const { overlay } of entries) {
      const result = applyOverlay(
        text,
        overlay,
        cmdPath.split(/[\\/]/).pop()?.replace(/\.md$/, '') ?? '',
        cmdPath,
      );
      text = result.text;
      if (result.applied.markerIds.length > 0) {
        appliedHere.push(result.applied);
        appliedByOverlay.get(overlay.meta.name)!.targets.push(result.applied);
      }
    }

    if (text !== originalText) {
      writeFileSync(cmdPath, text, 'utf-8');
      filesChanged++;
    } else {
      filesUnchanged++;
    }
  }

  for (const [, ao] of appliedByOverlay) {
    if (ao.targets.length > 0) appliedOverlays.push(ao);
  }

  const manifest: OverlayManifest = {
    version: OVERLAY_MANIFEST_VERSION,
    scope: opts.scope,
    targetBase: opts.targetBase,
    installedAt: new Date().toISOString(),
    appliedOverlays,
  };

  const manifestPath = saveOverlayManifest(manifest);

  if (loadErrors.length > 0) {
    log(`  Overlay load errors: ${loadErrors.length}`);
    for (const { path, errors } of loadErrors) {
      log(`    ${path}: ${errors.join('; ')}`);
    }
  }

  return {
    manifest,
    manifestPath,
    overlaysLoaded: overlays.length,
    overlaysApplied: appliedOverlays.length,
    filesChanged,
    filesUnchanged,
    loadErrors,
    skipped,
  };
}

// ---------------------------------------------------------------------------
// Remove single overlay (by name)
// ---------------------------------------------------------------------------

export interface RemoveResult {
  targetsCleaned: number;
  filesChanged: number;
}

/**
 * Remove all marker blocks for the given overlay name from every target
 * command file recorded in the overlay manifest. Updates the manifest.
 */
export function removeOverlayFromTargets(
  overlayName: string,
  scope: 'global' | 'project',
  targetBase: string,
): RemoveResult {
  const manifest = loadOverlayManifest(scope, targetBase);
  if (!manifest) return { targetsCleaned: 0, filesChanged: 0 };

  const entry = manifest.appliedOverlays.find((o) => o.overlayName === overlayName);
  if (!entry) return { targetsCleaned: 0, filesChanged: 0 };

  let filesChanged = 0;
  for (const tgt of entry.targets) {
    if (!existsSync(tgt.commandPath)) continue;
    const text = readFileSync(tgt.commandPath, 'utf-8');
    const { text: cleaned } = stripMarkers(text, overlayName);
    if (cleaned !== text) {
      writeFileSync(tgt.commandPath, cleaned, 'utf-8');
      filesChanged++;
    }
  }

  // Update manifest
  manifest.appliedOverlays = manifest.appliedOverlays.filter(
    (o) => o.overlayName !== overlayName,
  );
  saveOverlayManifest(manifest);

  return { targetsCleaned: entry.targets.length, filesChanged };
}

export function ensureOverlayDir(overlayDir: string): void {
  if (!existsSync(overlayDir)) mkdirSync(overlayDir, { recursive: true });
  // Ensure docs subdir for overlay-referenced docs
  const docsDir = join(overlayDir, 'docs');
  if (!existsSync(docsDir)) mkdirSync(docsDir, { recursive: true });
}

// ---------------------------------------------------------------------------
// Import / Export
// ---------------------------------------------------------------------------

export interface ExportResult {
  /** Source overlay file inside overlayDir. */
  source: string;
  /** Destination path the file was written to. */
  dest: string;
  overlayName: string;
}

/**
 * Export an overlay by name from `overlayDir` to `outPath`.
 *
 * - If `outPath` is a directory, writes `<name>.json` inside it.
 * - If `outPath` is a file path, writes verbatim (overwriting if present).
 * - Throws if the overlay name is not found in `overlayDir`.
 */
export function exportOverlayFile(
  overlayDir: string,
  name: string,
  outPath: string,
): ExportResult {
  if (!existsSync(overlayDir)) {
    throw new Error(`Overlay directory not found: ${overlayDir}`);
  }

  // Scan overlayDir (top-level only) for an overlay whose parsed name matches.
  let source: string | null = null;
  for (const entry of readdirSync(overlayDir)) {
    if (!entry.endsWith('.json') || entry.startsWith('_')) continue;
    const fp = join(overlayDir, entry);
    try {
      const ov = loadOverlay(fp);
      if (ov.meta.name === name) {
        source = fp;
        break;
      }
    } catch {
      // Skip unparseable files
    }
  }

  if (!source) {
    throw new Error(`Overlay not found: ${name} (searched ${overlayDir})`);
  }

  let dest = resolve(outPath);
  if (existsSync(dest) && statSync(dest).isDirectory()) {
    dest = join(dest, `${name}.json`);
  }

  const destDir = dirname(dest);
  if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
  copyFileSync(source, dest);

  return { source, dest, overlayName: name };
}

export interface ImportResult {
  /** Source file the caller provided. */
  source: string;
  /** Destination path inside `overlayDir`. */
  dest: string;
  overlayName: string;
  /** True if the destination already existed and was overwritten. */
  overwritten: boolean;
}

/**
 * Import an overlay JSON file into `overlayDir`. Validates before copy and
 * throws if the file is not a valid overlay. Returns the destination path.
 *
 * Does not auto-apply — callers that want immediate effect should invoke
 * `applyOverlays` afterwards.
 */
export function importOverlayFile(
  srcPath: string,
  overlayDir: string,
): ImportResult {
  const source = resolve(srcPath);
  if (!existsSync(source)) {
    throw new Error(`File not found: ${source}`);
  }
  if (!statSync(source).isFile()) {
    throw new Error(`Not a file: ${source}`);
  }

  // Validate (throws OverlayLoadError on failure).
  const overlay = loadOverlay(source);

  ensureOverlayDir(overlayDir);
  // Use the overlay's declared name as filename for consistency on disk.
  const dest = join(overlayDir, `${overlay.meta.name}.json`);
  const overwritten =
    existsSync(dest) && resolve(dest) !== source;

  if (resolve(dest) !== source) {
    copyFileSync(source, dest);
  }

  return {
    source,
    dest,
    overlayName: overlay.meta.name,
    overwritten,
  };
}

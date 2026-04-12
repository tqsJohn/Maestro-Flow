/**
 * Spec Injector — PreToolUse:Agent Hook
 *
 * Automatically injects project specs into subagent context based on
 * agent type → spec category mapping. Uses context-budget to reduce
 * payload when context usage is high.
 *
 * Design: Uses `additionalContext` (advisory) rather than rewriting
 * the prompt — safer and non-destructive.
 */

import { loadSpecs, type SpecCategory } from '../tools/spec-loader.js';
import { evaluateContextBudget } from './context-budget.js';
import type { SpecInjectionConfig } from '../types/index.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SpecInjectionRule {
  categories: SpecCategory[];
  /** Additional file paths relative to project root */
  extras: string[];
}

export interface SpecInjectionResult {
  inject: boolean;
  content?: string;
  categories?: string[];
  specCount?: number;
  budgetAction?: string;
}

// ---------------------------------------------------------------------------
// Default agent-type → spec-category mapping
// ---------------------------------------------------------------------------

const DEFAULT_AGENT_SPEC_MAP: Record<string, SpecInjectionRule> = {
  // Execution agents → execution specs
  'code-developer':      { categories: ['execution'], extras: [] },
  'tdd-developer':       { categories: ['execution', 'test'], extras: [] },
  'workflow-executor':   { categories: ['execution'], extras: [] },
  'universal-executor':  { categories: ['execution'], extras: [] },
  'test-fix-agent':      { categories: ['execution', 'test'], extras: [] },

  // Planning agents → planning specs
  'cli-lite-planning-agent': { categories: ['planning'], extras: [] },
  'action-planning-agent':   { categories: ['planning'], extras: [] },
  'workflow-planner':        { categories: ['planning'], extras: [] },

  // Review agents → review specs
  'workflow-reviewer':   { categories: ['review'], extras: [] },

  // Debug agents → debug specs
  'debug-explore-agent': { categories: ['debug'], extras: [] },
  'workflow-debugger':   { categories: ['debug'], extras: [] },

  // Explore agents → exploration (lightweight)
  'Explore':             { categories: ['exploration'], extras: [] },
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluate whether to inject specs for a given agent type.
 *
 * @param agentType   The subagent_type from PreToolUse tool_input
 * @param projectPath Working directory (for spec file resolution)
 * @param sessionId   Session ID (for context budget bridge metrics)
 * @param config      Optional user config overrides
 */
export function evaluateSpecInjection(
  agentType: string,
  projectPath: string,
  sessionId?: string,
  config?: SpecInjectionConfig,
): SpecInjectionResult {
  // Merge user config mapping with defaults
  const mapping = buildMapping(config);
  const rule = mapping[agentType];

  if (!rule) return { inject: false };

  // Load specs for each category
  const sections: string[] = [];
  const allCategories: string[] = [];
  let totalCount = 0;

  for (const category of rule.categories) {
    const result = loadSpecs(projectPath, category as SpecCategory);
    if (result.content) {
      sections.push(result.content);
      allCategories.push(category);
      totalCount += result.totalLoaded;
    }
  }

  if (sections.length === 0) return { inject: false };

  const rawContent = sections.join('\n\n---\n\n');

  // Apply context budget
  const budget = evaluateContextBudget(rawContent, sessionId);

  if (budget.action === 'skip') {
    return { inject: false, budgetAction: 'skip' };
  }

  return {
    inject: true,
    content: budget.content,
    categories: allCategories,
    specCount: totalCount,
    budgetAction: budget.action,
  };
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function buildMapping(config?: SpecInjectionConfig): Record<string, SpecInjectionRule> {
  if (!config?.mapping) return DEFAULT_AGENT_SPEC_MAP;

  const merged = { ...DEFAULT_AGENT_SPEC_MAP };
  for (const [agent, rule] of Object.entries(config.mapping)) {
    merged[agent] = {
      categories: rule.categories as SpecCategory[],
      extras: rule.extras ?? [],
    };
  }
  return merged;
}

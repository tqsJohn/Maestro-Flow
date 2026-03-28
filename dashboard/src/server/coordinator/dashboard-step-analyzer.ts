// ---------------------------------------------------------------------------
// DashboardStepAnalyzer -- thin adapter: StepAnalyzer → QualityReviewerAgent
// ---------------------------------------------------------------------------

import type { CommandNode, WalkerContext, AssembleRequest, AnalysisResult, StepAnalyzer } from '../../../../src/coordinator/graph-types.js';
import type { CoordinateStep } from '../../shared/coordinate-types.js';
import type { QualityReviewerAgent } from './agents/quality-reviewer-agent.js';

// ---------------------------------------------------------------------------
// DashboardStepAnalyzer
// ---------------------------------------------------------------------------

export class DashboardStepAnalyzer implements StepAnalyzer {
  constructor(private readonly qualityReviewer: QualityReviewerAgent) {}

  async analyze(
    node: CommandNode,
    rawOutput: string,
    _ctx: WalkerContext,
    _prevCmd?: AssembleRequest['previous_command'],
  ): Promise<AnalysisResult> {
    // Convert CommandNode → CoordinateStep for QualityReviewerAgent
    const step: CoordinateStep = {
      index: 0,
      cmd: node.cmd,
      args: node.args ?? '',
      status: 'completed',
      processId: null,
      analysis: null,
      summary: null,
    };

    const analysis = await this.qualityReviewer.review(step, rawOutput);

    // Convert StepAnalysis (camelCase) → AnalysisResult (snake_case)
    return {
      quality_score: analysis.qualityScore,
      issues: analysis.issues,
      next_step_hints: {
        prompt_additions: analysis.nextStepHints || undefined,
      },
    };
  }
}

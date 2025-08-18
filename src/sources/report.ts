import fs from 'node:fs/promises';
import path from 'node:path';
import type { AemDataBundle } from './aem.js';
import type { RepoUsage } from './repo.js';
import type { CorrelatedFindings } from './correlation.js';
import type { Recommendation } from './recommender.js';

export async function renderReport({ outputDir, aemData, repoData, correlated, recommendation }:
  { outputDir: string; aemData: AemDataBundle; repoData: RepoUsage; correlated: CorrelatedFindings; recommendation: Recommendation }): Promise<void> {
  const data = { aemData, repoData, correlated, recommendation };
  await fs.writeFile(path.join(outputDir, 'data.json'), JSON.stringify(data, null, 2), 'utf-8');

  const md = `# AEM Clientlib Analysis\n\n` +
    `## Page\n\n- Path: ${aemData.page.path}\n- Template: ${aemData.page.template ?? 'unknown'}\n- Components Used: ${aemData.page.componentsUsed.join(', ') || 'none'}\n\n` +
    `## Recommendation\n\n` +
    recommendation.prioritizedSteps.map((s, i) => `${i + 1}. ${s.title} — ${s.impact}\n   - ${s.rationale}`).join('\n') +
    `\n`;

  await fs.writeFile(path.join(outputDir, 'summary.md'), md, 'utf-8');
}



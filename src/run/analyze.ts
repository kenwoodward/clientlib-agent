import fs from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';
import { collectPageAndTemplateData } from '../sources/aem.js';
import { analyzeRepository } from '../sources/repo.js';
import { correlateFindings } from '../sources/correlation.js';
import { generateRecommendation } from '../sources/recommender.js';
import { renderReport } from '../sources/report.js';

export interface AnalyzeOptions {
  path: string;
  clientlibs?: string;
  repo?: string;
  aemUrl?: string;
  aemUser?: string;
  aemPass?: string;
  out: string;
}

export async function analyze(options: AnalyzeOptions): Promise<void> {
  const outputDir = path.resolve(process.cwd(), options.out ?? './report');
  await fs.mkdir(outputDir, { recursive: true });

  const repoRoot = path.resolve(process.cwd(), options.repo ?? process.cwd());

  console.log(chalk.cyan('Collecting AEM data...'));
  const aemData = await collectPageAndTemplateData({
    baseUrl: options.aemUrl,
    username: options.aemUser,
    password: options.aemPass,
    contentPath: options.path,
  });

  console.log(chalk.cyan('Analyzing repository...'));
  const repoData = await analyzeRepository({ repoRoot, clientlibsCsv: options.clientlibs });

  console.log(chalk.cyan('Correlating data...'));
  const correlated = correlateFindings(aemData, repoData);

  console.log(chalk.cyan('Generating recommendation (LLM)...'));
  const recommendation = await generateRecommendation({ aemData, repoData, correlated });

  console.log(chalk.cyan('Writing outputs...'));
  await renderReport({ outputDir, aemData, repoData, correlated, recommendation });

  console.log(chalk.green(`Done. Outputs in ${outputDir}`));
}



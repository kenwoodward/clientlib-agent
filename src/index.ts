import { Command } from 'commander';
import chalk from 'chalk';
import { analyze } from './run/analyze.js';

const program = new Command();

program
  .name('aem-clientlib-agent')
  .description('Analyze an AEM page and client libraries, correlate with repo usage, and propose recommendations')
  .version('0.1.0');

program
  .command('analyze')
  .requiredOption('--path <contentPath>', 'AEM content path, e.g. /content/site/en/page')
  .option('--clientlibs <names>', 'Comma-separated clientlib category names')
  .option('--repo <dir>', 'Repository root to scan (defaults to current working directory)')
  .option('--aem-url <url>', 'AEM base URL, e.g. https://author.example.com')
  .option('--aem-user <user>', 'AEM username')
  .option('--aem-pass <pass>', 'AEM password')
  .option('--out <dir>', 'Output directory for reports (default: ./report)', './report')
  .action(async (opts) => {
    try {
      await analyze(opts);
    } catch (err) {
      console.error(chalk.red((err as Error).message));
      process.exitCode = 1;
    }
  });

program.parseAsync();


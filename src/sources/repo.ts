import fg from 'fast-glob';

export interface ClientLibInfo {
  category: string;
  path: string;
  embeds: string[];
  dependencies: string[];
  assets: { js: string[]; css: string[] };
}

export interface RepoUsage {
  clientlibs: ClientLibInfo[];
  htlInclusions: Array<{ file: string; category: string }>; 
  templateCategoryRefs: Array<{ file: string; category: string }>;
}

export async function analyzeRepository({ repoRoot, clientlibsCsv }: { repoRoot: string; clientlibsCsv?: string }): Promise<RepoUsage> {
  // Minimal stub scanning to wire shape. Full logic will be done in Engineer B task.
  const clientlibs: ClientLibInfo[] = [];
  const htlInclusions: Array<{ file: string; category: string }> = [];
  const templateCategoryRefs: Array<{ file: string; category: string }> = [];

  // sample glob to ensure the scanner is wired; no-op for now
  await fg(['**/*'], { cwd: repoRoot, dot: false, ignore: ['node_modules/**', 'dist/**'] });

  if (clientlibsCsv) {
    for (const c of clientlibsCsv.split(',').map((s) => s.trim()).filter(Boolean)) {
      clientlibs.push({ category: c, path: '', embeds: [], dependencies: [], assets: { js: [], css: [] } });
    }
  }

  return { clientlibs, htlInclusions, templateCategoryRefs };
}



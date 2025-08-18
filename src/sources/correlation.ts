import type { AemDataBundle } from './aem.js';
import type { RepoUsage } from './repo.js';

export interface CorrelatedFindings {
  // Examples: mapping components used on page to categories found in repo
  componentToCategories: Record<string, string[]>;
  // Any obvious gaps: used components without categories present
  missingCategories: string[];
}

export function correlateFindings(aem: AemDataBundle, repo: RepoUsage): CorrelatedFindings {
  const componentToCategories: Record<string, string[]> = {};
  const missingCategories: string[] = [];

  for (const component of aem.page.componentsUsed) {
    const categories: string[] = [];
    // placeholder correlation; real logic will look at policies and repo usage
    for (const c of repo.clientlibs) {
      if (c.category.toLowerCase().includes(component.split('/').pop()?.toLowerCase() ?? '')) {
        categories.push(c.category);
      }
    }
    componentToCategories[component] = categories;
    if (categories.length === 0) missingCategories.push(component);
  }

  return { componentToCategories, missingCategories };
}



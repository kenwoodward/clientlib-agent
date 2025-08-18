import axios from 'axios';

export interface AemCollectorOptions {
  baseUrl?: string;
  username?: string;
  password?: string;
  contentPath: string;
}

export interface PageInfo {
  path: string;
  template?: string;
  componentsUsed: string[];
}

export interface TemplateInfo {
  path?: string;
  allowedComponents: string[];
  policies: Record<string, { categories?: string[]; config?: Record<string, unknown> }>;
}

export interface PagesByTemplateInfo {
  template?: string;
  pagePaths: string[];
}

export interface AemDataBundle {
  page: PageInfo;
  template: TemplateInfo;
  pagesByTemplate: PagesByTemplateInfo;
}

export async function collectPageAndTemplateData(opts: AemCollectorOptions): Promise<AemDataBundle> {
  // Minimal stub: wire the shape; implement AEM calls on day 1 task
  const page: PageInfo = {
    path: opts.contentPath,
    template: undefined,
    componentsUsed: [],
  };
  const template: TemplateInfo = {
    path: undefined,
    allowedComponents: [],
    policies: {},
  };
  const pagesByTemplate: PagesByTemplateInfo = {
    template: undefined,
    pagePaths: [],
  };

  // placeholder to avoid lint/unused axios elimination in tree-shake; real implementation will use axios
  void axios;

  return { page, template, pagesByTemplate };
}



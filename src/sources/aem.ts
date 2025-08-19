import axios, { AxiosInstance, AxiosError } from 'axios';
import chalk from 'chalk';
import https from 'node:https';

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

interface PolicyInfo {
  path: string;
  type: string;
  clientlibs?: string[];
  components?: string[];
  config: Record<string, unknown>;
}

function createAxiosClient(opts: AemCollectorOptions): AxiosInstance {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const auth = opts.username && opts.password ? { username: opts.username, password: opts.password } : undefined;
  
  // Handle self-signed certs in dev/training environments
  const httpsAgent = new https.Agent({
    rejectUnauthorized: false
  });

  return axios.create({
    baseURL: opts.baseUrl?.replace(/\/$/, '') ?? '',
    headers,
    auth,
    withCredentials: true,
    httpsAgent,
    validateStatus: (status) => status < 400
  });
}

async function tryGetFirstJson(client: AxiosInstance, paths: string[]): Promise<unknown | undefined> {
  for (const url of paths) {
    try {
      console.log(chalk.gray(`Trying ${url}...`));
      const res = await client.get(url);
      if (res.status >= 200 && res.status < 300) {
        console.log(chalk.green(`Success: ${url}`));
        return res.data;
      }
      console.log(chalk.yellow(`Status ${res.status} for ${url}`));
    } catch (err) {
      const axiosError = err as AxiosError;
      console.log(chalk.yellow(`Failed: ${url} (${axiosError.message})`));
      if (axiosError.response) {
        console.log(chalk.yellow(`Response status: ${axiosError.response.status}`));
        console.log(chalk.yellow(`Response data:`, axiosError.response.data));
      }
      // try next
    }
  }
  return undefined;
}

async function findComponentsByGroup(client: AxiosInstance, groupName: string): Promise<string[]> {
  console.log(chalk.blue(`Finding components for group: ${groupName}`));
  
  // Get all components from /apps and /libs
  const components = new Set<string>();
  
  // Try /apps/wknd/components.infinity.json
  const appsJson = await tryGetFirstJson(client, [
    '/apps/wknd/components.infinity.json'
  ]);
  
  if (appsJson && typeof appsJson === 'object') {
    scanForComponents(appsJson as Record<string, unknown>, '/apps/wknd/components', components, groupName);
  }
  
  // Try /libs/wknd/components.infinity.json
  const libsJson = await tryGetFirstJson(client, [
    '/libs/wknd/components.infinity.json'
  ]);
  
  if (libsJson && typeof libsJson === 'object') {
    scanForComponents(libsJson as Record<string, unknown>, '/libs/wknd/components', components, groupName);
  }
  
  const result = Array.from(components).sort();
  console.log(chalk.blue(`Found ${result.length} components in group ${groupName}:`));
  for (const comp of result) {
    console.log(chalk.gray(`  - ${comp}`));
  }
  
  return result;
}

function scanForComponents(node: Record<string, unknown>, path: string, out: Set<string>, groupName: string) {
  // Check if this is a component node
  if (typeof node['jcr:primaryType'] === 'string' && 
      node['jcr:primaryType'] === 'cq:Component' &&
      typeof node['componentGroup'] === 'string' &&
      node['componentGroup'] === groupName) {
    out.add(path);
  }
  
  // Recurse into child nodes
  for (const [key, value] of Object.entries(node)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      scanForComponents(value as Record<string, unknown>, `${path}/${key}`, out, groupName);
    }
  }
}

async function expandComponentGroups(client: AxiosInstance, components: string[]): Promise<string[]> {
  const expanded = new Set<string>();
  
  for (const component of components) {
    if (component.startsWith('group:')) {
      // Extract group name (remove 'group:' prefix)
      const groupName = component.substring(6);
      
      // Find all components with this componentGroup
      const groupComponents = await findComponentsByGroup(client, groupName);
      
      if (groupComponents.length > 0) {
        console.log(chalk.gray(`Expanding group ${component} into ${groupComponents.length} components`));
        for (const c of groupComponents) {
          expanded.add(c);
        }
      } else {
        // Keep the group reference if we couldn't expand it
        console.log(chalk.yellow(`Could not expand group ${component}`));
        expanded.add(component);
      }
    } else {
      expanded.add(component);
    }
  }
  
  return Array.from(expanded).sort();
}

export async function collectPageAndTemplateData(opts: AemCollectorOptions): Promise<AemDataBundle> {
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

  if (!opts.baseUrl) {
    return { page, template, pagesByTemplate };
  }

  const client = createAxiosClient(opts);

  // 1) Fetch page JSON to determine template and components used
  console.log(chalk.blue('Fetching page content...'));
  const jcrContent = await tryGetFirstJson(client, [
    `${opts.contentPath}/jcr:content.infinity.json`,
    `${opts.contentPath}/_jcr:content.infinity.json`,
    `${opts.contentPath}.infinity.json`,
  ]);
  
  if (jcrContent && typeof jcrContent === 'object') {
    const root = jcrContent as Record<string, unknown>;
    console.log(chalk.gray('Page content:', JSON.stringify(root, null, 2)));
    
    // Look for template path in jcr:content
    const templatePath = extractTemplatePath(root);
    if (templatePath) {
      console.log(chalk.blue(`Found template: ${templatePath}`));
      page.template = templatePath;
      template.path = templatePath;
      pagesByTemplate.template = templatePath;

      // Get the template's policy mapping
      console.log(chalk.blue('\nFetching template policy mapping...'));
      const policyMapping = await tryGetFirstJson(client, [
        `${templatePath}/policies/jcr:content.infinity.json`
      ]);
      
      if (policyMapping && typeof policyMapping === 'object') {
        console.log(chalk.gray('Policy mapping:', JSON.stringify(policyMapping, null, 2)));
        
        // Extract components from root/container
        const rootComponents = extractComponentsFromPolicy(policyMapping as Record<string, unknown>);
        if (rootComponents.length > 0) {
          console.log(chalk.blue(`Found root components: ${rootComponents.join(', ')}`));
          
          // Expand any component groups
          const expanded = await expandComponentGroups(client, rootComponents);
          template.allowedComponents.push(...expanded);
        }
      }
    }

    // Collect components used on the page
    const componentSet = new Set<string>();
    collectResourceTypes(root, componentSet);
    page.componentsUsed = Array.from(componentSet).sort();
    console.log(chalk.blue(`Found components: ${page.componentsUsed.join(', ')}`));
  }

  return { page, template, pagesByTemplate };
}

function extractTemplatePath(root: Record<string, unknown>): string | undefined {
  // Direct template reference
  if (typeof root['cq:template'] === 'string') {
    return root['cq:template'] as string;
  }
  // Template in jcr:content
  if (root['jcr:content'] && typeof root['jcr:content'] === 'object') {
    const jcrContent = root['jcr:content'] as Record<string, unknown>;
    if (typeof jcrContent['cq:template'] === 'string') {
      return jcrContent['cq:template'] as string;
    }
  }
  return undefined;
}

function extractComponentsFromPolicy(policyMapping: Record<string, unknown>): string[] {
  const components = new Set<string>();
  
  // Helper to add components from various formats
  const addComponents = (value: unknown) => {
    if (typeof value === 'string') {
      // Single component or group reference
      if (value.startsWith('/') || value.startsWith('group:')) {
        components.add(value);
      }
    } else if (Array.isArray(value)) {
      // Array of components/groups
      for (const item of value) {
        if (typeof item === 'string' && (item.startsWith('/') || item.startsWith('group:'))) {
          components.add(item);
        }
      }
    }
  };
  
  // Look in root/container
  const root = policyMapping['root'];
  if (root && typeof root === 'object') {
    const rootObj = root as Record<string, unknown>;
    
    // Check root components
    addComponents(rootObj['components']);
    
    // Check container components
    const container = rootObj['container'];
    if (container && typeof container === 'object') {
      const containerObj = container as Record<string, unknown>;
      addComponents(containerObj['components']);
    }
  }
  
  return Array.from(components).sort();
}

function collectResourceTypes(node: Record<string, unknown>, out: Set<string>): void {
  const rt = node['sling:resourceType'];
  if (typeof rt === 'string' && rt.trim()) out.add(rt);
  for (const value of Object.values(node)) {
    if (value && typeof value === 'object') {
      if (Array.isArray(value)) {
        for (const item of value) if (item && typeof item === 'object') collectResourceTypes(item as Record<string, unknown>, out);
      } else {
        collectResourceTypes(value as Record<string, unknown>, out);
      }
    }
  }
}
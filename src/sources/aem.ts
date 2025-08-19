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

function findPoliciesByType(root: Record<string, unknown>, type: string, path: string = '/', out: PolicyInfo[] = []): PolicyInfo[] {
  // Debug the current node
  console.log(chalk.gray(`Checking node at ${path}`));
  if (typeof root['jcr:title'] === 'string') {
    console.log(chalk.gray(`Node title: ${root['jcr:title']}`));
  }
  if (typeof root['sling:resourceType'] === 'string') {
    console.log(chalk.gray(`Resource type: ${root['sling:resourceType']}`));
  }

  // Look for policy nodes
  if (typeof root['sling:resourceType'] === 'string' && 
      root['sling:resourceType'].includes('policy/policy')) {
    
    // Check if this is under the type we want
    const pathParts = path.split('/');
    const isUnderType = pathParts.some(part => part === type);
    
    console.log(chalk.gray(`Found policy at ${path}, path parts: ${pathParts.join(', ')}, looking for: ${type}`));
    
    if (isUnderType) {
      console.log(chalk.blue(`Found ${type} policy at ${path}`));
      
      const clientlibs = Array.isArray(root['clientlibs']) ? 
        root['clientlibs'].filter((c): c is string => typeof c === 'string') : 
        undefined;
      
      const components = Array.isArray(root['components']) ?
        root['components'].filter((c): c is string => typeof c === 'string') :
        undefined;

      if (clientlibs) console.log(chalk.blue(`Found clientlibs: ${clientlibs.join(', ')}`));
      if (components) console.log(chalk.blue(`Found components: ${components.join(', ')}`));

      out.push({
        path,
        type,
        clientlibs,
        components,
        config: root
      });
    }
  }

  // Recurse into children
  for (const [key, value] of Object.entries(root)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      findPoliciesByType(value as Record<string, unknown>, type, `${path}${key}/`, out);
    }
  }

  return out;
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
    `${opts.contentPath}/_jcr_content.infinity.json`,
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
    }

    // Collect components used on the page
    const componentSet = new Set<string>();
    collectResourceTypes(root, componentSet);
    page.componentsUsed = Array.from(componentSet).sort();
    console.log(chalk.blue(`Found components: ${page.componentsUsed.join(', ')}`));
  }

  // 2) If we found a template, fetch its structure and policies
  if (template.path) {
    // Extract conf path from template path
    const confPath = template.path.split('/settings/wcm/templates/')[0];
    console.log(chalk.blue(`\nTemplate conf path: ${confPath}`));

    // First check policies directory
    console.log(chalk.blue('\nFetching policies directory...'));
    const policiesRoot = await tryGetFirstJson(client, [
      `${confPath}/settings/wcm/policies.infinity.json`
    ]);
    
    if (policiesRoot && typeof policiesRoot === 'object') {
      // Look for page policy
      const pagePolicies = findPoliciesByType(policiesRoot as Record<string, unknown>, 'page');
      for (const policy of pagePolicies) {
        console.log(chalk.blue(`Found page policy: ${policy.path}`));
        if (policy.clientlibs) {
          console.log(chalk.blue(`Found clientlibs: ${policy.clientlibs.join(', ')}`));
          template.policies[policy.path] = {
            categories: policy.clientlibs,
            config: policy.config
          };
        }
      }

      // Look for container/parsys policies
      const containerPolicies = findPoliciesByType(policiesRoot as Record<string, unknown>, 'container');
      for (const policy of containerPolicies) {
        console.log(chalk.blue(`Found container policy: ${policy.path}`));
        if (policy.components) {
          console.log(chalk.blue(`Found allowed components: ${policy.components.join(', ')}`));
          template.allowedComponents.push(...policy.components);
          template.policies[policy.path] = {
            categories: extractClientlibCategories(policy.config),
            config: policy.config
          };
        }
      }
    }

    // Then check template structure
    console.log(chalk.blue('\nFetching template structure...'));
    const tplStruct = await tryGetFirstJson(client, [
      `${template.path}/structure/jcr:content.infinity.json`,
    ]);
    console.log(chalk.gray('Template structure:', JSON.stringify(tplStruct, null, 2)));

    if (tplStruct && typeof tplStruct === 'object') {
      // Look for root container policy
      const rootPolicy = (tplStruct as any)?.['jcr:content']?.['cq:policy'];
      if (rootPolicy) {
        console.log(chalk.blue(`Found root policy: ${rootPolicy}`));
        const policyJson = await tryGetFirstJson(client, [
          `${confPath}/settings/wcm/policies/${rootPolicy}.infinity.json`
        ]);
        if (policyJson && typeof policyJson === 'object') {
          console.log(chalk.gray('Policy JSON:', JSON.stringify(policyJson, null, 2)));
          const components = extractAllowedComponents(policyJson as Record<string, unknown>);
          template.allowedComponents.push(...components);
          template.policies[rootPolicy] = {
            categories: extractClientlibCategories(policyJson as Record<string, unknown>),
            config: policyJson as Record<string, unknown>
          };
        }
      }

      // Look for container components and their policies
      const containers = findContainers(tplStruct as Record<string, unknown>);
      console.log(chalk.blue(`\nFound containers: ${containers.map(c => c.path).join(', ')}`));
      
      for (const container of containers) {
        if (container.policy) {
          console.log(chalk.blue(`Fetching container policy: ${container.policy}`));
          const policyJson = await tryGetFirstJson(client, [
            `${confPath}/settings/wcm/policies/${container.policy}.infinity.json`
          ]);
          if (policyJson && typeof policyJson === 'object') {
            console.log(chalk.gray('Container policy JSON:', JSON.stringify(policyJson, null, 2)));
            const components = extractAllowedComponents(policyJson as Record<string, unknown>);
            template.allowedComponents.push(...components);
            template.policies[container.policy] = {
              categories: extractClientlibCategories(policyJson as Record<string, unknown>),
              config: policyJson as Record<string, unknown>
            };
          }
        }
      }
    }

    // Dedupe allowed components
    template.allowedComponents = Array.from(new Set(template.allowedComponents)).sort();
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

interface ContainerInfo {
  path: string;
  resourceType: string;
  policy?: string;
}

function findContainers(node: Record<string, unknown>, path: string = '/', out: ContainerInfo[] = []): ContainerInfo[] {
  const resourceType = node['sling:resourceType'];
  if (typeof resourceType === 'string' && 
      (resourceType.includes('/container') || 
       resourceType.includes('/parsys') || 
       resourceType.includes('/responsivegrid'))) {
    const policy = node['cq:policy'];
    out.push({
      path,
      resourceType,
      policy: typeof policy === 'string' ? policy : undefined
    });
  }

  for (const [key, value] of Object.entries(node)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      findContainers(value as Record<string, unknown>, `${path}${key}/`, out);
    }
  }
  return out;
}

function extractAllowedComponents(policyJson: Record<string, unknown>): string[] {
  const components = new Set<string>();

  const addComponent = (val: unknown) => {
    if (typeof val === 'string' && val.includes('/')) {
      console.log(chalk.gray(`Found allowed component: ${val}`));
      components.add(val.trim());
    }
  };

  const scan = (obj: Record<string, unknown>) => {
    // Look for components map (key -> true)
    if (obj.components && typeof obj.components === 'object') {
      console.log(chalk.gray('Found components object:', obj.components));
      const comps = obj.components as Record<string, unknown>;
      for (const [key, value] of Object.entries(comps)) {
        if (value === true || value === 'true') addComponent(key);
      }
    }

    // Look for arrays of allowed components
    for (const [key, value] of Object.entries(obj)) {
      if (key.toLowerCase().includes('allowed') && Array.isArray(value)) {
        console.log(chalk.gray(`Found allowed array in key: ${key}`, value));
        for (const item of value) addComponent(item);
      }
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        scan(value as Record<string, unknown>);
      }
    }
  };

  scan(policyJson);
  return Array.from(components).sort();
}

function extractClientlibCategories(policyJson: Record<string, unknown>): string[] {
  const candidates: string[] = [];
  const add = (val: unknown) => {
    if (typeof val === 'string' && val.trim()) candidates.push(val.trim());
    if (Array.isArray(val)) for (const v of val) if (typeof v === 'string' && v.trim()) candidates.push(v.trim());
  };
  const keys = [
    'clientlibs',
    'clientLibs',
    'allowedClientlibCategories',
    'allowedClientlibs',
    'allowedClientlibsCategories',
    'categories',
    'clientlibsCategories',
  ];
  const scan = (obj: Record<string, unknown>) => {
    for (const [k, v] of Object.entries(obj)) {
      if (keys.includes(k)) {
        console.log(chalk.gray(`Found clientlib key: ${k} with value:`, v));
        add(v);
      }
      if (v && typeof v === 'object' && !Array.isArray(v)) scan(v as Record<string, unknown>);
    }
  };
  scan(policyJson);
  return Array.from(new Set(candidates)).sort();
}
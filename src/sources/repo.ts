import fg from 'fast-glob';
import { readFile } from 'fs/promises';
import * as xml2js from 'xml2js';
import { basename, dirname, join, relative } from 'path';

export interface ClientLibInfo {
  category: string;
  path: string;
  embeds: string[];
  dependencies: string[];
  assets: { js: string[]; css: string[] };
  nodeType?: string;
  allowProxy?: boolean;
  longCacheKey?: string;
}

export interface DependencyGraph {
  nodes: string[];                                          // All categories
  edges: Array<{ from: string; to: string; type: 'embed' | 'dependency' }>;
  circular: string[][];                                     // Circular dependency chains
  unused: string[];                                         // Categories not referenced anywhere
  duplicates: Array<{ category: string; paths: string[] }>; // Categories defined multiple times
}

export interface RepoUsage {
  clientlibs: ClientLibInfo[];
  htlInclusions: Array<{ file: string; category: string; type: 'css' | 'js' | 'all' }>; 
  templateCategoryRefs: Array<{ file: string; category: string; context: string }>;
  dependencyGraph: DependencyGraph;
}

export async function analyzeRepository({ repoRoot, clientlibsCsv }: { repoRoot: string; clientlibsCsv?: string }): Promise<RepoUsage> {
  const clientlibs: ClientLibInfo[] = [];
  const htlInclusions: Array<{ file: string; category: string; type: 'css' | 'js' | 'all' }> = [];
  const templateCategoryRefs: Array<{ file: string; category: string; context: string }> = [];

  console.log(`Scanning repository: ${repoRoot}`);

  // 1. Find client library folders by scanning for .content.xml files with cq:ClientLibraryFolder
  const contentXmlFiles = await fg(['**/ui.apps/jcr_root/**/.content.xml', '**/ui.frontend/**/.content.xml'], { 
    cwd: repoRoot, 
    dot: false, 
    ignore: ['node_modules/**', 'target/**', 'dist/**'] 
  });

  console.log(`Found ${contentXmlFiles.length} .content.xml files`);

  for (const xmlFile of contentXmlFiles) {
    try {
      const clientLib = await parseClientLibraryFolder(repoRoot, xmlFile);
      if (clientLib) {
        clientlibs.push(clientLib);
      }
    } catch (error) {
      console.warn(`Failed to parse ${xmlFile}: ${error}`);
    }
  }

  // 2. Also check for clientlib.config.js files (frontend build configurations)
  const configFiles = await fg(['**/ui.frontend/**/clientlib.config.js'], { 
    cwd: repoRoot, 
    dot: false, 
    ignore: ['node_modules/**', 'target/**', 'dist/**'] 
  });

  for (const configFile of configFiles) {
    try {
      const clientLib = await parseClientLibraryConfig(repoRoot, configFile);
      if (clientLib) {
        clientlibs.push(clientLib);
      }
    } catch (error) {
      console.warn(`Failed to parse ${configFile}: ${error}`);
    }
  }

  // 3. Scan HTL templates for clientlib inclusions with enhanced patterns
  const htlFiles = await fg(['**/*.html'], { 
    cwd: repoRoot, 
    dot: false, 
    ignore: ['node_modules/**', 'target/**', 'dist/**'] 
  });

  for (const htlFile of htlFiles) {
    try {
      const inclusions = await scanHTLForClientLibs(repoRoot, htlFile);
      htlInclusions.push(...inclusions);
    } catch (error) {
      console.warn(`Failed to scan HTL file ${htlFile}: ${error}`);
    }
  }

  // 4. Scan component/template files and policies for category references
  const policyFiles = await fg(['**/*.html', '**/*.js', '**/*.json'], { 
    cwd: repoRoot, 
    dot: false, 
    ignore: ['node_modules/**', 'target/**', 'dist/**'] 
  });

  for (const policyFile of policyFiles) {
    try {
      const refs = await scanForCategoryReferences(repoRoot, policyFile);
      templateCategoryRefs.push(...refs);
    } catch (error) {
      console.warn(`Failed to scan policy file ${policyFile}: ${error}`);
    }
  }

  // 5. Build dependency graph and analyze
  const dependencyGraph = buildDependencyGraph(clientlibs, htlInclusions, templateCategoryRefs);

  console.log(`Found ${clientlibs.length} client libraries, ${htlInclusions.length} HTL inclusions, ${templateCategoryRefs.length} template references`);
  console.log(`Dependency analysis: ${dependencyGraph.circular.length} circular dependencies, ${dependencyGraph.unused.length} unused categories, ${dependencyGraph.duplicates.length} duplicate categories`);

  return { clientlibs, htlInclusions, templateCategoryRefs, dependencyGraph };
}

/**
 * Parse a .content.xml file to extract client library information
 */
async function parseClientLibraryFolder(repoRoot: string, xmlFilePath: string): Promise<ClientLibInfo | null> {
  const fullPath = join(repoRoot, xmlFilePath);
  const content = await readFile(fullPath, 'utf-8');
  
  const parser = new xml2js.Parser({ trim: true, explicitArray: false });
  const result = await parser.parseStringPromise(content);
  const jcrRoot = result['jcr:root'];
  
  if (!jcrRoot || jcrRoot['jcr:primaryType'] !== 'cq:ClientLibraryFolder') {
    return null;
  }

  const clientLibFolder = dirname(xmlFilePath);
  const category = jcrRoot.categories || '';
  const embeds = parseStringArray(jcrRoot.embed);
  const dependencies = parseStringArray(jcrRoot.dependencies);
  
  // Scan for JS and CSS assets in the client library folder
  const assets = await scanClientLibAssets(repoRoot, clientLibFolder);

  return {
    category: Array.isArray(category) ? category.join(',') : category,
    path: clientLibFolder,
    embeds,
    dependencies,
    assets,
    nodeType: jcrRoot['jcr:primaryType'],
    allowProxy: jcrRoot.allowProxy === 'true' || jcrRoot.allowProxy === true,
    longCacheKey: jcrRoot.longCacheKey || undefined,
  };
}

/**
 * Parse a clientlib.config.js file (frontend build configuration)
 */
async function parseClientLibraryConfig(repoRoot: string, configFilePath: string): Promise<ClientLibInfo | null> {
  const fullPath = join(repoRoot, configFilePath);
  const content = await readFile(fullPath, 'utf-8');
  
  try {
    // Basic parsing of clientlib.config.js - this is typically a JS module
    // Look for common patterns like module.exports or export default
    const categoryMatch = content.match(/categories?\s*:\s*['"]([^'"]+)['"]/);
    const embedMatch = content.match(/embed\s*:\s*\[([^\]]+)\]/);
    const dependenciesMatch = content.match(/dependencies\s*:\s*\[([^\]]+)\]/);
    
    if (!categoryMatch) {
      return null;
    }

    const category = categoryMatch[1];
    const embeds = embedMatch ? parseJSArray(embedMatch[1]) : [];
    const dependencies = dependenciesMatch ? parseJSArray(dependenciesMatch[1]) : [];
    
    const clientLibFolder = dirname(configFilePath);
    const assets = await scanClientLibAssets(repoRoot, clientLibFolder);

    return {
      category,
      path: clientLibFolder,
      embeds,
      dependencies,
      assets,
      nodeType: 'cq:ClientLibraryFolder',
    };
  } catch (error) {
    console.warn(`Failed to parse JS config ${configFilePath}: ${error}`);
    return null;
  }
}

/**
 * Scan for JavaScript and CSS assets within a client library folder
 */
async function scanClientLibAssets(repoRoot: string, clientLibFolder: string): Promise<{ js: string[]; css: string[] }> {
  const jsFiles = await fg(['**/*.js'], { 
    cwd: join(repoRoot, clientLibFolder), 
    dot: false,
    ignore: ['node_modules/**'] 
  });
  
  const cssFiles = await fg(['**/*.css'], { 
    cwd: join(repoRoot, clientLibFolder), 
    dot: false,
    ignore: ['node_modules/**'] 
  });

  return {
    js: jsFiles.map(f => relative(clientLibFolder, f)),
    css: cssFiles.map(f => relative(clientLibFolder, f))
  };
}

/**
 * Scan HTL files for client library inclusions with enhanced patterns
 */
async function scanHTLForClientLibs(repoRoot: string, htlFile: string): Promise<Array<{ file: string; category: string; type: 'css' | 'js' | 'all' }>> {
  const fullPath = join(repoRoot, htlFile);
  const content = await readFile(fullPath, 'utf-8');
  const inclusions: Array<{ file: string; category: string; type: 'css' | 'js' | 'all' }> = [];

  // Enhanced patterns for various HTL clientlib inclusion methods
  const clientlibPatterns = [
    // Standard data-sly-use patterns
    { regex: /data-sly-use\.clientLib=['"]\/libs\/granite\/sightly\/templates\/clientlib\.html['"]/g, type: 'all' as const },
    { regex: /data-sly-use\.clientlib=['"]\/libs\/granite\/sightly\/templates\/clientlib\.html['"]/g, type: 'all' as const },
    
    // CSS inclusion patterns
    { regex: /\$\{clientLib\.css\s*@\s*categories\s*=\s*['"]([^'"]+)['"]/g, type: 'css' as const },
    { regex: /\$\{clientlib\.css\s*@\s*categories\s*=\s*['"]([^'"]+)['"]/g, type: 'css' as const },
    { regex: /data-sly-call\s*=\s*['"]\$\{clientLib\.css\s*@\s*categories\s*=\s*['"]([^'"]+)['"]/g, type: 'css' as const },
    { regex: /data-sly-call\s*=\s*['"]\$\{clientlib\.css\s*@\s*categories\s*=\s*['"]([^'"]+)['"]/g, type: 'css' as const },
    
    // JavaScript inclusion patterns  
    { regex: /\$\{clientLib\.js\s*@\s*categories\s*=\s*['"]([^'"]+)['"]/g, type: 'js' as const },
    { regex: /\$\{clientlib\.js\s*@\s*categories\s*=\s*['"]([^'"]+)['"]/g, type: 'js' as const },
    { regex: /data-sly-call\s*=\s*['"]\$\{clientLib\.js\s*@\s*categories\s*=\s*['"]([^'"]+)['"]/g, type: 'js' as const },
    { regex: /data-sly-call\s*=\s*['"]\$\{clientlib\.js\s*@\s*categories\s*=\s*['"]([^'"]+)['"]/g, type: 'js' as const },
    
    // All (both CSS and JS) inclusion patterns
    { regex: /\$\{clientLib\.all\s*@\s*categories\s*=\s*['"]([^'"]+)['"]/g, type: 'all' as const },
    { regex: /\$\{clientlib\.all\s*@\s*categories\s*=\s*['"]([^'"]+)['"]/g, type: 'all' as const },
    { regex: /data-sly-call\s*=\s*['"]\$\{clientLib\.all\s*@\s*categories\s*=\s*['"]([^'"]+)['"]/g, type: 'all' as const },
    { regex: /data-sly-call\s*=\s*['"]\$\{clientlib\.all\s*@\s*categories\s*=\s*['"]([^'"]+)['"]/g, type: 'all' as const },
    
    // Alternative inclusion patterns
    { regex: /data-sly-include=['"][^'"]*\/clientlibs\/[^'"]*['"]\s+[^>]*categories\s*=\s*['"]([^'"]+)['"]/g, type: 'all' as const },
    { regex: /\$\{clientlib\s*@\s*categories\s*=\s*['"]([^'"]+)['"][^}]*type\s*=\s*['"]css['"]/g, type: 'css' as const },
    { regex: /\$\{clientlib\s*@\s*categories\s*=\s*['"]([^'"]+)['"][^}]*type\s*=\s*['"]js['"]/g, type: 'js' as const },
  ];

  for (const pattern of clientlibPatterns) {
    let match;
    while ((match = pattern.regex.exec(content)) !== null) {
      if (match[1]) {
        // Handle comma-separated categories
        const categories = match[1].split(',').map(c => c.trim()).filter(Boolean);
        for (const category of categories) {
          inclusions.push({ file: htlFile, category, type: pattern.type });
        }
      }
    }
  }

  return inclusions;
}

/**
 * Scan files for client library category references with context
 */
async function scanForCategoryReferences(repoRoot: string, filePath: string): Promise<Array<{ file: string; category: string; context: string }>> {
  const fullPath = join(repoRoot, filePath);
  const content = await readFile(fullPath, 'utf-8');
  const references: Array<{ file: string; category: string; context: string }> = [];

  // Enhanced patterns for category references in different contexts
  const categoryPatterns = [
    // Policy configurations
    { regex: /"categories"\s*:\s*\[([^\]]+)\]/g, context: 'policy-array' },
    { regex: /"categories"\s*:\s*['"]([^'"]+)['"]/g, context: 'policy-string' },
    { regex: /"clientLibCategories"\s*:\s*\[([^\]]+)\]/g, context: 'policy-array' },
    { regex: /"clientLibCategories"\s*:\s*['"]([^'"]+)['"]/g, context: 'policy-string' },
    
    // Component configurations
    { regex: /categories\s*[=:]\s*['"]([^'"]+)['"]/g, context: 'component-config' },
    { regex: /clientLibCategory\s*[=:]\s*['"]([^'"]+)['"]/g, context: 'component-config' },
    
    // Template references
    { regex: /cq:clientLibCategories\s*=\s*['"]([^'"]+)['"]/g, context: 'template-property' },
    { regex: /clientLibCategories=['"]([^'"]+)['"]/g, context: 'template-attribute' },
    
    // JavaScript references
    { regex: /loadClientLib\s*\(\s*['"]([^'"]+)['"]/g, context: 'js-function-call' },
    { regex: /includeClientLib\s*\(\s*['"]([^'"]+)['"]/g, context: 'js-function-call' },
    
    // Page properties and configurations
    { regex: /"cq:clientLibCategories"\s*:\s*\[([^\]]+)\]/g, context: 'page-properties' },
    { regex: /"cq:clientLibCategories"\s*:\s*['"]([^'"]+)['"]/g, context: 'page-properties' }
  ];

  for (const pattern of categoryPatterns) {
    let match;
    while ((match = pattern.regex.exec(content)) !== null) {
      if (match[1]) {
        // Handle both single categories and arrays
        const categories = match[1].includes(',') || match[1].includes('"') 
          ? parseJSArray(match[1]) 
          : [match[1]];
        
        for (const category of categories) {
          references.push({ file: filePath, category: category.trim(), context: pattern.context });
        }
      }
    }
  }

  return references;
}

/**
 * Parse a string or string array from XML attributes
 */
function parseStringArray(value: string | string[] | undefined): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    // Handle comma-separated or space-separated values
    return value.split(/[,\s]+/).filter(Boolean);
  }
  return [];
}

/**
 * Parse a JavaScript array string (e.g., from config files)
 */
function parseJSArray(arrayString: string): string[] {
  try {
    // Clean up the string and extract quoted values
    const matches = arrayString.match(/['"]([^'"]+)['"]/g);
    if (matches) {
      return matches.map(m => m.slice(1, -1)); // Remove quotes
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Build dependency graph and analyze for duplicates, unused categories, and circular dependencies
 */
function buildDependencyGraph(
  clientlibs: ClientLibInfo[], 
  htlInclusions: Array<{ file: string; category: string; type: 'css' | 'js' | 'all' }>,
  templateRefs: Array<{ file: string; category: string; context: string }>
): DependencyGraph {
  // Collect all categories
  const allCategories = new Set<string>();
  const categoryToPath = new Map<string, string[]>();
  const edges: Array<{ from: string; to: string; type: 'embed' | 'dependency' }> = [];
  
  // Process clientlibs to build category mapping and dependencies
  for (const clientlib of clientlibs) {
    allCategories.add(clientlib.category);
    
    // Track which paths define each category (for duplicate detection)
    if (!categoryToPath.has(clientlib.category)) {
      categoryToPath.set(clientlib.category, []);
    }
    categoryToPath.get(clientlib.category)!.push(clientlib.path);
    
    // Add embed relationships
    for (const embed of clientlib.embeds) {
      allCategories.add(embed);
      edges.push({ from: clientlib.category, to: embed, type: 'embed' });
    }
    
    // Add dependency relationships
    for (const dep of clientlib.dependencies) {
      allCategories.add(dep);
      edges.push({ from: clientlib.category, to: dep, type: 'dependency' });
    }
  }
  
  // Collect referenced categories from HTL and templates
  const referencedCategories = new Set<string>();
  
  for (const inclusion of htlInclusions) {
    referencedCategories.add(inclusion.category);
  }
  
  for (const ref of templateRefs) {
    referencedCategories.add(ref.category);
  }
  
  // Find duplicates
  const duplicates: Array<{ category: string; paths: string[] }> = [];
  for (const [category, paths] of categoryToPath.entries()) {
    if (paths.length > 1) {
      duplicates.push({ category, paths });
    }
  }
  
  // Find unused categories (defined but never referenced)
  const definedCategories = new Set(clientlibs.map(c => c.category));
  const unused: string[] = [];
  
  for (const category of definedCategories) {
    if (!referencedCategories.has(category)) {
      // Check if it's embedded or depended upon by other clientlibs
      const isUsedInternally = edges.some(edge => edge.to === category);
      if (!isUsedInternally) {
        unused.push(category);
      }
    }
  }
  
  // Find circular dependencies using DFS
  const circular: string[][] = [];
  const visited = new Set<string>();
  const recStack = new Set<string>();
  
  function findCircularDFS(category: string, path: string[]): boolean {
    if (recStack.has(category)) {
      // Found a cycle - extract the circular part
      const cycleStart = path.indexOf(category);
      if (cycleStart >= 0) {
        circular.push([...path.slice(cycleStart), category]);
      }
      return true;
    }
    
    if (visited.has(category)) {
      return false;
    }
    
    visited.add(category);
    recStack.add(category);
    
    // Check all dependencies and embeds
    const relatedEdges = edges.filter(edge => edge.from === category);
    for (const edge of relatedEdges) {
      if (findCircularDFS(edge.to, [...path, category])) {
        // Continue to find all cycles, don't return early
      }
    }
    
    recStack.delete(category);
    return false;
  }
  
  // Check for cycles starting from each category
  for (const category of allCategories) {
    if (!visited.has(category)) {
      findCircularDFS(category, []);
    }
  }
  
  // Remove duplicate circular dependency chains
  const uniqueCircular = circular.filter((cycle, index) => {
    return !circular.slice(0, index).some(existingCycle => 
      cycle.length === existingCycle.length && 
      cycle.every(cat => existingCycle.includes(cat))
    );
  });
  
  return {
    nodes: Array.from(allCategories),
    edges,
    circular: uniqueCircular,
    unused,
    duplicates
  };
}



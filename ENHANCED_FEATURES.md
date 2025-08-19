# Enhanced AEM Client Library Analysis Features

## Overview

The enhanced implementation now provides comprehensive HTL clientlib inclusion detection, dependency graph analysis, and intelligent detection of duplicates, unused categories, and circular dependencies.

## 🔍 Enhanced HTL Detection Patterns

### Comprehensive Clientlib Inclusion Detection
The scanner now recognizes a wide variety of HTL patterns for client library inclusions:

#### Standard HTL Patterns
```html
<!-- Basic clientlib usage -->
<sly data-sly-use.clientLib="/libs/granite/sightly/templates/clientlib.html"/>
<sly data-sly-use.clientlib="/libs/granite/sightly/templates/clientlib.html"/>

<!-- CSS-specific inclusions -->
${clientLib.css @ categories='site.base'}
${clientlib.css @ categories='component.header'}
<sly data-sly-call="${clientLib.css @ categories='theme.main'}"/>

<!-- JavaScript-specific inclusions -->
${clientLib.js @ categories='site.base'}
${clientlib.js @ categories='component.header'}
<sly data-sly-call="${clientLib.js @ categories='theme.main'}"/>

<!-- All (CSS + JS) inclusions -->
${clientLib.all @ categories='site.base'}
<sly data-sly-call="${clientLib.all @ categories='theme.main'}"/>
```

#### Advanced Pattern Recognition
- **Multi-category support**: `categories='category1,category2,category3'`
- **Type-specific detection**: Distinguishes between CSS, JS, and ALL inclusions
- **Alternative syntax**: Supports various HTL inclusion methods and legacy patterns

### Category Reference Context Detection

#### Policy and Configuration Files
```json
{
  "categories": ["site.base", "components.common"],
  "clientLibCategories": ["theme.main"]
}
```

#### Template and Component Properties
```html
<div cq:clientLibCategories="site.mobile">
<component clientLibCategories="feature.gallery">
```

#### JavaScript Function Calls
```javascript
loadClientLib('site.utilities');
includeClientLib('component.carousel');
```

## 📊 Dependency Graph Analysis

### Data Structure
```typescript
interface DependencyGraph {
  nodes: string[];                                          // All discovered categories
  edges: Array<{ from: string; to: string; type: 'embed' | 'dependency' }>;
  circular: string[][];                                     // Circular dependency chains  
  unused: string[];                                         // Categories not referenced anywhere
  duplicates: Array<{ category: string; paths: string[] }>; // Categories defined multiple times
}
```

### Enhanced RepoUsage Interface
```typescript
interface RepoUsage {
  clientlibs: ClientLibInfo[];
  htlInclusions: Array<{ 
    file: string; 
    category: string; 
    type: 'css' | 'js' | 'all' 
  }>; 
  templateCategoryRefs: Array<{ 
    file: string; 
    category: string; 
    context: string 
  }>;
  dependencyGraph: DependencyGraph;
}
```

## 🔄 Circular Dependency Detection

### Algorithm
Uses Depth-First Search (DFS) with recursion stack tracking to identify circular dependencies in client library relationships.

### Example Detection
```
site.base → depends on → theme.main
theme.main → embeds → utilities.common  
utilities.common → depends on → site.base
```
**Result**: Circular dependency detected: `[site.base, theme.main, utilities.common, site.base]`

## 🚫 Unused Category Detection

### Detection Logic
Categories are marked as unused if they are:
1. **Defined** in a client library folder
2. **Not referenced** in any HTL templates
3. **Not referenced** in any policy/template configurations  
4. **Not embedded or depended upon** by other client libraries

### Smart Analysis
The system differentiates between:
- **Truly unused**: Categories with no references whatsoever
- **Internally used**: Categories used only within the client library dependency chain
- **Externally referenced**: Categories actively used in templates/components

## 🔁 Duplicate Category Detection

### Detection Method
Identifies categories that are defined in multiple client library folders, which can cause:
- Loading conflicts
- Unpredictable behavior
- Performance issues
- Maintenance complexity

### Output Format
```typescript
{
  category: "site.base",
  paths: [
    "ui.apps/jcr_root/apps/mysite/clientlibs/base",
    "ui.frontend/src/main/webpack/site/clientlibs/base"
  ]
}
```

## 🏗️ Context-Aware Reference Detection

### Reference Context Types
- **`policy-array`**: Categories in policy JSON arrays
- **`policy-string`**: Categories in policy JSON strings  
- **`component-config`**: Component configuration references
- **`template-property`**: HTL template property assignments
- **`template-attribute`**: HTML attribute references
- **`js-function-call`**: JavaScript function parameter references
- **`page-properties`**: Page-level clientlib configurations

## 📈 Analysis Output

### Console Reporting
```
Scanning repository: /path/to/aem/project
Found 15 .content.xml files
Found 12 client libraries, 28 HTL inclusions, 8 template references
Dependency analysis: 1 circular dependencies, 3 unused categories, 2 duplicate categories
```

### Detailed Graph Analysis
- **Nodes**: Complete list of all discovered client library categories
- **Edges**: All dependency and embed relationships with type classification
- **Circular Dependencies**: Full dependency chains showing circular references
- **Unused Categories**: Categories that should be considered for removal
- **Duplicates**: Categories that need consolidation

## 🎯 Use Cases

### 1. Performance Optimization
- Identify unused categories for removal
- Detect duplicate definitions causing conflicts
- Optimize dependency chains

### 2. Architecture Review  
- Visualize client library relationships
- Identify circular dependencies that need refactoring
- Understand category usage patterns

### 3. Migration Planning
- Map all client library references before restructuring
- Identify safe categories to modify or remove
- Plan consolidation of duplicate definitions

### 4. Code Quality
- Ensure consistent clientlib category naming
- Validate that all referenced categories exist
- Detect orphaned or unused client libraries

## 🚀 Integration

The enhanced analysis integrates seamlessly with the existing CLI:

```bash
node dist/index.js analyze \
  --path /content/site/en/page \
  --repo /path/to/aem/project \
  --out ./enhanced-analysis

# Output includes:
# - Complete clientlib inventory (ClientLibInfo[])
# - Enhanced HTL inclusion mapping
# - Dependency graph with circular/unused/duplicate detection
# - Context-aware reference tracking
```

This enhanced implementation provides the foundation for sophisticated client library optimization and architectural analysis in AEM projects.

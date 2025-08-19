# AEM Client Library Repository Analysis Implementation

## Overview

This implementation adds comprehensive repository scanning capabilities to analyze AEM client libraries within `ui.apps/jcr_root` and `ui.frontend` directories, parsing `cq:ClientLibraryFolder` nodes and their configurations.

## Features Implemented

### 1. Repository Scanner
- **Target Directories**: Scans `ui.apps/jcr_root` and `ui.frontend` directories specifically
- **File Discovery**: Uses fast-glob to efficiently find `.content.xml` and `clientlib.config.js` files
- **Intelligent Filtering**: Ignores `node_modules`, `target`, and `dist` directories

### 2. XML Parser for .content.xml Files
- **Node Type Detection**: Identifies `cq:ClientLibraryFolder` nodes
- **Property Extraction**: Parses `categories`, `embed`, `dependencies` properties
- **Extended Properties**: Captures `allowProxy`, `longCacheKey`, and other clientlib properties
- **Flexible Parsing**: Handles both single values and arrays for categories/dependencies

### 3. JavaScript Config Parser
- **clientlib.config.js Support**: Parses frontend build configuration files
- **Pattern Matching**: Uses regex to extract categories, embeds, and dependencies
- **Error Handling**: Graceful fallback when JS parsing fails

### 4. Asset Discovery
- **JavaScript Files**: Scans for `.js` files within client library folders
- **CSS Files**: Scans for `.css` files within client library folders
- **Relative Paths**: Returns asset paths relative to the client library folder

### 5. HTL Template Analysis
- **Clientlib Inclusions**: Detects `data-sly-use.clientlib` patterns
- **Category References**: Finds `${clientlib.css@categories=...}` and `${clientlib.js@categories=...}` patterns
- **Call Patterns**: Identifies `data-sly-call` clientlib usage

### 6. Policy and Template References
- **Category References**: Scans for category references in policy configurations
- **Multiple Contexts**: Searches HTML, JS, and other files for clientlib category usage
- **Flexible Patterns**: Handles various reference formats and naming conventions

## Enhanced Data Structures

### ClientLibInfo Interface
```typescript
export interface ClientLibInfo {
  category: string;          // Primary category
  path: string;             // Relative path from repo root
  embeds: string[];         // Embedded client libraries
  dependencies: string[];   // Client library dependencies
  assets: {                 // Discovered assets
    js: string[];
    css: string[];
  };
  nodeType?: string;        // JCR node type
  allowProxy?: boolean;     // Proxy allowance setting
  longCacheKey?: string;    // Cache key configuration
}
```

### RepoUsage Interface
```typescript
export interface RepoUsage {
  clientlibs: ClientLibInfo[];                              // All discovered client libraries
  htlInclusions: Array<{ file: string; category: string }>; // HTL template inclusions
  templateCategoryRefs: Array<{ file: string; category: string }>; // Template/policy references
}
```

## Parser Functions

### XML Parsing
- `parseClientLibraryFolder()`: Extracts clientlib info from .content.xml files
- `parseStringArray()`: Handles XML attribute parsing for arrays and strings

### JavaScript Config Parsing
- `parseClientLibraryConfig()`: Parses clientlib.config.js files
- `parseJSArray()`: Extracts array values from JavaScript configuration

### Asset and Reference Scanning
- `scanClientLibAssets()`: Discovers JS/CSS files in clientlib folders
- `scanHTLForClientLibs()`: Finds clientlib usage in HTL templates
- `scanForCategoryReferences()`: Locates category references in various file types

## Usage Example

```bash
# Analyze a repository with client libraries
node dist/index.js analyze \
  --path /content/site/en/page \
  --repo /path/to/aem/project \
  --out ./analysis-report

# The tool will:
# 1. Scan ui.apps/jcr_root and ui.frontend for .content.xml files
# 2. Parse cq:ClientLibraryFolder nodes
# 3. Extract categories, embeds, dependencies
# 4. Discover JS/CSS assets
# 5. Find HTL template references
# 6. Generate comprehensive report
```

## Output

The analysis generates detailed reports including:
- Complete client library inventory with dependencies
- Asset mapping (JS/CSS files per clientlib)
- HTL template usage patterns
- Policy and template category references
- Dependency graphs and potential optimization recommendations

## Error Handling

- **Graceful Degradation**: Individual file parsing errors don't stop the entire analysis
- **Detailed Logging**: Console warnings for parsing failures with file paths
- **Fallback Parsing**: Multiple parsing strategies for different configuration formats
- **Validation**: Checks for required node types and properties before processing

## Performance Optimizations

- **Targeted Scanning**: Focuses on known AEM directory structures
- **Efficient Globbing**: Uses fast-glob with intelligent ignore patterns
- **Parallel Processing**: Processes multiple files concurrently
- **Memory Efficient**: Streams file content and processes incrementally

This implementation provides a robust foundation for analyzing AEM client library structures and can be extended for additional analysis capabilities like dependency optimization, unused library detection, and performance recommendations.

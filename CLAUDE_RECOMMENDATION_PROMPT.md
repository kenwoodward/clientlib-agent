# AEM Client Library Analysis - Claude Recommendation Prompt

## Analysis Data Summary

Based on the WKND repository analysis, here's the structured data for Claude to generate recommendations:

### 📊 Current State Analysis

**Client Libraries Discovered:**
1. `wknd.base` - Main base library
   - Path: `ui.apps/src/main/content/jcr_root/apps/wknd/clientlibs/clientlib-base`
   - Embeds: 8 Core Components (accordion, tabs, carousel, image, breadcrumb, search, form, embed)
   - Dependencies: None
   - Status: ACTIVELY USED in templates

2. `wknd.dependencies` - Dependencies library
   - Path: `ui.apps/src/main/content/jcr_root/apps/wknd/clientlibs/clientlib-dependencies`
   - Embeds: granite.csrf.standalone
   - Dependencies: None
   - Status: UNUSED (no template references found)

3. `wknd.grid` - Grid layout library
   - Path: `ui.apps/src/main/content/jcr_root/apps/wknd/clientlibs/clientlib-grid`
   - Embeds: None
   - Dependencies: None
   - Status: UNUSED (no template references found)

**HTL Template Usage:**
- 8 clientlib inclusions found
- Only `wknd.base` is referenced in templates
- Found in XF page components (customheaderlibs.html, customfooterlibs.html)

**Dependency Graph Analysis:**
- Total categories in system: 12
- Dependency/embed relationships: 9
- Circular dependencies: 0 ✅
- Unused categories: 2 ⚠️
- Duplicate definitions: 0 ✅

---

## 🎯 Claude Recommendation Prompt

**Copy the following prompt to Claude in Cursor:**

```
You are an expert AEM client library and frontend architecture advisor. Based on this analysis data, provide actionable recommendations for optimizing the WKND project's client library architecture.

ANALYSIS DATA:
- 3 client libraries defined: wknd.base (used), wknd.dependencies (unused), wknd.grid (unused)
- wknd.base embeds 8 core components and is actively used in templates
- wknd.dependencies embeds granite.csrf.standalone but has no template references
- wknd.grid has no embeds/dependencies and no template references
- No circular dependencies detected
- All clientlibs have proxy enabled

REQUIREMENTS:
Please provide a structured JSON response with these keys:
- prioritizedSteps: Array of actionable steps with title, rationale, and impact (low/medium/high)
- proposedCategories: Suggested new or modified category names
- policyUpdates: Template/component policy changes needed
- risks: Potential risks or considerations

Focus on:
1. Consolidation opportunities for unused libraries
2. Performance optimization suggestions
3. Maintenance and organization improvements
4. Risk mitigation for any proposed changes

Provide practical, implementable recommendations for an AEM development team.
```

---

## 🔧 Alternative: Anthropic API Integration

If you prefer to integrate Anthropic's Claude API directly into the tool, I can modify the recommender to support both OpenAI and Anthropic APIs. This would involve:

1. Adding Anthropic SDK dependency
2. Adding `ANTHROPIC_API_KEY` environment variable support
3. Modifying the recommendation function to use Claude's API

Would you like me to implement the Anthropic API integration, or would you prefer to use the manual Claude prompt approach above?

## 📋 Usage Instructions

1. **Copy the Claude prompt** from the section above
2. **Paste it into Cursor's Claude interface**
3. **Review the generated recommendations**
4. **Apply the suggestions** to your WKND project

The analysis data provides Claude with all the context needed to generate specific, actionable recommendations for your client library architecture.


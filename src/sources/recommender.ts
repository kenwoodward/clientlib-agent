import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import type { AemDataBundle } from './aem.js';
import type { RepoUsage } from './repo.js';
import type { CorrelatedFindings } from './correlation.js';

export interface Recommendation {
  prioritizedSteps: Array<{ title: string; rationale: string; impact: 'low' | 'medium' | 'high' }>;
  proposedCategories: string[];
  policyUpdates: Array<{ template?: string; component?: string; addCategories?: string[]; removeCategories?: string[] }>;
  risks: string[];
}

export async function generateRecommendation({ aemData, repoData, correlated }: { aemData: AemDataBundle; repoData: RepoUsage; correlated: CorrelatedFindings }): Promise<Recommendation> {
  const openaiKey = process.env.OPENAI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  
  if (!openaiKey && !anthropicKey) {
    // Return enhanced analysis-based recommendations if no API key is configured
    return generateStaticRecommendation(repoData);
  }

  // Prefer Claude if both are available
  if (anthropicKey) {
    return await generateClaudeRecommendation({ aemData, repoData, correlated }, anthropicKey);
  } else {
    return await generateOpenAIRecommendation({ aemData, repoData, correlated }, openaiKey!);
  }
}

async function generateClaudeRecommendation({ aemData, repoData, correlated }: { aemData: AemDataBundle; repoData: RepoUsage; correlated: CorrelatedFindings }, apiKey: string): Promise<Recommendation> {
  const anthropic = new Anthropic({ apiKey });
  
  const systemPrompt = `You are an expert AEM client library and frontend architecture advisor. 
Analyze the provided data and return recommendations as a JSON object with these exact keys:
- prioritizedSteps: Array of {title: string, rationale: string, impact: "low"|"medium"|"high"}
- proposedCategories: Array of strings for new/modified category names
- policyUpdates: Array of {template?: string, component?: string, addCategories?: string[], removeCategories?: string[]}
- risks: Array of strings describing potential risks

Focus on performance optimization, consolidation opportunities, and maintenance improvements.`;

  const analysisData = {
    clientLibraries: repoData.clientlibs.map(lib => ({
      category: lib.category,
      path: lib.path,
      embeds: lib.embeds,
      dependencies: lib.dependencies,
      assetsCount: lib.assets.js.length + lib.assets.css.length,
      allowProxy: lib.allowProxy
    })),
    htlUsage: repoData.htlInclusions.map(inc => ({
      category: inc.category,
      type: inc.type,
      file: inc.file
    })),
    dependencyAnalysis: {
      totalCategories: repoData.dependencyGraph.nodes.length,
      unusedCategories: repoData.dependencyGraph.unused,
      circularDependencies: repoData.dependencyGraph.circular,
      duplicateDefinitions: repoData.dependencyGraph.duplicates
    }
  };

  try {
    const completion = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2000,
      temperature: 0.2,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `Analyze this AEM client library data and provide optimization recommendations: ${JSON.stringify(analysisData, null, 2)}`
      }]
    });

    const text = completion.content[0].type === 'text' ? completion.content[0].text : '{}';
    const parsed = JSON.parse(text) as Recommendation;
    return parsed;
  } catch (error) {
    console.warn('Claude API error:', error);
    return generateStaticRecommendation(repoData);
  }
}

async function generateOpenAIRecommendation({ aemData, repoData, correlated }: { aemData: AemDataBundle; repoData: RepoUsage; correlated: CorrelatedFindings }, apiKey: string): Promise<Recommendation> {
  const openai = new OpenAI({ apiKey });
  const system = 'You are an expert AEM client library and frontend architecture advisor. Output concise, actionable steps as JSON.';
  const user = JSON.stringify({ aemData, repoData, correlated });

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: `Analyze and propose client library/policy changes. Return JSON with keys: prioritizedSteps, proposedCategories, policyUpdates, risks. Input: ${user}` },
      ],
      temperature: 0.2,
    });

    const text = completion.choices[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(text) as Recommendation;
    return parsed;
  } catch (error) {
    console.warn('OpenAI API error:', error);
    return generateStaticRecommendation(repoData);
  }
}

function generateStaticRecommendation(repoData: RepoUsage): Recommendation {
  const steps: Array<{ title: string; rationale: string; impact: 'low' | 'medium' | 'high' }> = [];
  const risks: string[] = [];
  
  // Analyze unused categories
  if (repoData.dependencyGraph.unused.length > 0) {
    steps.push({
      title: `Remove ${repoData.dependencyGraph.unused.length} unused client libraries`,
      rationale: `Categories ${repoData.dependencyGraph.unused.join(', ')} have no template references and should be removed to reduce bundle size`,
      impact: 'medium'
    });
    risks.push('Verify unused categories are not loaded dynamically before removal');
  }

  // Check for circular dependencies
  if (repoData.dependencyGraph.circular.length > 0) {
    steps.push({
      title: 'Resolve circular dependencies',
      rationale: `Found ${repoData.dependencyGraph.circular.length} circular dependency chains that can cause loading issues`,
      impact: 'high'
    });
  }

  // Check for duplicates
  if (repoData.dependencyGraph.duplicates.length > 0) {
    steps.push({
      title: 'Consolidate duplicate client library definitions',
      rationale: `${repoData.dependencyGraph.duplicates.length} categories are defined multiple times`,
      impact: 'high'
    });
  }

  // Performance recommendations
  const totalCategories = repoData.clientlibs.length;
  const referencedCategories = new Set(repoData.htlInclusions.map(inc => inc.category)).size;
  
  if (totalCategories > referencedCategories + 2) {
    steps.push({
      title: 'Optimize client library architecture',
      rationale: `${totalCategories - referencedCategories} categories may be unused - consider consolidation`,
      impact: 'medium'
    });
  }

  if (steps.length === 0) {
    steps.push({
      title: 'Client library architecture is well-optimized',
      rationale: 'No major issues detected in dependency analysis',
      impact: 'low'
    });
  }

  return {
    prioritizedSteps: steps,
    proposedCategories: [],
    policyUpdates: [],
    risks
  };
}



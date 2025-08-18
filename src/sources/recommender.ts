import OpenAI from 'openai';
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
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // Return a deterministic stub if no API key is configured
    return {
      prioritizedSteps: [
        { title: 'Configure OPENAI_API_KEY to enable LLM recommendations', rationale: 'No API key detected', impact: 'low' },
      ],
      proposedCategories: [],
      policyUpdates: [],
      risks: ['LLM not executed; using static fallback'],
    };
  }

  const openai = new OpenAI({ apiKey });
  const system = 'You are an expert AEM client library and frontend architecture advisor. Output concise, actionable steps.';
  const user = JSON.stringify({ aemData, repoData, correlated });

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: `Analyze and propose client library/policy changes. Return JSON with keys: prioritizedSteps, proposedCategories, policyUpdates, risks. Input: ${user}` },
    ],
    temperature: 0.2,
  });

  const text = completion.choices[0]?.message?.content ?? '{}';
  try {
    const parsed = JSON.parse(text) as Recommendation;
    return parsed;
  } catch {
    return {
      prioritizedSteps: [
        { title: 'LLM response not JSON; inspect raw output', rationale: text.slice(0, 200), impact: 'low' },
      ],
      proposedCategories: [],
      policyUpdates: [],
      risks: ['Parsing error'],
    };
  }
}



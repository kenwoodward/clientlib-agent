## AEM Clientlib Agent (POC)

CLI tool to analyze an AEM page and client libraries, cross-reference repo usage, and produce LLM-backed recommendations for reorganizing or updating clientlibs and policies.

### Requirements
- Node.js >= 18.17
- Optional: `OPENAI_API_KEY` in your env for LLM recommendations

### Quick start
```bash
npm install
npm run build
node dist/index.js analyze \
  --aem-url https://author.example.com \
  --aem-user $AEM_USER --aem-pass $AEM_PASS \
  --path /content/site/en/page \
  --clientlibs site.base,apps.site.components.foo \
  --repo /path/to/aem/repo \
  --out ./report
```

Outputs:
- `report/data.json`: collected AEM + repo + correlation + recommendation
- `report/summary.md`: human-readable summary

Set `OPENAI_API_KEY` to enable actual LLM recommendations. Without it, a deterministic fallback recommendation is produced.

### Development
- `npm run dev` to run the CLI in TS directly
- `npm run build` to compile to `dist/`
- Executable shim: `bin/aem-clientlib-agent` (runs `dist/index.js`)

### Project structure
- `src/index.ts`: CLI entry
- `src/run/analyze.ts`: command orchestration
- `src/sources/aem.ts`: AEM collector (stubbed)
- `src/sources/repo.ts`: repo analyzer (stubbed)
- `src/sources/correlation.ts`: correlates AEM + repo
- `src/sources/recommender.ts`: LLM call + shaping
- `src/sources/report.ts`: writes outputs

### Next steps (3-day POC split)
- Engineer A: Implement `collectPageAndTemplateData` to fetch `model.json`/`.infinity.json`, template + policies, pages by template.
- Engineer B: Implement `analyzeRepository` to parse `cq:ClientLibraryFolder`, categories, embeds/deps, HTL/template references.
- Engineer C: Enhance correlation, improve prompt and output shaping, polish report, CLI UX.

### Environment
- `OPENAI_API_KEY`: OpenAI or Azure OpenAI compatible key (if using Azure, adjust client init accordingly later).
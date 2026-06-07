import type {
  CitationEnhancement,
  CitationNeed,
  PaperOutline,
  PubMedArticle,
  ReviewResult,
  SectionDraft,
  UsedReference,
} from '../types';
import { aiRespond } from './apiClient';
import { searchPubMedBundle } from './pubmedService';

const parseJson = <T>(text: string): T => {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced ?? text.match(/\{[\s\S]*\}/)?.[0] ?? text;
  return JSON.parse(candidate) as T;
};

async function askModel(system: string, prompt: string) {
  return aiRespond(system, prompt);
}

export async function generateOutline(researchContent: string, keywords: string): Promise<PaperOutline> {
  const text = await askModel(
    'You are a meticulous biomedical manuscript planning assistant. Return strict JSON only.',
    `Create a journal manuscript outline from the research input.

Research content:
${researchContent}

Keywords:
${keywords}

Return JSON with this shape:
{
  "title": "specific manuscript title",
  "abstract": "structured abstract draft, 180-250 words",
  "keywords": ["keyword"],
  "sections": [
    {"id":"introduction","title":"Introduction","purpose":"...", "targetWords": 700}
  ],
  "visualizationSuggestions": ["figure or table suggestion"]
}

Use standard journal sections and include Methods/Results/Discussion when appropriate.`,
  );
  return parseJson<PaperOutline>(text);
}

export async function draftSection(
  outline: PaperOutline,
  section: PaperOutline['sections'][number],
  researchContent: string,
): Promise<SectionDraft> {
  const content = await askModel(
    'You are a scientific manuscript writer. Be precise, cautious, and mark evidence gaps with [Ref].',
    `Write the "${section.title}" section for this manuscript.

Title: ${outline.title}
Section purpose: ${section.purpose}
Target words: ${section.targetWords ?? 600}

Research content:
${researchContent}

Use journal style. Put [Ref] exactly where external evidence is required. Do not invent citations.`,
  );

  return {
    sectionId: section.id,
    title: section.title,
    content,
  };
}

async function identifyCitationNeeds(draft: SectionDraft, keywords: string): Promise<CitationNeed[]> {
  const text = await askModel(
    'You identify citation needs and PubMed search queries. Return strict JSON only.',
    `Find claims in this section that need PubMed support.

Section: ${draft.title}
Text:
${draft.content}

Core keywords: ${keywords}

Return JSON:
{
  "citationNeeds": [
    {
      "placeholder": "[Ref]",
      "claim": "claim needing evidence",
      "evidenceType": "mechanism|clinical|method|epidemiology|background|other",
      "query": "PubMed search query"
    }
  ]
}

Create no more than 5 citation needs. Queries must be concise and PubMed-friendly.`,
  );
  return parseJson<{ citationNeeds: CitationNeed[] }>(text).citationNeeds ?? [];
}

async function rewriteWithEvidence(
  draft: SectionDraft,
  citationNeeds: CitationNeed[],
  articles: PubMedArticle[],
): Promise<{ content: string; references: UsedReference[] }> {
  if (articles.length === 0) {
    return { content: draft.content, references: [] };
  }

  const evidence = articles
    .map(
      (article) => `PMID: ${article.pmid}
Title: ${article.title}
Journal: ${article.journal}
Date: ${article.pubDate}
DOI: ${article.doi ?? 'N/A'}
Abstract: ${article.abstractText || 'No abstract available'}`,
    )
    .join('\n\n');

  const text = await askModel(
    'You rewrite manuscript sections using only the provided PubMed evidence. Return strict JSON only.',
    `Rewrite this manuscript section by replacing [Ref] placeholders with evidence-backed citations in [PMID:xxxx] format.

Section:
${draft.content}

Citation needs:
${JSON.stringify(citationNeeds, null, 2)}

Retrieved PubMed evidence:
${evidence}

Rules:
- Use only PMIDs from the retrieved PubMed evidence.
- Do not cite unsupported claims.
- Preserve the scientific meaning of the author's research.
- Return JSON:
{
  "content": "rewritten section",
  "references": [
    {"pmid":"123", "title":"...", "journal":"...", "pubDate":"...", "doi":"..."}
  ]
}`,
  );

  const parsed = parseJson<{ content: string; references: UsedReference[] }>(text);
  const validPmids = new Set(articles.map((article) => article.pmid));
  const references = (parsed.references ?? []).filter((ref) => validPmids.has(ref.pmid));
  return {
    content: parsed.content ?? draft.content,
    references,
  };
}

export async function enhanceSectionWithPubMed(
  draft: SectionDraft,
  keywords: string,
): Promise<CitationEnhancement> {
  const citationNeeds = await identifyCitationNeeds(draft, keywords);
  const bundles = await Promise.all(citationNeeds.map((need) => searchPubMedBundle(need.query, 5)));
  const foundArticles = Array.from(new Map(bundles.flat().map((article) => [article.pmid, article])).values());
  const rewritten = await rewriteWithEvidence(draft, citationNeeds, foundArticles);

  return {
    sectionId: draft.sectionId,
    title: draft.title,
    enhancedContent: rewritten.content,
    citationNeeds,
    foundArticles,
    references: rewritten.references,
  };
}

export function buildFinalManuscript(outline: PaperOutline, sections: CitationEnhancement[]) {
  const body = sections.map((section) => `## ${section.title}\n\n${section.enhancedContent}`).join('\n\n');
  const references = Array.from(
    new Map(sections.flatMap((section) => section.references).map((reference) => [reference.pmid, reference])).values(),
  );
  const referenceText =
    references.length === 0
      ? 'No PubMed references were validated for this draft.'
      : references
          .map(
            (ref, index) =>
              `${index + 1}. ${ref.title}. ${ref.journal}. ${ref.pubDate}. PMID: ${ref.pmid}${ref.doi ? `. DOI: ${ref.doi}` : ''}`,
          )
          .join('\n');

  return `# ${outline.title}

## Abstract

${outline.abstract}

${body}

## References

${referenceText}
`;
}

export async function reviewManuscript(manuscript: string): Promise<ReviewResult> {
  const text = await askModel(
    'You are Reviewer #2 for a scientific journal. Be rigorous but constructive. Return strict JSON only.',
    `Review this manuscript draft.

${manuscript}

Return JSON:
{
  "summary": "overall assessment",
  "decision": "accept|minor_revision|major_revision|reject",
  "findings": [
    {
      "severity": "major|moderate|minor",
      "category": "logic|evidence|methods|results|writing|structure|ethics|other",
      "location": "section or sentence",
      "comment": "problem",
      "recommendation": "specific fix"
    }
  ]
}`,
  );
  return parseJson<ReviewResult>(text);
}

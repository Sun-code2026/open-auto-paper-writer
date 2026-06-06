# MSCSL Research Paper Writer

Research Paper Writer is a React/Vite web app that turns research notes, hypotheses, and data summaries into a journal-style manuscript draft. It uses OpenAI's ChatGPT API for outline, section drafting, PubMed-grounded citation rewriting, and reviewer-style critique.

## Pipeline

1. Generate a structured outline from research content and keywords.
2. Draft each manuscript section with citation placeholders.
3. Search PubMed through NCBI E-utilities, fetch real PMID metadata and abstracts, and rewrite claims using only retrieved articles.
4. Run a reviewer agent that flags logic gaps, evidence weakness, structure issues, and readability problems.

## Safety Features

- PubMed failures return empty results instead of fabricated citations.
- Browser XML parsing includes a conservative regex fallback.
- Model-returned PMIDs are accepted only when they match retrieved PubMed records.
- If no PubMed evidence is found, the original section draft is preserved.
- The final references section is deduplicated from actually used references.

## Local Setup

```bash
npm install
npm run dev
```

Open the local Vite URL, enter an OpenAI API key beginning with `sk-`, then follow the four workflow steps.

## Notes

The API key is stored only in browser `localStorage`. Because this is a browser app, use a restricted key and do not deploy it for untrusted public users without adding a server-side proxy.

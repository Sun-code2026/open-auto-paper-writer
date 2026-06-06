import type { PubMedArticle } from '../types';

const BASE_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
const TOOL = 'mitos_paper_writer';
const EMAIL = 'insulin2021@gmail.com';

const withNcbiParams = (params: Record<string, string>) => {
  const search = new URLSearchParams({
    tool: TOOL,
    email: EMAIL,
    retmode: 'json',
    ...params,
  });
  return search.toString();
};

const textFromXml = (xml: string, tag: string) => {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return decodeHtml(match?.[1]?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() ?? '');
};

const decodeHtml = (value: string) => {
  const textarea = typeof document !== 'undefined' ? document.createElement('textarea') : null;
  if (!textarea) {
    return value
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }
  textarea.innerHTML = value;
  return textarea.value;
};

export async function searchPubMed(query: string, maxResults = 8): Promise<string[]> {
  try {
    const url = `${BASE_URL}/esearch.fcgi?${withNcbiParams({
      db: 'pubmed',
      term: query,
      retmax: String(maxResults),
      sort: 'relevance',
    })}`;
    const response = await fetch(url);
    if (!response.ok) return [];
    const data = await response.json();
    return data?.esearchresult?.idlist ?? [];
  } catch {
    return [];
  }
}

async function getSummaries(pmids: string[]) {
  if (pmids.length === 0) return new Map<string, Partial<PubMedArticle>>();
  try {
    const url = `${BASE_URL}/esummary.fcgi?${withNcbiParams({
      db: 'pubmed',
      id: pmids.join(','),
    })}`;
    const response = await fetch(url);
    if (!response.ok) return new Map<string, Partial<PubMedArticle>>();
    const data = await response.json();
    const result = new Map<string, Partial<PubMedArticle>>();
    for (const pmid of data?.result?.uids ?? []) {
      const item = data.result[pmid];
      const doi = item?.articleids?.find((entry: { idtype: string; value: string }) => entry.idtype === 'doi')?.value;
      result.set(pmid, {
        pmid,
        title: item?.title ?? `PMID ${pmid}`,
        journal: item?.fulljournalname ?? item?.source ?? '',
        pubDate: item?.pubdate ?? '',
        doi,
        url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
      });
    }
    return result;
  } catch {
    return new Map<string, Partial<PubMedArticle>>();
  }
}

async function getAbstracts(pmids: string[]) {
  if (pmids.length === 0) return new Map<string, string>();
  try {
    const search = new URLSearchParams({
      tool: TOOL,
      email: EMAIL,
      db: 'pubmed',
      id: pmids.join(','),
      retmode: 'xml',
    });
    const response = await fetch(`${BASE_URL}/efetch.fcgi?${search.toString()}`);
    if (!response.ok) return new Map<string, string>();
    const xml = await response.text();
    const abstracts = new Map<string, string>();

    if (typeof DOMParser !== 'undefined') {
      const doc = new DOMParser().parseFromString(xml, 'text/xml');
      doc.querySelectorAll('PubmedArticle').forEach((article) => {
        const pmid = article.querySelector('PMID')?.textContent?.trim();
        const abstractText = Array.from(article.querySelectorAll('AbstractText'))
          .map((node) => node.textContent?.trim())
          .filter(Boolean)
          .join(' ');
        if (pmid) abstracts.set(pmid, abstractText);
      });
      return abstracts;
    }

    for (const block of xml.match(/<PubmedArticle>[\s\S]*?<\/PubmedArticle>/g) ?? []) {
      const pmid = textFromXml(block, 'PMID');
      const abstractText = (block.match(/<AbstractText[^>]*>[\s\S]*?<\/AbstractText>/g) ?? [])
        .map((part) => part.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
        .map(decodeHtml)
        .join(' ');
      if (pmid) abstracts.set(pmid, abstractText);
    }
    return abstracts;
  } catch {
    return new Map<string, string>();
  }
}

export async function searchPubMedBundle(query: string, maxResults = 8): Promise<PubMedArticle[]> {
  const pmids = await searchPubMed(query, maxResults);
  const [summaries, abstracts] = await Promise.all([getSummaries(pmids), getAbstracts(pmids)]);

  const articles: PubMedArticle[] = [];
  for (const pmid of pmids) {
    const summary = summaries.get(pmid);
    if (!summary) continue;
    articles.push({
      pmid,
      title: summary.title ?? `PMID ${pmid}`,
      journal: summary.journal ?? '',
      pubDate: summary.pubDate ?? '',
      doi: summary.doi,
      abstractText: abstracts.get(pmid) ?? '',
      url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
    });
  }
  return articles;
}

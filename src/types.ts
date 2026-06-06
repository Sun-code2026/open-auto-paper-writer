export type ManuscriptSection = {
  id: string;
  title: string;
  purpose: string;
  targetWords?: number;
};

export type PaperOutline = {
  title: string;
  abstract: string;
  keywords: string[];
  sections: ManuscriptSection[];
  visualizationSuggestions: string[];
};

export type SectionDraft = {
  sectionId: string;
  title: string;
  content: string;
};

export type PubMedArticle = {
  pmid: string;
  title: string;
  journal: string;
  pubDate: string;
  doi?: string;
  abstractText: string;
  url: string;
};

export type CitationNeed = {
  placeholder: string;
  claim: string;
  evidenceType: string;
  query: string;
};

export type UsedReference = {
  pmid: string;
  title: string;
  journal: string;
  pubDate: string;
  doi?: string;
};

export type CitationEnhancement = {
  sectionId: string;
  title: string;
  enhancedContent: string;
  citationNeeds: CitationNeed[];
  foundArticles: PubMedArticle[];
  references: UsedReference[];
};

export type ReviewFinding = {
  severity: 'major' | 'moderate' | 'minor';
  category: string;
  location: string;
  comment: string;
  recommendation: string;
};

export type ReviewResult = {
  summary: string;
  decision: 'accept' | 'minor_revision' | 'major_revision' | 'reject';
  findings: ReviewFinding[];
};

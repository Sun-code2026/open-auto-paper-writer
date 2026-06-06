import { useMemo, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  Clipboard,
  Download,
  ExternalLink,
  FileText,
  KeyRound,
  Loader2,
  Search,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import type { CitationEnhancement, PaperOutline, ReviewResult, SectionDraft } from './types';
import {
  buildFinalManuscript,
  draftSection,
  enhanceSectionWithPubMed,
  generateOutline,
  reviewManuscript,
} from './services/paperService';

const API_KEY_STORAGE = 'mscsl.openaiApiKey';

type StepState = 'idle' | 'running' | 'done' | 'error';

export function PaperWriter() {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(API_KEY_STORAGE) ?? '');
  const [researchContent, setResearchContent] = useState('');
  const [keywords, setKeywords] = useState('');
  const [outline, setOutline] = useState<PaperOutline | null>(null);
  const [drafts, setDrafts] = useState<SectionDraft[]>([]);
  const [enhancements, setEnhancements] = useState<CitationEnhancement[]>([]);
  const [review, setReview] = useState<ReviewResult | null>(null);
  const [status, setStatus] = useState<Record<string, StepState>>({});
  const [message, setMessage] = useState('');

  const finalManuscript = useMemo(() => {
    if (!outline || enhancements.length === 0) return '';
    return buildFinalManuscript(outline, enhancements);
  }, [outline, enhancements]);

  const validKey = apiKey.startsWith('sk-');
  const canStart = validKey && researchContent.trim().length > 40 && keywords.trim().length > 2;

  const saveApiKey = (value: string) => {
    setApiKey(value);
    if (value) localStorage.setItem(API_KEY_STORAGE, value);
    else localStorage.removeItem(API_KEY_STORAGE);
  };

  const runStep = async (key: string, task: () => Promise<void>) => {
    setStatus((current) => ({ ...current, [key]: 'running' }));
    setMessage('');
    try {
      await task();
      setStatus((current) => ({ ...current, [key]: 'done' }));
    } catch (error) {
      setStatus((current) => ({ ...current, [key]: 'error' }));
      setMessage(error instanceof Error ? error.message : '작업 중 오류가 발생했습니다.');
    }
  };

  const handleOutline = () =>
    runStep('outline', async () => {
      const nextOutline = await generateOutline(apiKey, researchContent, keywords);
      setOutline(nextOutline);
      setDrafts([]);
      setEnhancements([]);
      setReview(null);
    });

  const handleDrafts = () =>
    outline &&
    runStep('drafts', async () => {
      const nextDrafts: SectionDraft[] = [];
      for (const section of outline.sections) {
        setMessage(`${section.title} 섹션 작성 중...`);
        nextDrafts.push(await draftSection(apiKey, outline, section, researchContent));
        setDrafts([...nextDrafts]);
      }
      setEnhancements([]);
      setReview(null);
      setMessage('');
    });

  const handleEnhance = () =>
    runStep('enhance', async () => {
      const nextEnhancements: CitationEnhancement[] = [];
      for (const draft of drafts) {
        setMessage(`${draft.title} PubMed 근거 검색 및 재작성 중...`);
        nextEnhancements.push(await enhanceSectionWithPubMed(apiKey, draft, keywords));
        setEnhancements([...nextEnhancements]);
      }
      setReview(null);
      setMessage('');
    });

  const handleReview = () =>
    finalManuscript &&
    runStep('review', async () => {
      setReview(await reviewManuscript(apiKey, finalManuscript));
    });

  const copyFinal = async () => {
    await navigator.clipboard.writeText(finalManuscript);
    setMessage('최종 논문 초안을 클립보드에 복사했습니다.');
  };

  const downloadFinal = () => {
    const blob = new Blob([finalManuscript], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'research-paper-draft.md';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main>
      <header className="appHeader">
        <div>
          <p className="eyebrow">MSCSL Research Paper Writer</p>
          <h1>연구결과를 PubMed 근거 기반 논문 초안으로 변환</h1>
        </div>
        <div className="statusPill">
          <ShieldCheck size={18} />
          실제 PMID 검증
        </div>
      </header>

      <section className="workspace">
        <aside className="leftPanel">
          <PanelTitle icon={<KeyRound size={18} />} title="API Key" />
          <input
            type="password"
            value={apiKey}
            onChange={(event) => saveApiKey(event.target.value)}
            placeholder="sk-..."
            aria-label="OpenAI API Key"
          />
          <a className="inlineLink" href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">
            OpenAI API Keys <ExternalLink size={14} />
          </a>

          <PanelTitle icon={<FileText size={18} />} title="연구 내용" />
          <textarea
            value={researchContent}
            onChange={(event) => setResearchContent(event.target.value)}
            placeholder="연구 데이터, 가설, 주요 결과, 대상군, 방법, 통계 결과를 입력하세요."
          />

          <PanelTitle icon={<Search size={18} />} title="핵심 키워드" />
          <input
            value={keywords}
            onChange={(event) => setKeywords(event.target.value)}
            placeholder="mitochondria, insulin resistance, skeletal muscle"
          />

          {message && <div className="message">{message}</div>}
          {!validKey && apiKey && <div className="warning">OpenAI API 키는 sk-로 시작해야 합니다.</div>}
        </aside>

        <section className="mainPanel">
          <div className="stepGrid">
            <StepCard
              number="1"
              title="아웃라인 생성"
              description="제목, 초록, 섹션 구성, 그림/표 제안을 JSON 기반으로 생성합니다."
              state={status.outline}
              disabled={!canStart || status.outline === 'running'}
              onClick={handleOutline}
            />
            <StepCard
              number="2"
              title="섹션별 초안 작성"
              description="[Ref] 표시가 포함된 저널 문체의 섹션 초안을 작성합니다."
              state={status.drafts}
              disabled={!outline || status.drafts === 'running'}
              onClick={handleDrafts}
            />
            <StepCard
              number="3"
              title="PubMed 근거 보강"
              description="NCBI E-utilities로 실제 문헌을 가져와 [PMID:xxxx] 인용을 붙입니다."
              state={status.enhance}
              disabled={drafts.length === 0 || status.enhance === 'running'}
              onClick={handleEnhance}
            />
            <StepCard
              number="4"
              title="리뷰 에이전트"
              description="Reviewer #2 스타일로 논리, 근거, 구조, 가독성을 점검합니다."
              state={status.review}
              disabled={!finalManuscript || status.review === 'running'}
              onClick={handleReview}
            />
          </div>

          {message && <div className="runBanner"><Loader2 size={16} className="spin" />{message}</div>}

          {outline && (
            <section className="outputBlock">
              <PanelTitle icon={<BookOpen size={18} />} title="아웃라인" />
              <h2>{outline.title}</h2>
              <p>{outline.abstract}</p>
              <div className="tagRow">{outline.keywords.map((keyword) => <span key={keyword}>{keyword}</span>)}</div>
              <div className="sectionList">
                {outline.sections.map((section) => (
                  <article key={section.id}>
                    <strong>{section.title}</strong>
                    <p>{section.purpose}</p>
                  </article>
                ))}
              </div>
            </section>
          )}

          {drafts.length > 0 && (
            <section className="outputBlock">
              <PanelTitle icon={<Sparkles size={18} />} title="섹션 초안" />
              {drafts.map((draft) => (
                <details key={draft.sectionId} open>
                  <summary>{draft.title}</summary>
                  <p className="monoText">{draft.content}</p>
                </details>
              ))}
            </section>
          )}

          {enhancements.length > 0 && (
            <section className="outputBlock">
              <PanelTitle icon={<ShieldCheck size={18} />} title="PubMed 근거 보강 결과" />
              {enhancements.map((item) => (
                <details key={item.sectionId} open>
                  <summary>
                    {item.title} · 인용 {item.citationNeeds.length}개 · 참고문헌 {item.references.length}개
                  </summary>
                  <div className="citationGrid">
                    {item.citationNeeds.map((need, index) => (
                      <article key={`${need.query}-${index}`}>
                        <strong>{need.evidenceType}</strong>
                        <p>{need.claim}</p>
                        <a
                          href={`https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(need.query)}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {need.query} <ExternalLink size={13} />
                        </a>
                      </article>
                    ))}
                  </div>
                  <div className="articlePreview">
                    {item.foundArticles.slice(0, 3).map((article) => (
                      <a key={article.pmid} href={article.url} target="_blank" rel="noreferrer">
                        PMID {article.pmid}: {article.title}
                      </a>
                    ))}
                  </div>
                </details>
              ))}
            </section>
          )}

          {finalManuscript && (
            <section className="outputBlock">
              <div className="blockHeader">
                <PanelTitle icon={<CheckCircle2 size={18} />} title="최종 논문 초안" />
                <div className="buttonRow">
                  <button type="button" className="iconButton" onClick={copyFinal} title="복사">
                    <Clipboard size={17} />
                  </button>
                  <button type="button" className="iconButton" onClick={downloadFinal} title="Markdown 다운로드">
                    <Download size={17} />
                  </button>
                </div>
              </div>
              <pre>{finalManuscript}</pre>
            </section>
          )}

          {review && (
            <section className="outputBlock">
              <PanelTitle icon={<Clipboard size={18} />} title="리뷰 결과" />
              <div className="decision">{review.decision.replace('_', ' ')}</div>
              <p>{review.summary}</p>
              <div className="sectionList">
                {review.findings.map((finding, index) => (
                  <article key={`${finding.location}-${index}`}>
                    <strong>{finding.severity} · {finding.category}</strong>
                    <p>{finding.location}</p>
                    <p>{finding.comment}</p>
                    <p>{finding.recommendation}</p>
                  </article>
                ))}
              </div>
            </section>
          )}
        </section>
      </section>
    </main>
  );
}

function PanelTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="panelTitle">
      {icon}
      <span>{title}</span>
    </div>
  );
}

function StepCard({
  number,
  title,
  description,
  state = 'idle',
  disabled,
  onClick,
}: {
  number: string;
  title: string;
  description: string;
  state?: StepState;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className={`stepCard ${state}`} disabled={disabled} onClick={onClick}>
      <span className="stepNumber">{number}</span>
      <strong>{title}</strong>
      <span>{description}</span>
      <span className="stepState">
        {state === 'running' && <Loader2 size={15} className="spin" />}
        {state === 'done' && <CheckCircle2 size={15} />}
        {state === 'error' ? '오류' : state === 'done' ? '완료' : state === 'running' ? '실행 중' : '대기'}
      </span>
    </button>
  );
}

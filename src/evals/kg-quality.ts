import { pathToFileURL } from 'node:url';
import { extractKnowledgeTriples } from '../indexing/kg-extractor.js';

interface ExpectedTriple {
  subject: string;
  relation: string;
  object: string;
}

interface KgQualityCase {
  name: string;
  content: string;
  subjectHint?: string;
  project?: string;
  topicKey?: string;
  expected: ExpectedTriple[];
  forbidden?: ExpectedTriple[];
}

export interface KgQualityCaseResult {
  name: string;
  expected: number;
  matched: number;
  missing: ExpectedTriple[];
  forbidden: number;
  forbidden_hits: ExpectedTriple[];
  extracted: number;
}

export interface KgQualityEvalReport {
  summary: {
    total_cases: number;
    expected_triples: number;
    matched_expected_triples: number;
    expected_triple_recall: number;
    forbidden_triples: number;
    forbidden_hits: number;
    forbidden_triple_rate: number;
  };
  cases: KgQualityCaseResult[];
  markdown: string;
}

const CASES: KgQualityCase[] = [
  {
    name: 'passive relation direction',
    content: [
      'Payments service is owned by Platform team.',
      'Checkout deploy is blocked by failing smoke tests.',
      'Login regression was fixed by token refresh patch.',
      'Outage was caused by expired oauth token.',
    ].join(' '),
    expected: [
      { subject: 'platform team', relation: 'OWNS', object: 'payments service' },
      { subject: 'failing smoke tests', relation: 'BLOCKS', object: 'checkout deploy' },
      { subject: 'token refresh patch', relation: 'FIXES', object: 'login regression' },
      { subject: 'expired oauth token', relation: 'CAUSES', object: 'outage' },
    ],
    forbidden: [
      { subject: 'payments service', relation: 'OWNS', object: 'platform team' },
      { subject: 'checkout deploy', relation: 'BLOCKS', object: 'failing smoke tests' },
    ],
  },
  {
    name: 'explicit graph notation',
    content: [
      'Auth service --DEPENDS_ON--> Redis cache',
      'Worker queue -[RUNS_IN]-> us-east-1',
      'Cache layer --INVALID_EDGE--> Redis',
    ].join('\n'),
    expected: [
      { subject: 'auth service', relation: 'DEPENDS_ON', object: 'redis cache' },
      { subject: 'worker queue', relation: 'RUNS_IN', object: 'us-east-1' },
    ],
    forbidden: [
      { subject: 'cache layer', relation: 'INVALID_EDGE', object: 'redis' },
    ],
  },
  {
    name: 'structured sro block',
    content: [
      'Subject: ArcRift retrieval engine',
      'Relation: DEPENDS_ON',
      'Object: sentence vector index',
      '',
      '- subject: Memory sync pipeline',
      '- relation: IMPLEMENTS',
      '- object: portable backup chunks',
    ].join('\n'),
    expected: [
      { subject: 'arcrift retrieval engine', relation: 'DEPENDS_ON', object: 'sentence vector index' },
      { subject: 'memory sync pipeline', relation: 'IMPLEMENTS', object: 'portable backup chunks' },
    ],
  },
  {
    name: 'dependency architecture prose',
    content: [
      'Search API requires vector index readiness.',
      'Cache layer is backed by Redis cluster.',
    ].join(' '),
    expected: [
      { subject: 'search api', relation: 'DEPENDS_ON', object: 'vector index readiness' },
      { subject: 'cache layer', relation: 'DEPENDS_ON', object: 'redis cluster' },
    ],
  },
  {
    name: 'structured sections and references',
    subjectHint: 'Background indexing',
    project: 'memory-project',
    topicKey: 'retrieval/background-indexing',
    content: [
      '**What**: Background indexing enqueues sentence jobs.',
      '**Why**: Save should not block the UI.',
      '**Where**: src/indexing/jobs.ts',
    ].join('\n'),
    expected: [
      { subject: 'background indexing', relation: 'BELONGS_TO', object: 'memory-project' },
      { subject: 'background indexing', relation: 'HAS_TOPIC', object: 'retrieval/background-indexing' },
      { subject: 'background indexing', relation: 'HAS_WHAT', object: 'background indexing enqueues sentence jobs.' },
      { subject: 'background indexing', relation: 'REFERENCES', object: 'src/indexing/jobs.ts' },
    ],
  },
];

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function tripleKey(triple: ExpectedTriple): string {
  return `${normalize(triple.subject)}|${triple.relation.toUpperCase()}|${normalize(triple.object)}`;
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : Number((numerator / denominator).toFixed(3));
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatTriple(triple: ExpectedTriple): string {
  return `${triple.subject} ${triple.relation} ${triple.object}`;
}

function formatMarkdown(report: Omit<KgQualityEvalReport, 'markdown'>): string {
  const rows = report.cases.map((result) => [
    result.missing.length === 0 && result.forbidden_hits.length === 0 ? 'PASS' : 'CHECK',
    result.name,
    `${result.matched}/${result.expected}`,
    result.forbidden_hits.length,
    result.extracted,
    result.missing.map(formatTriple).join('; ') || '-',
  ]);

  return [
    '# KG Quality Eval',
    '',
    'Deterministic quality gate for extracted subject-relation-object triples, passive direction handling, structured SRO blocks, and forbidden relation safety.',
    '',
    '## Summary',
    '',
    '| Metric | Value |',
    '| --- | ---: |',
    `| Total cases | ${report.summary.total_cases} |`,
    `| Expected triples | ${report.summary.expected_triples} |`,
    `| Matched expected triples | ${report.summary.matched_expected_triples} |`,
    `| Expected Triple Recall | ${formatPercent(report.summary.expected_triple_recall)} |`,
    `| Forbidden triples | ${report.summary.forbidden_triples} |`,
    `| Forbidden hits | ${report.summary.forbidden_hits} |`,
    `| Forbidden Triple Rate | ${formatPercent(report.summary.forbidden_triple_rate)} |`,
    '',
    '## Case Results',
    '',
    '| Status | Case | Expected Matched | Forbidden Hits | Extracted | Missing |',
    '| --- | --- | ---: | ---: | ---: | --- |',
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n');
}

export function runKgQualityEval(): KgQualityEvalReport {
  const cases = CASES.map((kgCase) => {
    const extracted = extractKnowledgeTriples({
      content: kgCase.content,
      provenance: `kg-quality://${kgCase.name}`,
      subjectHint: kgCase.subjectHint,
      project: kgCase.project,
      topicKey: kgCase.topicKey,
    }).triples;
    const extractedKeys = new Set(extracted.map((triple) => tripleKey(triple)));
    const missing = kgCase.expected.filter((triple) => !extractedKeys.has(tripleKey(triple)));
    const forbiddenHits = (kgCase.forbidden ?? []).filter((triple) => extractedKeys.has(tripleKey(triple)));

    return {
      name: kgCase.name,
      expected: kgCase.expected.length,
      matched: kgCase.expected.length - missing.length,
      missing,
      forbidden: kgCase.forbidden?.length ?? 0,
      forbidden_hits: forbiddenHits,
      extracted: extracted.length,
    };
  });

  const expectedTriples = cases.reduce((sum, result) => sum + result.expected, 0);
  const matchedExpectedTriples = cases.reduce((sum, result) => sum + result.matched, 0);
  const forbiddenTriples = cases.reduce((sum, result) => sum + result.forbidden, 0);
  const forbiddenHits = cases.reduce((sum, result) => sum + result.forbidden_hits.length, 0);
  const report = {
    summary: {
      total_cases: cases.length,
      expected_triples: expectedTriples,
      matched_expected_triples: matchedExpectedTriples,
      expected_triple_recall: ratio(matchedExpectedTriples, expectedTriples),
      forbidden_triples: forbiddenTriples,
      forbidden_hits: forbiddenHits,
      forbidden_triple_rate: ratio(forbiddenHits, forbiddenTriples),
    },
    cases,
  };

  return {
    ...report,
    markdown: formatMarkdown(report),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = runKgQualityEval();
  process.stdout.write(`${report.markdown}\n`);
}

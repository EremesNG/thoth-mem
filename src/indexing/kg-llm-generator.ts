import type { KgLlmConfig } from '../config.js';
import { resolveLocalHydePipelineOptions } from '../retrieval/hyde-generator.js';
import { KG_RELATION_TYPES } from './kg-extractor.js';

const KG_RELATION_TYPE_SET = new Set<string>(KG_RELATION_TYPES);
type PipelineModule = typeof import('@huggingface/transformers');
type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};
type TextGenerationOutput = Array<{
  generated_text?: string | ChatMessage[];
}>;
type TextGenerationPipeline = (
  input: string | ChatMessage[],
  options: {
    max_new_tokens: number;
    do_sample: boolean;
    temperature?: number;
  },
) => Promise<TextGenerationOutput>;

let cachedPipelineModule: Promise<PipelineModule> | null = null;

async function loadTransformersModule(): Promise<PipelineModule> {
  if (!cachedPipelineModule) {
    cachedPipelineModule = import('@huggingface/transformers');
  }

  return cachedPipelineModule;
}

export interface KgLlmTripleDraft {
  subject: string;
  relation: string;
  object: string;
  confidence?: number;
}

export interface KgLlmExtractionInput {
  content: string;
  provenance: string;
  project?: string | null;
  topicKey?: string | null;
}

export interface KgLlmExtractor {
  extract(input: KgLlmExtractionInput): Promise<KgLlmTripleDraft[]>;
}

function normalizeEntity(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/^[\s"'`([{]+/, '')
    .replace(/[\s"'`)\]}.;,!?]+$/g, '')
    .replace(/\s+/g, ' ');
  if (normalized.length === 0) {
    return null;
  }

  return normalized.slice(0, 160);
}

function normalizeRelation(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toUpperCase().replace(/[\s-]+/g, '_');
  return KG_RELATION_TYPE_SET.has(normalized) ? normalized : null;
}

function normalizeConfidence(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0.86;
  }

  return Math.max(0.4, Math.min(0.99, value));
}

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

function chatCompletionsUrl(baseUrl: string): string {
  const normalized = normalizeBaseUrl(baseUrl);
  return normalized.endsWith('/v1')
    ? `${normalized}/chat/completions`
    : `${normalized}/v1/chat/completions`;
}

function ollamaGenerateUrl(baseUrl: string): string {
  return `${normalizeBaseUrl(baseUrl)}/api/generate`;
}

function trimContentForPrompt(content: string): string {
  if (content.length <= 24_000) {
    return content;
  }

  const head = content.slice(0, 12_000);
  const tail = content.slice(-12_000);
  return `${head}\n\n[...middle omitted for KG extraction budget...]\n\n${tail}`;
}

function systemPrompt(): string {
  return [
    'Extract high-signal knowledge graph triples from the conversation.',
    'Return JSON only, shaped as {"triples":[{"subject":"...","relation":"DEPENDS_ON","object":"...","confidence":0.86}]}',
    `Allowed relations: ${KG_RELATION_TYPES.join(', ')}.`,
    'Use concise canonical entity names. Omit uncertain, duplicate, secret, credential, or private values.',
  ].join('\n');
}

export function buildKgLlmPrompt(input: KgLlmExtractionInput): string {
  const scope = [
    input.project ? `Project: ${input.project}` : null,
    input.topicKey ? `Topic: ${input.topicKey}` : null,
    `Provenance: ${input.provenance}`,
  ].filter(Boolean).join('\n');

  return `${scope}\n\nConversation:\n${trimContentForPrompt(input.content)}`;
}

async function fetchJson(url: string, body: unknown, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`KG LLM request failed: HTTP ${response.status}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function stripCodeFence(content: string): string {
  return content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function findJsonPayload(content: string): unknown {
  const stripped = stripCodeFence(content);
  try {
    return JSON.parse(stripped);
  } catch {
    const arrayStart = stripped.indexOf('[');
    const arrayEnd = stripped.lastIndexOf(']');
    if (arrayStart >= 0 && arrayEnd > arrayStart) {
      return JSON.parse(stripped.slice(arrayStart, arrayEnd + 1));
    }

    const objectStart = stripped.indexOf('{');
    const objectEnd = stripped.lastIndexOf('}');
    if (objectStart >= 0 && objectEnd > objectStart) {
      return JSON.parse(stripped.slice(objectStart, objectEnd + 1));
    }

    throw new Error('KG LLM response did not contain JSON');
  }
}

function triplesFromJson(payload: unknown): KgLlmTripleDraft[] {
  const candidates = Array.isArray(payload)
    ? payload
    : payload && typeof payload === 'object' && Array.isArray((payload as { triples?: unknown }).triples)
      ? (payload as { triples: unknown[] }).triples
      : [];
  const triples: KgLlmTripleDraft[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') {
      continue;
    }

    const record = candidate as Record<string, unknown>;
    const subject = normalizeEntity(record.subject);
    const relation = normalizeRelation(record.relation);
    const object = normalizeEntity(record.object);
    if (!subject || !relation || !object || subject === object) {
      continue;
    }

    const key = `${subject}|${relation}|${object}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    triples.push({
      subject,
      relation,
      object,
      confidence: normalizeConfidence(record.confidence),
    });
  }

  return triples.slice(0, 40);
}

function extractTextFromRemoteResponse(response: unknown): string {
  if (!response || typeof response !== 'object') {
    throw new Error('KG LLM response was empty');
  }

  const record = response as Record<string, unknown>;
  if (typeof record.response === 'string') {
    return record.response;
  }

  const choices = record.choices;
  if (Array.isArray(choices)) {
    const first = choices[0] as Record<string, unknown> | undefined;
    const message = first?.message as Record<string, unknown> | undefined;
    if (typeof message?.content === 'string') {
      return message.content;
    }
    if (typeof first?.text === 'string') {
      return first.text;
    }
  }

  throw new Error('KG LLM response did not include text content');
}

function extractGeneratedText(output: TextGenerationOutput): string {
  const generated = output[0]?.generated_text;
  if (typeof generated === 'string') {
    return generated.trim();
  }

  if (Array.isArray(generated)) {
    const assistant = [...generated].reverse().find((message) => message.role === 'assistant');
    return (assistant?.content ?? generated.at(-1)?.content ?? '').trim();
  }

  return '';
}

class LocalTransformersKgLlmExtractor implements KgLlmExtractor {
  private pipelinePromise: Promise<TextGenerationPipeline> | null = null;

  constructor(private readonly config: KgLlmConfig) {
    if (config.provider !== 'transformers_local') {
      throw new Error(`LocalTransformersKgLlmExtractor requires provider "transformers_local", got "${config.provider}".`);
    }
  }

  private async getPipeline(): Promise<TextGenerationPipeline> {
    if (!this.pipelinePromise) {
      this.pipelinePromise = (async () => {
        const transformers = await loadTransformersModule();
        const pipe = await transformers.pipeline(
          'text-generation',
          this.config.model,
          resolveLocalHydePipelineOptions(this.config.model),
        );
        return pipe as TextGenerationPipeline;
      })();
    }

    return this.pipelinePromise;
  }

  async extract(input: KgLlmExtractionInput): Promise<KgLlmTripleDraft[]> {
    const generator = await this.getPipeline();
    const output = await generator(
      [
        { role: 'system', content: systemPrompt() },
        { role: 'user', content: buildKgLlmPrompt(input) },
      ],
      {
        max_new_tokens: 1000,
        do_sample: false,
        temperature: 0,
      },
    );
    const text = extractGeneratedText(output);
    if (!text) {
      throw new Error('KG LLM local Transformers response was empty.');
    }

    return triplesFromJson(findJsonPayload(text));
  }
}

class RemoteKgLlmExtractor implements KgLlmExtractor {
  constructor(private readonly config: KgLlmConfig) {}

  async extract(input: KgLlmExtractionInput): Promise<KgLlmTripleDraft[]> {
    if (!this.config.baseUrl) {
      throw new Error(`KG LLM provider "${this.config.provider}" requires a baseUrl.`);
    }

    const prompt = buildKgLlmPrompt(input);
    const response = this.config.provider === 'ollama'
      ? await fetchJson(ollamaGenerateUrl(this.config.baseUrl), {
        model: this.config.model,
        prompt: `${systemPrompt()}\n\n${prompt}`,
        stream: false,
        format: 'json',
        options: { temperature: 0 },
      }, this.config.timeoutMs)
      : await fetchJson(chatCompletionsUrl(this.config.baseUrl), {
        model: this.config.model,
        messages: [
          { role: 'system', content: systemPrompt() },
          { role: 'user', content: prompt },
        ],
        temperature: 0,
        response_format: { type: 'text' },
        max_tokens: 1000,
      }, this.config.timeoutMs);

    return triplesFromJson(findJsonPayload(extractTextFromRemoteResponse(response)));
  }
}

export function createKgLlmExtractor(config: KgLlmConfig | null | undefined): KgLlmExtractor | null {
  if (!config?.enabled) {
    return null;
  }

  if (config.provider === 'transformers_local') {
    return new LocalTransformersKgLlmExtractor(config);
  }

  return new RemoteKgLlmExtractor(config);
}

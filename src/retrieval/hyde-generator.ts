import type { HydeConfig } from '../config.js';
import type { HydeGenerator } from './hyde.js';

type PipelineModule = typeof import('@huggingface/transformers');
type PipelineOptions = NonNullable<Parameters<PipelineModule['pipeline']>[2]>;

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

export function buildHydePrompt(query: string): string {
  return [
    'Generate a 1-sentence hypothetical answer for vector search.',
    'Return only the answer sentence. Do not explain.',
    '',
    `User query: ${query}`,
  ].join('\n');
}

export function resolveLocalHydePipelineOptions(model: string): PipelineOptions {
  const normalized = model.toLowerCase();
  if (normalized.includes('qwen2.5-coder-0.5b') || normalized.includes('qwen2.5-0.5b')) {
    return { dtype: 'q4' };
  }

  return {};
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

function chatCompletionsUrl(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/+$/, '');
  return normalized.endsWith('/v1')
    ? `${normalized}/chat/completions`
    : `${normalized}/v1/chat/completions`;
}

async function fetchJson(url: string, body: unknown, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`HyDE provider request failed (${response.status}): ${text || response.statusText}`);
    }

    return response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

export class LocalTransformersHydeGenerator implements HydeGenerator {
  public readonly config: HydeConfig;
  private pipelinePromise: Promise<TextGenerationPipeline> | null = null;

  constructor(config: HydeConfig) {
    if (config.provider !== 'transformers_local') {
      throw new Error(`LocalTransformersHydeGenerator requires provider "transformers_local", got "${config.provider}".`);
    }

    if (!config.model) {
      throw new Error('LocalTransformersHydeGenerator requires a model.');
    }

    this.config = config;
  }

  private async getPipeline(): Promise<TextGenerationPipeline> {
    if (!this.pipelinePromise) {
      this.pipelinePromise = (async () => {
        const transformers = await loadTransformersModule();
        const pipe = await transformers.pipeline(
          'text-generation',
          this.config.model!,
          resolveLocalHydePipelineOptions(this.config.model!),
        );
        return pipe as TextGenerationPipeline;
      })();
    }

    return this.pipelinePromise;
  }

  async generate(input: { query: string }): Promise<string> {
    const generator = await this.getPipeline();
    const output = await generator(
      [
        { role: 'system', content: 'You write compact retrieval hints for semantic search.' },
        { role: 'user', content: buildHydePrompt(input.query) },
      ],
      {
        max_new_tokens: 100,
        do_sample: false,
        temperature: 0.1,
      },
    );

    const answer = extractGeneratedText(output);
    if (!answer) {
      throw new Error('HyDE model returned an empty answer.');
    }

    return answer;
  }
}

export class RemoteHydeGenerator implements HydeGenerator {
  public readonly config: HydeConfig;

  constructor(config: HydeConfig) {
    if (config.provider !== 'ollama' && config.provider !== 'lmstudio') {
      throw new Error(`RemoteHydeGenerator requires provider "ollama" or "lmstudio", got "${config.provider}".`);
    }

    if (!config.model) {
      throw new Error('RemoteHydeGenerator requires a model.');
    }

    if (!config.baseUrl) {
      throw new Error('RemoteHydeGenerator requires a baseUrl.');
    }

    this.config = config;
  }

  async generate(input: { query: string }): Promise<string> {
    if (this.config.provider === 'ollama') {
      const json = await fetchJson(`${this.config.baseUrl}/api/generate`, {
        model: this.config.model,
        prompt: buildHydePrompt(input.query),
        stream: false,
        options: { num_predict: 100, temperature: 0.1 },
      }, this.config.timeoutMs) as { response?: string };

      const answer = json.response?.trim();
      if (!answer) {
        throw new Error('Ollama HyDE response did not include response text.');
      }

      return answer;
    }

    const baseUrl = this.config.baseUrl;
    if (!baseUrl) {
      throw new Error('RemoteHydeGenerator requires a baseUrl.');
    }

    const json = await fetchJson(chatCompletionsUrl(baseUrl), {
      model: this.config.model,
      messages: [
        { role: 'system', content: 'You write compact retrieval hints for semantic search.' },
        { role: 'user', content: buildHydePrompt(input.query) },
      ],
      max_tokens: 100,
      temperature: 0.1,
      stream: false,
    }, this.config.timeoutMs) as { choices?: Array<{ message?: { content?: string } }> };

    const answer = json.choices?.[0]?.message?.content?.trim();
    if (!answer) {
      throw new Error('OpenAI-compatible HyDE response did not include message content.');
    }

    return answer;
  }
}

export function createHydeGenerator(config: HydeConfig | undefined): HydeGenerator | null {
  if (!config?.enabled) {
    return null;
  }

  if (config.provider === 'transformers_local') {
    return new LocalTransformersHydeGenerator(config);
  }

  return new RemoteHydeGenerator(config);
}

import type { HydeConfig } from '../config.js';

export interface HydeGenerator {
  generate(input: { query: string }): Promise<string>;
}

export interface SemanticInput {
  source: 'raw_query' | 'hyde_answer';
  text: string;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`HyDE generation timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise
      .then((result) => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

export async function prepareHydeSemanticInputs(
  query: string,
  config: HydeConfig,
  generator?: HydeGenerator,
): Promise<{ inputs: SemanticInput[]; degradedReason?: string }> {
  const inputs: SemanticInput[] = [{ source: 'raw_query', text: query }];

  if (!config.enabled || !generator) {
    return { inputs };
  }

  try {
    const answer = await withTimeout(generator.generate({ query }), config.timeoutMs);

    if (answer.trim().length === 0) {
      return { inputs, degradedReason: 'hyde_empty' };
    }

    inputs.push({ source: 'hyde_answer', text: answer });
    return { inputs };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'HyDE generation failed';
    return { inputs, degradedReason: message };
  }
}

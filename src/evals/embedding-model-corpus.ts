export interface EmbeddingBenchmarkDocument {
  id: string;
  title: string;
  text: string;
}

export interface EmbeddingBenchmarkCase {
  id: string;
  query: string;
  expectedDocumentId: string;
}

export interface EmbeddingBenchmarkCorpus {
  version: 1;
  documents: EmbeddingBenchmarkDocument[];
  cases: EmbeddingBenchmarkCase[];
}

export const EMBEDDING_MODEL_CORPUS: EmbeddingBenchmarkCorpus = {
  version: 1,
  documents: [
    {
      id: 'credential-rotation',
      title: 'Credential rotation runbook',
      text: 'Issue a replacement API credential, deploy it, verify traffic, and revoke the previous key only after rollout succeeds.',
    },
    {
      id: 'sqlite-wal-recovery',
      title: 'Recuperación de SQLite WAL',
      text: 'Si el proceso termina durante una escritura, conserva los archivos WAL y SHM, abre la base normalmente y ejecuta un checkpoint después de verificar integridad.',
    },
    {
      id: 'react-effect-cleanup',
      title: 'React subscription cleanup',
      text: 'A useEffect that subscribes to an event source must return a cleanup function that removes the same listener before unmount or dependency changes.',
    },
    {
      id: 'durable-object-coordination',
      title: 'Durable Object coordination',
      text: 'Route every room identifier to one Durable Object instance so serialized storage and alarms coordinate concurrent participants.',
    },
    {
      id: 'typescript-type-guard',
      title: 'TypeScript unknown-value guard',
      text: 'Narrow unknown input with typeof, null checks, Array.isArray, and property validation before returning a typed value; never silence the compiler with any.',
    },
    {
      id: 'git-bisect-regression',
      title: 'Find a regression with git bisect',
      text: 'Mark one known-good commit and one known-bad commit, run git bisect, test each midpoint, then reset when the first bad commit is identified.',
    },
    {
      id: 'embedding-normalization',
      title: 'L2 vector normalization',
      text: 'Compute the square root of the sum of squared components and divide every component by that norm before cosine retrieval; reject a zero vector.',
    },
    {
      id: 'qwen-last-token',
      title: 'Qwen embedding pooling',
      text: 'For Qwen3 embeddings, select the hidden state at the last token whose attention-mask value is one, supporting both left and right padding.',
    },
    {
      id: 'embedding-lineage-rebuild',
      title: 'Semantic index lineage',
      text: 'Hash the provider, model, native dimensions, resolved preprocessing profile version, and normalization flag; enqueue an idempotent rebuild when the hash changes.',
    },
    {
      id: 'semantic-fallback',
      title: 'Semantic retrieval fallback',
      text: 'When an embedding request times out or returns invalid vectors, mark semantic recall degraded and continue lexical and knowledge-graph retrieval.',
    },
    {
      id: 'atomic-json-evidence',
      title: 'Atomic benchmark evidence',
      text: 'Write the complete JSON report to a temporary sibling, rename it atomically to the requested output path, and only then return the gate exit status.',
    },
    {
      id: 'node-stream-backpressure',
      title: 'Node stream backpressure',
      text: 'Stop producing when writable.write returns false and resume only after the drain event to keep memory usage bounded.',
    },
  ],
  cases: [
    {
      id: 'es-rotate-secret',
      query: '¿Cómo cambio una credencial de API sin cortar el servicio?',
      expectedDocumentId: 'credential-rotation',
    },
    {
      id: 'en-sqlite-crash',
      query: 'recover a SQLite database after a crash while WAL files still exist',
      expectedDocumentId: 'sqlite-wal-recovery',
    },
    {
      id: 'code-react-unsubscribe',
      query: 'React code that unsubscribes an event listener when a component unmounts',
      expectedDocumentId: 'react-effect-cleanup',
    },
    {
      id: 'es-single-room-coordinator',
      query: 'necesito serializar los mensajes concurrentes de cada sala en Cloudflare',
      expectedDocumentId: 'durable-object-coordination',
    },
    {
      id: 'code-safe-unknown',
      query: 'TypeScript function to validate unknown JSON without using any',
      expectedDocumentId: 'typescript-type-guard',
    },
    {
      id: 'es-first-bad-commit',
      query: 'encontrar automáticamente el primer commit que introdujo una regresión',
      expectedDocumentId: 'git-bisect-regression',
    },
    {
      id: 'en-unit-cosine-vector',
      query: 'turn an embedding into a unit vector and reject zero magnitude',
      expectedDocumentId: 'embedding-normalization',
    },
    {
      id: 'code-qwen-padding-pool',
      query: 'pool Qwen hidden states correctly when batch sequences have different padding',
      expectedDocumentId: 'qwen-last-token',
    },
    {
      id: 'es-rebuild-profile-change',
      query: 'reconstruir los vectores cuando cambia el preprocesamiento aunque el modelo sea igual',
      expectedDocumentId: 'embedding-lineage-rebuild',
    },
    {
      id: 'en-embedding-timeout',
      query: 'semantic provider is offline but memory recall must still return keyword and graph matches',
      expectedDocumentId: 'semantic-fallback',
    },
  ],
};

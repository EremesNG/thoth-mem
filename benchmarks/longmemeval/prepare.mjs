import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { inspectDataset, LONGMEMEVAL_SOURCE } from './contract.mjs';

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_LONGMEMEVAL_CACHE = resolve(moduleDirectory, '..', '.cache', 'longmemeval');

function receiptFrom(source, inspection) {
  return {
    schema: 'thoth-mem.longmemeval-preparation.v1',
    prepared_at: new Date().toISOString(),
    source,
    sha256: inspection.sha256,
    record_count: inspection.recordCount,
    eligible_count: inspection.eligibleCount,
    excluded_count: inspection.exclusions.length,
    corpus_hash: inspection.corpusHash,
    query_hash: inspection.queryHash,
  };
}

export async function prepareLongMemEval(options = {}) {
  const source = options.source ?? LONGMEMEVAL_SOURCE;
  const cacheDirectory = resolve(options.cacheDirectory ?? DEFAULT_LONGMEMEVAL_CACHE);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('A fetch implementation is required for LongMemEval preparation');
  mkdirSync(cacheDirectory, { recursive: true });
  const datasetPath = join(cacheDirectory, source.filename);
  const receiptPath = join(cacheDirectory, 'prepared.json');

  if (existsSync(datasetPath) || existsSync(receiptPath)) {
    if (!existsSync(datasetPath) || !existsSync(receiptPath)) throw new Error('LongMemEval cache is incomplete; remove the bounded cache before retrying');
    const inspection = await inspectDataset(datasetPath, { expectedSha256: source.sha256 });
    const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
    if (receipt?.sha256 !== inspection.sha256 || receipt?.source?.revision !== source.revision) throw new Error('LongMemEval preparation receipt does not match the cached dataset');
    return { datasetPath, receiptPath, receipt };
  }

  const suffix = `${process.pid}-${randomUUID()}`;
  const temporaryDataset = join(cacheDirectory, `.${source.filename}.${suffix}.tmp`);
  const temporaryReceipt = join(cacheDirectory, `.prepared.${suffix}.tmp`);
  let datasetPublished = false;
  try {
    const response = await fetchImpl(source.url, { redirect: 'follow' });
    if (!response?.ok || !response.body) throw new Error(`LongMemEval download failed with HTTP ${response?.status ?? 'unknown'}`);
    const digest = createHash('sha256');
    const hashingStream = new Transform({
      transform(chunk, _encoding, callback) {
        digest.update(chunk);
        callback(null, chunk);
      },
    });
    await pipeline(response.body, hashingStream, createWriteStream(temporaryDataset, { flags: 'wx' }));
    const receivedSha256 = digest.digest('hex');
    if (receivedSha256 !== source.sha256) throw new Error(`LongMemEval dataset SHA-256 mismatch: expected ${source.sha256}, received ${receivedSha256}`);
    if (Number.isInteger(source.bytes) && statSync(temporaryDataset).size !== source.bytes) throw new Error('LongMemEval dataset byte size mismatch');
    const inspection = await inspectDataset(temporaryDataset, { expectedSha256: source.sha256 });
    const receipt = receiptFrom(source, inspection);
    writeFileSync(temporaryReceipt, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
    renameSync(temporaryDataset, datasetPath);
    datasetPublished = true;
    renameSync(temporaryReceipt, receiptPath);
    return { datasetPath, receiptPath, receipt };
  } catch (error) {
    rmSync(temporaryDataset, { force: true });
    rmSync(temporaryReceipt, { force: true });
    if (datasetPublished) rmSync(datasetPath, { force: true });
    rmSync(receiptPath, { force: true });
    throw error;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  if (process.argv.length > 2) throw new Error('LongMemEval preparation does not accept source overrides');
  const result = await prepareLongMemEval();
  process.stdout.write(`${result.datasetPath}\n`);
}

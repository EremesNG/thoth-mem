import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { StringDecoder } from 'node:string_decoder';

const revision = '98d7416c24c778c2fee6e6f3006e7a073259d48f';
export const LONGMEMEVAL_SOURCE = Object.freeze({
  dataset: 'xiaowu0162/longmemeval-cleaned',
  filename: 'longmemeval_s_cleaned.json',
  revision,
  sha256: 'd6f21ea9d60a0d56f34a05b609c79c88a451d2ae03597821ea3d5a9678c3a442',
  bytes: 277_383_467,
  license: 'MIT',
  url: `https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/${revision}/longmemeval_s_cleaned.json`,
});

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value;
}

function nonEmptyString(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be a nonempty string`);
  return value;
}

function string(value, label) {
  if (typeof value !== 'string') throw new Error(`${label} must be a string`);
  return value;
}

function stringArray(value, label) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim())) throw new Error(`${label} must contain nonempty strings`);
  return value;
}

function isAbstention(record) {
  return record.question_id.endsWith('_abs') || record.question_type.endsWith('_abs');
}

export async function* streamJsonArray(readable) {
  const decoder = new StringDecoder('utf8');
  let started = false;
  let ended = false;
  let collecting = false;
  let depth = 0;
  let inString = false;
  let escaped = false;
  let buffer = '';
  let position = 'valueOrEnd';

  const consume = function* (text) {
    for (const character of text) {
      if (ended) {
        if (!/\s/u.test(character)) throw new Error('Unexpected content after the top-level JSON array');
        continue;
      }
      if (!started) {
        if (/\s/u.test(character)) continue;
        if (character !== '[') throw new Error('LongMemEval dataset must be a top-level JSON array');
        started = true;
        continue;
      }
      if (!collecting) {
        if (/\s/u.test(character)) continue;
        if (position === 'commaOrEnd') {
          if (character === ',') {
            position = 'value';
            continue;
          }
          if (character === ']') {
            ended = true;
            continue;
          }
          throw new Error('Invalid top-level JSON array separator');
        }
        if (character === ']') {
          if (position === 'value') throw new Error('Invalid trailing separator in top-level JSON array');
          ended = true;
          continue;
        }
        if (character !== '{') throw new Error('Top-level JSON array entries must be objects');
        collecting = true;
        depth = 1;
        buffer = character;
        continue;
      }

      buffer += character;
      if (inString) {
        if (escaped) escaped = false;
        else if (character === '\\') escaped = true;
        else if (character === '"') inString = false;
        continue;
      }
      if (character === '"') inString = true;
      else if (character === '{' || character === '[') depth += 1;
      else if (character === '}' || character === ']') depth -= 1;

      if (depth === 0) {
        yield JSON.parse(buffer);
        collecting = false;
        buffer = '';
        position = 'commaOrEnd';
      }
    }
  };

  for await (const chunk of readable) yield* consume(typeof chunk === 'string' ? chunk : decoder.write(chunk));
  yield* consume(decoder.end());
  if (!started || !ended || collecting || inString || depth !== 0) throw new Error('LongMemEval dataset is incomplete JSON');
}

export function validateRecord(value) {
  const record = object(value, 'LongMemEval record');
  const questionId = nonEmptyString(record.question_id, 'question_id');
  const questionType = nonEmptyString(record.question_type, 'question_type');
  nonEmptyString(record.question, 'question');
  nonEmptyString(record.question_date, 'question_date');
  const sessionIds = stringArray(record.haystack_session_ids, 'haystack_session_ids');
  const dates = stringArray(record.haystack_dates, 'haystack_dates');
  if (!Array.isArray(record.haystack_sessions)) throw new Error('haystack_sessions must be an array');
  if (sessionIds.length === 0 || sessionIds.length !== dates.length || sessionIds.length !== record.haystack_sessions.length) {
    throw new Error('haystack session arrays must be nonempty and aligned');
  }
  for (const [sessionIndex, session] of record.haystack_sessions.entries()) {
    if (!Array.isArray(session) || session.length === 0) throw new Error(`haystack_sessions[${sessionIndex}] must be a nonempty turn array`);
    for (const [turnIndex, valueTurn] of session.entries()) {
      const turn = object(valueTurn, `haystack_sessions[${sessionIndex}][${turnIndex}]`);
      nonEmptyString(turn.role, `haystack_sessions[${sessionIndex}][${turnIndex}].role`);
      string(turn.content, `haystack_sessions[${sessionIndex}][${turnIndex}].content`);
    }
  }
  const answerSessionIds = stringArray(record.answer_session_ids, 'answer_session_ids');
  if (new Set(answerSessionIds).size !== answerSessionIds.length) throw new Error('answer_session_ids must be unique');
  if (!isAbstention({ question_id: questionId, question_type: questionType })) {
    if (answerSessionIds.length === 0 || answerSessionIds.some((id) => !sessionIds.includes(id))) {
      throw new Error('answer_session_ids must be nonempty and resolve to haystack_session_ids');
    }
  }
  return record;
}

export function classifyRecord(record) {
  return isAbstention(record) ? { eligible: false, reason: 'abstention' } : { eligible: true };
}

export function normalizeSessions(record) {
  return record.haystack_sessions.map((session, index) => ({
    index,
    sourceId: `${index}:${record.haystack_session_ids[index]}`,
    sessionId: record.haystack_session_ids[index],
    capturedAt: record.haystack_dates[index],
    text: session.map((turn) => `[${turn.role}] ${turn.content}`).join('\n'),
  }));
}

export async function hashFile(path) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(path)) digest.update(chunk);
  return digest.digest('hex');
}

export async function inspectDataset(path, options = {}) {
  const expectedSha256 = options.expectedSha256 ?? LONGMEMEVAL_SOURCE.sha256;
  const sha256 = await hashFile(path);
  if (sha256 !== expectedSha256) throw new Error(`LongMemEval dataset SHA-256 mismatch: expected ${expectedSha256}, received ${sha256}`);

  const questionIds = new Set();
  const queryOrder = [];
  const exclusions = [];
  const corpusDigest = createHash('sha256');
  const queryDigest = createHash('sha256');
  let recordCount = 0;
  for await (const value of streamJsonArray(createReadStream(path))) {
    const record = validateRecord(value);
    recordCount += 1;
    if (questionIds.has(record.question_id)) throw new Error('question_id values must be unique');
    questionIds.add(record.question_id);
    const classification = classifyRecord(record);
    if (!classification.eligible) {
      exclusions.push({ question_id: record.question_id, reason: classification.reason });
      continue;
    }
    queryOrder.push(record.question_id);
    corpusDigest.update(`${JSON.stringify({ question_id: record.question_id, sessions: normalizeSessions(record) })}\n`);
    queryDigest.update(`${JSON.stringify({ question_id: record.question_id, question: record.question })}\n`);
  }
  if (recordCount === 0 || queryOrder.length === 0) throw new Error('LongMemEval dataset must contain eligible records');
  return {
    sha256,
    recordCount,
    eligibleCount: queryOrder.length,
    queryOrder,
    exclusions,
    corpusHash: corpusDigest.digest('hex'),
    queryHash: queryDigest.digest('hex'),
  };
}

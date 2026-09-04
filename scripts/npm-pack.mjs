import { realpathSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

function realNpmCli(path) {
  try {
    const realPath = realpathSync(path);
    return basename(realPath).toLowerCase() === 'npm-cli.js' && statSync(realPath).isFile()
      ? realPath
      : null;
  } catch {
    return null;
  }
}

export function resolveNpmCli(options = {}) {
  const execPath = resolve(options.execPath ?? process.execPath);
  const environment = options.env ?? process.env;
  const executableDirectory = dirname(execPath);
  const candidates = [
    environment.npm_execpath,
    join(executableDirectory, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    resolve(executableDirectory, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    process.platform === 'win32' ? undefined : join(executableDirectory, 'npm'),
  ].filter((candidate) => typeof candidate === 'string' && candidate.length > 0);

  for (const candidate of [...new Set(candidates)]) {
    const npmCli = realNpmCli(candidate);
    if (npmCli) return npmCli;
  }

  throw new Error(`npm CLI was not found for Node at ${execPath}; checked ${candidates.join(', ')}.`);
}

export function parseNpmPackRecord(output) {
  let envelope;
  try {
    envelope = JSON.parse(output);
  } catch {
    throw new Error('npm pack did not return valid JSON.');
  }

  const records = Array.isArray(envelope)
    ? envelope
    : envelope && typeof envelope === 'object'
      ? Object.values(envelope)
      : [];
  if (records.length !== 1 || !records[0] || typeof records[0] !== 'object' || Array.isArray(records[0])) {
    throw new Error('npm pack must return exactly one package record.');
  }

  const record = records[0];
  if (
    typeof record.filename !== 'string'
    || record.filename.length === 0
    || !Array.isArray(record.files)
    || record.files.some((file) => !file || typeof file !== 'object' || typeof file.path !== 'string')
  ) {
    throw new Error('npm pack record must include a filename and files with paths.');
  }
  return record;
}

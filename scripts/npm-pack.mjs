import { readFileSync, realpathSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { basename, dirname, posix, relative, resolve, sep, win32 } from 'node:path';

export function packTarball(stage, tarball, command = 'tar') {
  const archiveDirectory = dirname(resolve(tarball));
  const stagePath = relative(archiveDirectory, resolve(stage)).split(sep).join('/') || '.';
  // GNU tar treats a colon in the archive argument as a remote host separator.
  const result = spawnSync(command, ['-czf', basename(tarball), '-C', stagePath, 'package'], { cwd: archiveDirectory, encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error(`Dependency archive creation failed: ${result.error?.message ?? result.stderr}`);
}

function realNpmCli(path, fs, paths) {
  try {
    const realPath = fs.realpathSync(path);
    return paths.basename(realPath).toLowerCase() === 'npm-cli.js' && fs.statSync(realPath).isFile()
      ? realPath
      : null;
  } catch {
    return null;
  }
}

export function resolveNpmCli(options = {}) {
  const platform = options.platform ?? process.platform;
  const paths = platform === 'win32' ? win32 : posix;
  const fs = options.fs ?? { readFileSync, realpathSync, statSync };
  const execPath = paths.resolve(options.execPath ?? process.execPath);
  const environment = options.env ?? process.env;
  const executableDirectory = paths.dirname(execPath);
  const candidates = [
    environment.npm_execpath,
    paths.join(executableDirectory, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    paths.resolve(executableDirectory, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    platform === 'win32' ? undefined : paths.join(executableDirectory, 'npm'),
  ].filter((candidate) => typeof candidate === 'string' && candidate.length > 0);

  for (const candidate of [...new Set(candidates)]) {
    const npmCli = realNpmCli(candidate, fs, paths);
    if (npmCli) return npmCli;
  }

  const pathKey = Object.keys(environment).find((key) => platform === 'win32' ? key.toLowerCase() === 'path' : key === 'PATH');
  for (const entry of (environment[pathKey] ?? '').split(paths.delimiter).filter(Boolean)) {
    const directory = entry.replace(/^"|"$/gu, '');
    for (const name of platform === 'win32' ? ['npm.cmd', 'npm'] : ['npm']) {
      const shim = paths.resolve(directory, name);
      candidates.push(shim);
      const npmCli = realNpmCli(shim, fs, paths);
      if (npmCli) return npmCli;
      try {
        // Read known npm shims, never execute shell code or accept pnpm/yarn.
        const source = fs.readFileSync(shim, 'utf8');
        for (const match of source.matchAll(/["']([^"'\r\n]*npm-cli\.js)["']/gu)) {
          const target = match[1].replace(/%~dp0|\$\{basedir\}|\$basedir_win|\$basedir/gu, paths.dirname(shim) + paths.sep);
          if (/[$%]/u.test(target)) continue;
          const cli = realNpmCli(paths.resolve(paths.dirname(shim), target), fs, paths);
          if (cli) return cli;
        }
      } catch { /* Missing or unreadable PATH entry; continue discovery. */ }
    }
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

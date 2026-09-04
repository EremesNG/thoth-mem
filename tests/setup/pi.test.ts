import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { getPiManagerInvocation, parsePiList, setupPi, type PiExecutor, type PiPackageRecord } from '../../src/setup/pi.js';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function packageFixture(root: string): string {
  const version = (JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as { version: string }).version;
  mkdirSync(join(root, 'dist'), { recursive: true });
  mkdirSync(join(root, 'integrations', 'pi', 'skills', 'thoth-mem', 'references'), { recursive: true });
  writeFileSync(join(root, 'dist', 'pi.js'), 'export default () => {}\n');
  writeFileSync(join(root, 'integrations', 'pi', 'skills', 'thoth-mem', 'SKILL.md'), '# thoth-mem\n');
  writeFileSync(join(root, 'integrations', 'pi', 'skills', 'thoth-mem', 'references', 'observation-review.md'), '# Observation review\n');
  writeFileSync(join(root, 'integrations', 'pi', 'skills', 'thoth-mem', 'references', 'pi.md'), '# Pi\n');
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'thoth-mem', version, type: 'module', pi: { extensions: ['./dist/pi.js'], skills: ['./integrations/pi/skills/thoth-mem'] } }));
  return root;
}

class FakePi implements PiExecutor {
  records: PiPackageRecord[] = [];
  readonly calls: string[][] = [];
  private fault: { command: 'install' | 'remove'; outcome: 'nonzero' | 'throw' } | null = null;
  constructor(private readonly publicRoot: string, private readonly version = '0.84.4', private readonly help = true, private readonly malformed = false, private readonly normalizeLocalSource = false, private readonly publicInstallRoot?: string) {}
  failNext(command: 'install' | 'remove', outcome: 'nonzero' | 'throw'): void { this.fault = { command, outcome }; }
  private finishMutation(command: 'install' | 'remove') {
    if (this.fault?.command !== command) return { status: 0, stdout: '', stderr: '' };
    const { outcome } = this.fault;
    this.fault = null;
    if (outcome === 'throw') throw new Error(`${command} transport failed after mutation`);
    return { status: 1, stdout: '', stderr: `${command} failed after mutation` };
  }
  run(_command: string, args: string[]) {
    this.calls.push(args);
    if (args[0] === '--version') return { status: 0, stdout: `${this.version}\n`, stderr: '' };
    if (args[1] === '--help') return { status: this.help ? 0 : 1, stdout: this.help ? `${args[0]} --no-approve\n` : '', stderr: '' };
    if (args[0] === 'list') {
      if (this.malformed) return { status: 0, stdout: 'unparseable\n', stderr: '' };
      const lines = this.records.length ? ['User packages:', ...this.records.flatMap((record) => [`  ${record.source}`, ...(record.installedPath ? [`    ${record.installedPath}`] : [])])] : ['No packages installed.'];
      return { status: 0, stdout: `${lines.join('\n')}\n`, stderr: '' };
    }
    if (args[0] === 'install') {
      const source = args[1]!;
      this.records = this.records.filter((record) => record.source !== source);
      const reportedSource = this.normalizeLocalSource && !source.startsWith('npm:') ? '..\\..\\...\\DEV\\...\\thoth-mem' : source;
      if (source.startsWith('npm:') && this.publicInstallRoot) {
        rmSync(this.publicInstallRoot, { recursive: true, force: true });
        cpSync(this.publicRoot, this.publicInstallRoot, { recursive: true });
      }
      this.records.push({ scope: 'user', source: reportedSource, installedPath: source.startsWith('npm:') ? this.publicInstallRoot ?? this.publicRoot : source });
      return this.finishMutation('install');
    }
    if (args[0] === 'remove') {
      const removed = this.records.find((record) => record.source === args[1]);
      this.records = this.records.filter((record) => record.source !== args[1]);
      if (removed?.installedPath === this.publicInstallRoot) rmSync(this.publicInstallRoot, { recursive: true, force: true });
      return this.finishMutation('remove');
    }
    return { status: 1, stdout: '', stderr: 'unsupported' };
  }
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'thoth-pi-setup-')); roots.push(root);
  return { root, homeDir: join(root, 'home'), publicRoot: packageFixture(join(root, 'public')), localRoot: packageFixture(join(root, 'local')) };
}

function treeSnapshot(root: string): Array<[string, string]> {
  const entries: Array<[string, string]> = [];
  const visit = (directory: string, prefix: string): void => {
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name);
      const relative = prefix ? `${prefix}/${name}` : name;
      if (lstatSync(path).isDirectory()) {
        entries.push([`${relative}/`, 'directory']);
        visit(path, relative);
      } else {
        entries.push([relative, readFileSync(path).toString('base64')]);
      }
    }
  };
  visit(root, '');
  return entries;
}

function repairFixture() {
  const { root, homeDir, publicRoot, localRoot } = fixture();
  const installedRoot = join(root, 'installed');
  const executor = new FakePi(publicRoot, '0.84.4', true, false, false, installedRoot);
  const dataDir = join(root, 'data');
  setupPi({ homeDir, executor, dataDir });
  writeFileSync(join(installedRoot, 'prior-only.txt'), 'prior-only bytes\n');
  const unrelatedPath = join(root, 'unrelated.txt');
  writeFileSync(unrelatedPath, 'unrelated bytes\n');
  executor.records.push({ scope: 'user', source: 'npm:unrelated@1.0.0', installedPath: join(root, 'unrelated-package') });
  const providerPath = join(homeDir, '.config', 'thoth-mem', 'config.json');
  return {
    root, homeDir, localRoot, dataDir, installedRoot, executor, providerPath, unrelatedPath,
    priorTree: treeSnapshot(installedRoot),
    priorRecords: structuredClone(executor.records),
    providerBytes: readFileSync(providerPath),
  };
}

function expectPriorStateExact(state: ReturnType<typeof repairFixture>, journalExpected = false): void {
  const byIdentity = (record: PiPackageRecord) => `${record.scope}\0${record.source}\0${record.installedPath ?? ''}`;
  expect([...state.executor.records].sort((left, right) => byIdentity(left).localeCompare(byIdentity(right))))
    .toEqual([...state.priorRecords].sort((left, right) => byIdentity(left).localeCompare(byIdentity(right))));
  expect(treeSnapshot(state.installedRoot)).toEqual(state.priorTree);
  expect(readFileSync(state.providerPath)).toEqual(state.providerBytes);
  expect(readFileSync(state.unrelatedPath, 'utf8')).toBe('unrelated bytes\n');
  expect(existsSync(join(state.homeDir, '.config', 'thoth-mem', 'receipts', 'pi.in-progress.json'))).toBe(journalExpected);
}

describe('Pi managed setup', () => {
  it('strictly parses bounded global and project list records and preserves literal invocation', () => {
    expect(parsePiList('User packages:\n  npm:thoth-mem@1.0.0\n    /tmp/pkg\n\nProject packages:\n  ./other\n')).toEqual([
      { scope: 'user', source: 'npm:thoth-mem@1.0.0', installedPath: '/tmp/pkg' },
      { scope: 'project', source: './other', installedPath: null },
    ]);
    expect(() => parsePiList('bad\n')).toThrow(/malformed/u);
    expect(getPiManagerInvocation('pi', ['list'], { platform: 'win32', commandShell: 'cmd.exe' })).toEqual({ command: 'cmd.exe', args: ['/d', '/s', '/c', 'pi', 'list'] });
    expect(getPiManagerInvocation('/usr/bin/pi', ['list'], { platform: 'linux' })).toEqual({ command: '/usr/bin/pi', args: ['list'] });
  });

  it('fails capability, version, malformed inventory, and unowned provenance before manager mutation', () => {
    const { homeDir, publicRoot } = fixture();
    for (const executor of [new FakePi(publicRoot, '0.83.0'), new FakePi(publicRoot, '0.84.4', false), new FakePi(publicRoot, '0.84.4', true, true)]) {
      expect(() => setupPi({ homeDir, executor })).toThrow();
      expect(executor.calls.some((args) => (args[0] === 'install' || args[0] === 'remove') && args[1] !== '--help')).toBe(false);
    }
    const conflict = new FakePi(publicRoot); conflict.records = [{ scope: 'user', source: 'npm:thoth-mem@0.0.1', installedPath: publicRoot }];
    expect(() => setupPi({ homeDir, executor: conflict })).toThrow(/unowned/iu);
    expect(conflict.calls.some((args) => (args[0] === 'install' || args[0] === 'remove') && args[1] !== '--help')).toBe(false);

    const malformedForced = new FakePi(publicRoot, 'Pi version unknown');
    expect(() => setupPi({ homeDir, executor: malformedForced, forceVersion: true })).toThrow(/version/iu);
    expect(malformedForced.calls.some((args) => (args[0] === 'install' || args[0] === 'remove') && args[1] !== '--help')).toBe(false);

    const invalidLocalRoot = join(homeDir, 'invalid-local');
    mkdirSync(invalidLocalRoot, { recursive: true });
    writeFileSync(join(invalidLocalRoot, 'package.json'), JSON.stringify({ name: 'thoth-mem', version: (JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as { version: string }).version }));
    const invalidLocal = new FakePi(publicRoot);
    expect(() => setupPi({ homeDir, executor: invalidLocal, packageRoot: invalidLocalRoot })).toThrow(/manifest|resources/iu);
    expect(invalidLocal.calls).toEqual([]);
  });

  it('plans with zero writes, installs public, repeats without mutation, and replaces receipt-owned source locally', () => {
    const { root, homeDir, publicRoot, localRoot } = fixture();
    const executor = new FakePi(publicRoot);
    const plan = setupPi({ homeDir, executor, planOnly: true, dataDir: join(root, 'data') });
    expect(plan).toMatchObject({ status: 'planned', changed: false });
    expect(readdirSync(root).sort()).toEqual(['local', 'public']);
    const first = setupPi({ homeDir, executor, dataDir: join(root, 'data') });
    expect(first).toMatchObject({ status: 'complete', changed: true, verification: { package: true, source: true, manifest: true } });
    const mutationCount = executor.calls.filter((args) => ['install', 'remove'].includes(args[0]!) && args[1] !== '--help').length;
    const repeat = setupPi({ homeDir, executor, dataDir: join(root, 'data') });
    expect(repeat).toMatchObject({ status: 'complete', changed: false });
    expect(executor.calls.filter((args) => ['install', 'remove'].includes(args[0]!) && args[1] !== '--help')).toHaveLength(mutationCount);
    const local = setupPi({ homeDir, executor, packageRoot: localRoot, dataDir: join(root, 'data') });
    expect(local).toMatchObject({ status: 'complete', changed: true, source: localRoot });
    expect(executor.records).toEqual([{ scope: 'user', source: localRoot, installedPath: localRoot }]);
  });

  it('accepts Pi Windows-normalized local source while retaining the absolute source receipt', () => {
    const { homeDir, localRoot } = fixture();
    const executor = new FakePi(join(tmpdir(), 'unused-public'), '0.84.4', true, false, true);
    const first = setupPi({ homeDir, executor, packageRoot: localRoot });
    expect(first).toMatchObject({ status: 'complete', changed: true, source: localRoot, verification: { package: true, source: true, manifest: true } });
    expect(executor.records).toEqual([{ scope: 'user', source: '..\\..\\...\\DEV\\...\\thoth-mem', installedPath: localRoot }]);
    expect(JSON.parse(readFileSync(first.receiptPath!, 'utf8'))).toMatchObject({ source: localRoot, provenance: 'local', installedPath: localRoot });

    const repeat = setupPi({ homeDir, executor, packageRoot: localRoot });
    expect(repeat).toMatchObject({ status: 'complete', changed: false, source: localRoot });
  });

  it('removes the literal normalized source when replacing a receipt-owned local package', () => {
    const { root, homeDir, localRoot } = fixture();
    const replacementRoot = packageFixture(join(root, 'replacement'));
    const normalizedSource = '..\\..\\...\\DEV\\...\\thoth-mem';
    const executor = new FakePi(join(tmpdir(), 'unused-public'), '0.84.4', true, false, true);
    setupPi({ homeDir, executor, packageRoot: localRoot });
    setupPi({ homeDir, executor, packageRoot: replacementRoot });
    expect(executor.calls).toContainEqual(['remove', normalizedSource, '--no-approve']);
    expect(executor.records).toEqual([{ scope: 'user', source: normalizedSource, installedPath: replacementRoot }]);
  });

  it('atomically adopts an exact public installation and then keeps the receipt byte-identical', () => {
    const { homeDir, publicRoot } = fixture();
    const version = (JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as { version: string }).version;
    const source = `npm:thoth-mem@${version}`;
    const executor = new FakePi(publicRoot); executor.records = [{ scope: 'user', source, installedPath: publicRoot }];
    const adopted = setupPi({ homeDir, executor });
    expect(adopted).toMatchObject({ status: 'complete', changed: true, source, receiptPath: expect.any(String) });
    expect(executor.calls.filter((args) => ['install', 'remove'].includes(args[0]!) && args[1] !== '--help')).toEqual([]);
    const receiptPath = adopted.receiptPath!;
    const firstBytes = readFileSync(receiptPath);
    const repeated = setupPi({ homeDir, executor });
    expect(repeated).toMatchObject({ status: 'complete', changed: false, receiptPath });
    expect(readFileSync(receiptPath)).toEqual(firstBytes);
    const stale = JSON.parse(firstBytes.toString('utf8')) as Record<string, unknown>;
    writeFileSync(receiptPath, `${JSON.stringify({ ...stale, piVersion: '0.84.3' }, null, 2)}\n`);
    expect(setupPi({ homeDir, executor })).toMatchObject({ status: 'complete', changed: true, receiptPath });
    expect(readFileSync(receiptPath)).toEqual(firstBytes);
    expect(setupPi({ homeDir, executor })).toMatchObject({ status: 'complete', changed: false, receiptPath });
    expect(executor.calls.filter((args) => ['install', 'remove'].includes(args[0]!) && args[1] !== '--help')).toEqual([]);
  });

  it('does not treat a matching public source as owned when the installed path differs from the receipt', () => {
    const { root, homeDir, publicRoot } = fixture();
    const installedRoot = join(root, 'installed');
    const broadUnrelatedRoot = join(root, 'broad-unrelated');
    const executor = new FakePi(publicRoot, '0.84.4', true, false, false, installedRoot);
    const installed = setupPi({ homeDir, executor });
    const source = installed.source;
    mkdirSync(join(broadUnrelatedRoot, 'unrelated'), { recursive: true });
    writeFileSync(join(broadUnrelatedRoot, 'package.json'), JSON.stringify({ name: 'thoth-mem', version: installed.version }));
    writeFileSync(join(broadUnrelatedRoot, 'unrelated', 'keep.txt'), 'must not be deleted\n');
    const broadBefore = treeSnapshot(broadUnrelatedRoot);
    executor.records = [{ scope: 'user', source, installedPath: broadUnrelatedRoot }];
    const mutationsBefore = executor.calls.filter((args) => ['install', 'remove'].includes(args[0]!) && args[1] !== '--help').length;

    expect(() => setupPi({ homeDir, executor })).toThrow(/unowned/iu);
    expect(executor.calls.filter((args) => ['install', 'remove'].includes(args[0]!) && args[1] !== '--help')).toHaveLength(mutationsBefore);
    expect(treeSnapshot(broadUnrelatedRoot)).toEqual(broadBefore);
    expect(readdirSync(join(homeDir, '.config', 'thoth-mem', 'receipts')).filter((name) => name.startsWith('.pi-package-backup-'))).toEqual([]);
  });

  it('rolls back failed install and recovers an interrupted journal without touching unrelated packages', () => {
    const { root, homeDir, publicRoot, localRoot } = fixture();
    const executor = new FakePi(publicRoot);
    executor.records.push({ scope: 'user', source: 'npm:unrelated@1.0.0', installedPath: join(root, 'unrelated') });
    expect(() => setupPi({ homeDir, executor, failAfter: 'install' })).toThrow(/Injected/u);
    expect(executor.records).toEqual([{ scope: 'user', source: 'npm:unrelated@1.0.0', installedPath: join(root, 'unrelated') }]);
    expect(() => setupPi({ homeDir, executor, interruptAfter: 'install' })).toThrow(/Simulated/u);
    const recovered = setupPi({ homeDir, executor });
    expect(recovered).toMatchObject({ status: 'complete', recovered: true });
    setupPi({ homeDir, executor, packageRoot: localRoot });
    expect(executor.records.some((record) => record.source === 'npm:unrelated@1.0.0')).toBe(true);
  });

  it('repairs receipt-owned matching provenance transactionally and then repeats without mutation', () => {
    const { root, homeDir, publicRoot } = fixture();
    const installedRoot = join(root, 'installed');
    const executor = new FakePi(publicRoot, '0.84.4', true, false, false, installedRoot);
    const unrelatedPath = join(root, 'unrelated.txt');
    writeFileSync(unrelatedPath, 'unrelated bytes\n');
    setupPi({ homeDir, executor });
    executor.records.push({ scope: 'user', source: 'npm:unrelated@1.0.0', installedPath: join(root, 'unrelated-package') });
    writeFileSync(join(installedRoot, 'dist', 'pi.js'), 'corrupted extension\n');
    const mutationsBeforePlan = executor.calls.filter((args) => ['install', 'remove'].includes(args[0]!) && args[1] !== '--help').length;

    expect(setupPi({ homeDir, executor, planOnly: true })).toMatchObject({
      status: 'planned',
      changed: false,
      verification: { package: true, source: true, manifest: false },
      actions: [expect.stringContaining(' remove '), expect.stringContaining(' install '), expect.stringContaining('verify ')],
    });
    expect(readFileSync(join(installedRoot, 'dist', 'pi.js'), 'utf8')).toBe('corrupted extension\n');
    expect(executor.calls.filter((args) => ['install', 'remove'].includes(args[0]!) && args[1] !== '--help')).toHaveLength(mutationsBeforePlan);

    const repaired = setupPi({ homeDir, executor });
    expect(repaired).toMatchObject({ status: 'complete', changed: true, verification: { package: true, source: true, manifest: true } });
    expect(readFileSync(join(installedRoot, 'dist', 'pi.js'), 'utf8')).toBe('export default () => {}\n');
    expect(readFileSync(unrelatedPath, 'utf8')).toBe('unrelated bytes\n');
    expect(executor.records).toContainEqual({ scope: 'user', source: 'npm:unrelated@1.0.0', installedPath: join(root, 'unrelated-package') });
    const mutations = executor.calls.filter((args) => ['install', 'remove'].includes(args[0]!) && args[1] !== '--help');
    expect(mutations.slice(-2)).toEqual([
      ['remove', expect.stringMatching(/^npm:thoth-mem@/u), '--no-approve'],
      ['install', expect.stringMatching(/^npm:thoth-mem@/u), '--no-approve'],
    ]);

    expect(setupPi({ homeDir, executor })).toMatchObject({ status: 'complete', changed: false });
    expect(executor.calls.filter((args) => ['install', 'remove'].includes(args[0]!) && args[1] !== '--help')).toHaveLength(mutations.length);
  });

  it('rolls a failed matching-provenance repair back to the exact prior owned resources', () => {
    const { root, homeDir, publicRoot } = fixture();
    const installedRoot = join(root, 'installed');
    const executor = new FakePi(publicRoot, '0.84.4', true, false, false, installedRoot);
    setupPi({ homeDir, executor });
    const extensionPath = join(installedRoot, 'dist', 'pi.js');
    const skillPath = join(installedRoot, 'integrations', 'pi', 'skills', 'thoth-mem', 'SKILL.md');
    writeFileSync(extensionPath, 'corrupted extension before repair\n');
    writeFileSync(skillPath, 'corrupted skill before repair\n');
    const before = treeSnapshot(installedRoot);

    expect(() => setupPi({ homeDir, executor, failAfter: 'install' })).toThrow(/Injected/u);
    expect(executor.records).toEqual([{ scope: 'user', source: expect.stringMatching(/^npm:thoth-mem@/u), installedPath: installedRoot }]);
    expect(treeSnapshot(installedRoot)).toEqual(before);

    expect(setupPi({ homeDir, executor })).toMatchObject({ status: 'complete', changed: true });
    expect(setupPi({ homeDir, executor })).toMatchObject({ status: 'complete', changed: false });
  });

  it.each(['nonzero', 'throw'] as const)('restores exact prior state when remove mutates then returns %s', (outcome) => {
    const state = repairFixture();
    state.executor.failNext('remove', outcome);

    expect(() => setupPi({ homeDir: state.homeDir, executor: state.executor, packageRoot: state.localRoot, dataDir: state.dataDir })).toThrow(/removal failed|transport failed/u);
    expectPriorStateExact(state);
  });

  it('retains remove intent and backup across hard interruption, then recovers to an independently verified desired commit', () => {
    const state = repairFixture();
    const journalPath = join(state.homeDir, '.config', 'thoth-mem', 'receipts', 'pi.in-progress.json');

    expect(() => setupPi({ homeDir: state.homeDir, executor: state.executor, packageRoot: state.localRoot, dataDir: state.dataDir, interruptAfter: 'remove' })).toThrow(/Simulated/u);
    expect(JSON.parse(readFileSync(journalPath, 'utf8'))).toMatchObject({ schemaVersion: 2, mutationPhase: 'remove-intent' });
    expect(readdirSync(join(journalPath, '..')).some((name) => name.startsWith('.pi-package-backup-'))).toBe(true);
    expect(readFileSync(state.providerPath)).toEqual(state.providerBytes);
    expect(readFileSync(state.unrelatedPath, 'utf8')).toBe('unrelated bytes\n');

    const recovered = setupPi({ homeDir: state.homeDir, executor: state.executor, packageRoot: state.localRoot, dataDir: state.dataDir });
    expect(recovered).toMatchObject({ status: 'complete', recovered: true, source: state.localRoot, verification: { package: true, source: true, manifest: true } });
    expect(state.executor.records).toEqual([
      { scope: 'user', source: 'npm:unrelated@1.0.0', installedPath: join(state.root, 'unrelated-package') },
      { scope: 'user', source: state.localRoot, installedPath: state.localRoot },
    ]);
    expect(readFileSync(state.providerPath)).toEqual(state.providerBytes);
    expect(readFileSync(state.unrelatedPath, 'utf8')).toBe('unrelated bytes\n');
    expect(existsSync(journalPath)).toBe(false);
  });

  it.each(['nonzero', 'throw'] as const)('restores exact prior state when install mutates then returns %s', (outcome) => {
    const state = repairFixture();
    state.executor.failNext('install', outcome);

    expect(() => setupPi({ homeDir: state.homeDir, executor: state.executor, packageRoot: state.localRoot, dataDir: state.dataDir })).toThrow(/installation failed|transport failed/u);
    expectPriorStateExact(state);
  });

  it('retains install intent and backup across hard interruption, then recovers to an independently verified desired commit', () => {
    const state = repairFixture();
    const journalPath = join(state.homeDir, '.config', 'thoth-mem', 'receipts', 'pi.in-progress.json');

    expect(() => setupPi({ homeDir: state.homeDir, executor: state.executor, packageRoot: state.localRoot, dataDir: state.dataDir, interruptAfter: 'install' })).toThrow(/Simulated/u);
    expect(JSON.parse(readFileSync(journalPath, 'utf8'))).toMatchObject({ schemaVersion: 2, mutationPhase: 'install-intent' });
    expect(readdirSync(join(journalPath, '..')).some((name) => name.startsWith('.pi-package-backup-'))).toBe(true);
    expect(readFileSync(state.providerPath)).toEqual(state.providerBytes);
    expect(readFileSync(state.unrelatedPath, 'utf8')).toBe('unrelated bytes\n');

    const recovered = setupPi({ homeDir: state.homeDir, executor: state.executor, packageRoot: state.localRoot, dataDir: state.dataDir });
    expect(recovered).toMatchObject({ status: 'complete', recovered: true, source: state.localRoot, verification: { package: true, source: true, manifest: true } });
    expect(state.executor.records).toEqual([
      { scope: 'user', source: 'npm:unrelated@1.0.0', installedPath: join(state.root, 'unrelated-package') },
      { scope: 'user', source: state.localRoot, installedPath: state.localRoot },
    ]);
    expect(readFileSync(state.providerPath)).toEqual(state.providerBytes);
    expect(readFileSync(state.unrelatedPath, 'utf8')).toBe('unrelated bytes\n');
    expect(existsSync(journalPath)).toBe(false);
  });

  it('retains recovery evidence when exact restoration cannot be proven', () => {
    const state = repairFixture();
    const receiptsRoot = join(state.homeDir, '.config', 'thoth-mem', 'receipts');
    const journalPath = join(receiptsRoot, 'pi.in-progress.json');
    expect(() => setupPi({ homeDir: state.homeDir, executor: state.executor, packageRoot: state.localRoot, dataDir: state.dataDir, interruptAfter: 'install' })).toThrow(/Simulated/u);

    state.executor.failNext('remove', 'nonzero');
    expect(() => setupPi({ homeDir: state.homeDir, executor: state.executor, packageRoot: state.localRoot, dataDir: state.dataDir })).toThrow(/rollback remove failed/u);
    expect(existsSync(journalPath)).toBe(true);
    expect(readdirSync(receiptsRoot).some((name) => name.startsWith('.pi-package-backup-'))).toBe(true);
    expect(readFileSync(state.providerPath)).toEqual(state.providerBytes);
    expect(readFileSync(state.unrelatedPath, 'utf8')).toBe('unrelated bytes\n');
  });

  it('retries terminal cleanup after a hard interruption between rollback backup and journal deletion', () => {
    const state = repairFixture();
    const receiptsRoot = join(state.homeDir, '.config', 'thoth-mem', 'receipts');
    const journalPath = join(receiptsRoot, 'pi.in-progress.json');
    state.executor.failNext('remove', 'nonzero');

    expect(() => setupPi({
      homeDir: state.homeDir,
      executor: state.executor,
      packageRoot: state.localRoot,
      dataDir: state.dataDir,
      interruptAfter: 'rollback-cleanup',
    })).toThrow(/Simulated Pi rollback cleanup interruption/u);
    expect(JSON.parse(readFileSync(journalPath, 'utf8'))).toMatchObject({ mutationPhase: 'rollback-verified' });
    expect(readdirSync(receiptsRoot).some((name) => name.startsWith('.pi-package-backup-'))).toBe(false);
    expectPriorStateExact(state, true);

    const recovered = setupPi({ homeDir: state.homeDir, executor: state.executor, packageRoot: state.localRoot, dataDir: state.dataDir });
    expect(recovered).toMatchObject({ status: 'complete', recovered: true, source: state.localRoot });
    expect(existsSync(journalPath)).toBe(false);
  });

  it('finalizes a verified desired commit after a hard interruption between backup and journal deletion', () => {
    const state = repairFixture();
    const receiptsRoot = join(state.homeDir, '.config', 'thoth-mem', 'receipts');
    const journalPath = join(receiptsRoot, 'pi.in-progress.json');

    expect(() => setupPi({
      homeDir: state.homeDir,
      executor: state.executor,
      packageRoot: state.localRoot,
      dataDir: state.dataDir,
      interruptAfter: 'commit-cleanup',
    })).toThrow(/Simulated Pi commit cleanup interruption/u);
    expect(JSON.parse(readFileSync(journalPath, 'utf8'))).toMatchObject({ mutationPhase: 'receipt-committed' });
    expect(readdirSync(receiptsRoot).some((name) => name.startsWith('.pi-package-backup-'))).toBe(false);
    const mutationCount = state.executor.calls.filter((args) => ['install', 'remove'].includes(args[0]!) && args[1] !== '--help').length;

    const recovered = setupPi({ homeDir: state.homeDir, executor: state.executor, packageRoot: state.localRoot, dataDir: state.dataDir });
    expect(recovered).toMatchObject({ status: 'complete', recovered: true, changed: true, source: state.localRoot });
    expect(state.executor.calls.filter((args) => ['install', 'remove'].includes(args[0]!) && args[1] !== '--help')).toHaveLength(mutationCount);
    expect(readFileSync(state.providerPath)).toEqual(state.providerBytes);
    expect(readFileSync(state.unrelatedPath, 'utf8')).toBe('unrelated bytes\n');
    expect(existsSync(journalPath)).toBe(false);
  });

  it('finalizes a receipt-committed fresh install while preserving unrelated package drift', () => {
    const { root, homeDir, localRoot } = fixture();
    const executor = new FakePi(join(root, 'unused-public'));
    const dataDir = join(root, 'data');
    const receiptsRoot = join(homeDir, '.config', 'thoth-mem', 'receipts');
    const journalPath = join(receiptsRoot, 'pi.in-progress.json');

    expect(() => setupPi({ homeDir, executor, packageRoot: localRoot, dataDir, interruptAfter: 'commit-cleanup' }))
      .toThrow(/Simulated Pi commit cleanup interruption/u);
    expect(JSON.parse(readFileSync(journalPath, 'utf8'))).toMatchObject({ mutationPhase: 'receipt-committed' });
    const unrelated = { scope: 'user' as const, source: 'npm:added-later@1.0.0', installedPath: join(root, 'added-later') };
    executor.records.push(unrelated);
    const mutationCount = executor.calls.filter((args) => ['install', 'remove'].includes(args[0]!) && args[1] !== '--help').length;

    const recovered = setupPi({ homeDir, executor, packageRoot: localRoot, dataDir });
    expect(recovered).toMatchObject({ status: 'complete', recovered: true, changed: true, source: localRoot });
    expect(executor.calls.filter((args) => ['install', 'remove'].includes(args[0]!) && args[1] !== '--help')).toHaveLength(mutationCount);
    expect(executor.records).toEqual([
      { scope: 'user', source: localRoot, installedPath: localRoot },
      unrelated,
    ]);
    expect(existsSync(journalPath)).toBe(false);
  });

  it('retains a valid terminal commit when journal deletion fails and finalizes it on retry', () => {
    const { root, homeDir, localRoot } = fixture();
    const executor = new FakePi(join(root, 'unused-public'));
    const dataDir = join(root, 'data');
    const receiptsRoot = join(homeDir, '.config', 'thoth-mem', 'receipts');
    const journalPath = join(receiptsRoot, 'pi.in-progress.json');
    const receiptPath = join(receiptsRoot, 'pi.json');

    expect(() => setupPi({
      homeDir,
      executor,
      packageRoot: localRoot,
      dataDir,
      journalRemover: () => { throw new Error('injected journal deletion failure'); },
    })).toThrow(/injected journal deletion failure/u);
    expect(JSON.parse(readFileSync(journalPath, 'utf8'))).toMatchObject({ mutationPhase: 'receipt-committed' });
    const receiptBytes = readFileSync(receiptPath);
    const providerBytes = readFileSync(join(homeDir, '.config', 'thoth-mem', 'config.json'));
    const mutationCount = executor.calls.filter((args) => ['install', 'remove'].includes(args[0]!) && args[1] !== '--help').length;
    const unrelated = { scope: 'user' as const, source: 'npm:added-later@1.0.0', installedPath: join(root, 'added-later') };
    executor.records.push(unrelated);

    expect(setupPi({ homeDir, executor, packageRoot: localRoot, dataDir })).toMatchObject({ status: 'complete', recovered: true, changed: true });
    expect(executor.calls.filter((args) => ['install', 'remove'].includes(args[0]!) && args[1] !== '--help')).toHaveLength(mutationCount);
    expect(executor.records).toEqual([{ scope: 'user', source: localRoot, installedPath: localRoot }, unrelated]);
    expect(readFileSync(receiptPath)).toEqual(receiptBytes);
    expect(readFileSync(join(homeDir, '.config', 'thoth-mem', 'config.json'))).toEqual(providerBytes);
    expect(existsSync(journalPath)).toBe(false);
  });

  it.each(['missing package', 'ambiguous package', 'missing resource', 'failed loadability'] as const)(
    'retains a receipt-committed journal without mutation when owned %s cannot be proven',
    (failure) => {
      const { root, homeDir, publicRoot } = fixture();
      const installedRoot = join(root, 'installed');
      const executor = new FakePi(publicRoot, '0.84.4', true, false, false, installedRoot);
      const dataDir = join(root, 'data');
      const receiptsRoot = join(homeDir, '.config', 'thoth-mem', 'receipts');
      const journalPath = join(receiptsRoot, 'pi.in-progress.json');
      const receiptPath = join(receiptsRoot, 'pi.json');
      const providerPath = join(homeDir, '.config', 'thoth-mem', 'config.json');
      expect(() => setupPi({ homeDir, executor, dataDir, interruptAfter: 'commit-cleanup' })).toThrow(/Simulated/u);
      const desiredSource = executor.records[0]!.source;
      const unrelated = { scope: 'user' as const, source: 'npm:unrelated@1.0.0', installedPath: join(root, 'unrelated') };
      executor.records.push(unrelated);
      if (failure === 'missing package') executor.records = executor.records.filter((record) => record.source !== desiredSource);
      if (failure === 'ambiguous package') executor.records.push({ scope: 'user', source: 'npm:thoth-mem@0.0.0', installedPath: join(root, 'ambiguous') });
      if (failure === 'missing resource') rmSync(join(installedRoot, 'dist', 'pi.js'));
      const extensionProbe = failure === 'failed loadability'
        ? () => ({ status: 1, stdout: '', stderr: 'injected load failure' })
        : undefined;
      const recordsBefore = structuredClone(executor.records);
      const receiptBytes = readFileSync(receiptPath);
      const providerBytes = readFileSync(providerPath);
      const journalBytes = readFileSync(journalPath);
      const mutationCount = executor.calls.filter((args) => ['install', 'remove'].includes(args[0]!) && args[1] !== '--help').length;

      expect(() => setupPi({ homeDir, executor, dataDir, ...(extensionProbe ? { extensionProbe } : {}) })).toThrow(/committed|ambiguous|resource|load probe/iu);
      expect(executor.calls.filter((args) => ['install', 'remove'].includes(args[0]!) && args[1] !== '--help')).toHaveLength(mutationCount);
      expect(executor.records).toEqual(recordsBefore);
      expect(readFileSync(receiptPath)).toEqual(receiptBytes);
      expect(readFileSync(providerPath)).toEqual(providerBytes);
      expect(readFileSync(journalPath)).toEqual(journalBytes);
      expect(executor.records).toContainEqual(unrelated);
    },
  );

  it.each(['missing', 'mismatched', 'extra'] as const)(
    'retains a receipt-committed journal without mutation when its exact receipt is %s',
    (failure) => {
      const { root, homeDir, localRoot } = fixture();
      const executor = new FakePi(join(root, 'unused-public'));
      const dataDir = join(root, 'data');
      const receiptsRoot = join(homeDir, '.config', 'thoth-mem', 'receipts');
      const journalPath = join(receiptsRoot, 'pi.in-progress.json');
      const receiptPath = join(receiptsRoot, 'pi.json');
      const providerPath = join(homeDir, '.config', 'thoth-mem', 'config.json');
      expect(() => setupPi({ homeDir, executor, packageRoot: localRoot, dataDir, interruptAfter: 'commit-cleanup' })).toThrow(/Simulated/u);
      const receipt = JSON.parse(readFileSync(receiptPath, 'utf8')) as Record<string, unknown>;
      if (failure === 'missing') rmSync(receiptPath);
      if (failure === 'mismatched') writeFileSync(receiptPath, `${JSON.stringify({ ...receipt, installedPath: join(root, 'wrong') }, null, 2)}\n`);
      if (failure === 'extra') writeFileSync(receiptPath, `${JSON.stringify({ ...receipt, unexpected: true }, null, 2)}\n`);
      const receiptBytes = existsSync(receiptPath) ? readFileSync(receiptPath) : null;
      const providerBytes = readFileSync(providerPath);
      const journalBytes = readFileSync(journalPath);
      const recordsBefore = structuredClone(executor.records);
      const mutationCount = executor.calls.filter((args) => ['install', 'remove'].includes(args[0]!) && args[1] !== '--help').length;

      expect(() => setupPi({ homeDir, executor, packageRoot: localRoot, dataDir })).toThrow(/committed receipt is invalid/u);
      expect(executor.calls.filter((args) => ['install', 'remove'].includes(args[0]!) && args[1] !== '--help')).toHaveLength(mutationCount);
      expect(executor.records).toEqual(recordsBefore);
      expect(existsSync(receiptPath)).toBe(receiptBytes !== null);
      if (receiptBytes) expect(readFileSync(receiptPath)).toEqual(receiptBytes);
      expect(readFileSync(providerPath)).toEqual(providerBytes);
      expect(readFileSync(journalPath)).toEqual(journalBytes);
    },
  );

  it.each([
    ['dist/pi.js', 'missing'],
    ['dist/pi.js', 'directory'],
    ['integrations/pi/skills/thoth-mem/SKILL.md', 'missing'],
    ['integrations/pi/skills/thoth-mem/SKILL.md', 'directory'],
    ['integrations/pi/skills/thoth-mem/references/pi.md', 'missing'],
    ['integrations/pi/skills/thoth-mem/references/pi.md', 'directory'],
    ['integrations/pi/skills/thoth-mem/references/observation-review.md', 'missing'],
    ['integrations/pi/skills/thoth-mem/references/observation-review.md', 'directory'],
  ])('does not accept an installed package whose %s resource is %s', (relative, kind) => {
    const { homeDir, publicRoot } = fixture();
    const path = join(publicRoot, relative);
    rmSync(path, { recursive: true, force: true });
    if (kind === 'directory') mkdirSync(path, { recursive: true });
    const version = (JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as { version: string }).version;
    const source = `npm:thoth-mem@${version}`;
    const executor = new FakePi(publicRoot);
    executor.records = [{ scope: 'user', source, installedPath: publicRoot }];

    expect(() => setupPi({ homeDir, executor })).toThrow(/unowned|resource/iu);
    expect(executor.calls.filter((args) => ['install', 'remove'].includes(args[0]!) && args[1] !== '--help')).toEqual([]);
  });

  it('requires an independent bounded extension load probe before claiming completion', () => {
    const { homeDir, publicRoot } = fixture();
    const version = (JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as { version: string }).version;
    const source = `npm:thoth-mem@${version}`;
    const executor = new FakePi(publicRoot);
    executor.records = [{ scope: 'user', source, installedPath: publicRoot }];

    expect(() => setupPi({
      homeDir,
      executor,
      extensionProbe: () => ({ status: 1, stdout: '', stderr: 'x'.repeat(1_000) }),
    })).toThrow(new RegExp(`Pi installed extension load probe failed: ${'x'.repeat(240)}$`, 'u'));
    expect(executor.calls.filter((args) => ['install', 'remove'].includes(args[0]!) && args[1] !== '--help')).toEqual([]);
  });
});

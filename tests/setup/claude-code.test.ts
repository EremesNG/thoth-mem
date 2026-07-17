import {
    mkdir,
    mkdtemp,
    readFile,
    rm,
    writeFile,
} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

import {describe, expect, it} from 'vitest';

import {inspectAndPlanSetup, type SetupEngineOptions} from '../../src/setup/engine.js';
import {resolveSetupPaths, type SetupRoots} from '../../src/setup/paths.js';
import {loadSetupReceipt, persistSetupReceipt} from '../../src/setup/receipt.js';
import type {SetupRequest} from '../../src/setup/types.js';
import {
    CLAUDE_MANAGER_PROBES,
    CLAUDE_OWNERSHIP_STATES,
} from '../fixtures/setup/claude-manager-evidence.js';

interface ClaudeCommandResult {
    exitCode: number | null;
    stdout: string;
    stderr: string;
}

interface ClaudeCommandExecutor {
    execute(args: readonly string[], options?: { cwd?: string; timeoutMs?: number }): Promise<ClaudeCommandResult>;
}

interface ClaudeManagerState {
    version?: string;
    probeFailure?: 'version' | 'capability' | 'state';
    marketplace: boolean;
    plugin: boolean;
    foreignMarketplace?: boolean;
    foreignPlugin?: boolean;
    failPluginOnce?: boolean;
    interruptAfterMarketplace?: boolean;
    mutations: string[];
}

class ControlledClaudeExecutor implements ClaudeCommandExecutor {
    readonly calls: string[][] = [];

    constructor(readonly state: ClaudeManagerState) {}

    async execute(args: readonly string[]): Promise<ClaudeCommandResult> {
        const command = [...args];
        this.calls.push(command);
        const key = command.filter((argument, index) => (
            argument !== '--json'
            && argument !== '--scope'
            && command[index - 1] !== '--scope'
        )).join(' ');
        const success = (stdout: string): ClaudeCommandResult => ({exitCode: 0, stdout, stderr: ''});

        if (key === '--version') {
            return this.state.probeFailure === 'version'
                ? {exitCode: 1, stdout: '', stderr: 'probe unavailable'}
                : success(this.state.version ?? 'claude-code 1.0.0');
        }
        if (this.state.probeFailure === 'capability' && key === 'plugin --help') {
            return {exitCode: 1, stdout: '', stderr: 'capability unavailable'};
        }
        if (this.state.probeFailure === 'state' && (key === 'plugin marketplace list' || key === 'plugin list')) {
            return {exitCode: 1, stdout: '', stderr: 'state unreadable'};
        }
        if (key === 'plugin --help') {
            return success('Commands: marketplace install list uninstall');
        }
        if (key === 'plugin marketplace --help') {
            return success('Commands: add list remove');
        }
        if (key === 'plugin marketplace add --help') {
            return success('Usage: claude plugin marketplace add <SOURCE> --scope <user|project>');
        }
        if (key === 'plugin marketplace list --help') {
            return success('Usage: claude plugin marketplace list --scope <user|project> --json');
        }
        if (key === 'plugin marketplace remove --help') {
            return success('Usage: claude plugin marketplace remove <NAME> --scope <user|project>');
        }
        if (key === 'plugin install --help') {
            return success('Usage: claude plugin install <PLUGIN>@<MARKETPLACE> --scope <user|project>');
        }
        if (key === 'plugin list --help') {
            return success('Usage: claude plugin list --scope <user|project> --json');
        }
        if (key === 'plugin uninstall --help') {
            return success('Usage: claude plugin uninstall <PLUGIN>@<MARKETPLACE> --scope <user|project>');
        }
        if (key === 'plugin marketplace list') {
            return success(JSON.stringify({
                marketplaces: this.state.foreignMarketplace
                    ? [{name: 'thoth-mem', source: 'foreign/thoth-mem'}]
                    : this.state.marketplace
                        ? [{name: 'thoth-mem', source: 'EremesNG/thoth-mem'}]
                        : []
            }));
        }
        if (key === 'plugin list') {
            return success(JSON.stringify({
                plugins: this.state.foreignPlugin
                    ? [{id: 'foreign@thoth-mem', name: 'thoth-mem', marketplace: 'foreign'}]
                    : this.state.plugin
                        ? [{id: 'thoth-mem@thoth-mem', name: 'thoth-mem', marketplace: 'thoth-mem', enabled: true}]
                        : []
            }));
        }
        if (key === 'plugin marketplace add EremesNG/thoth-mem') {
            this.state.mutations.push(key);
            this.state.marketplace = true;
            if (this.state.interruptAfterMarketplace) {
                throw new Error('simulated-interruption');
            }
            return success('registered');
        }
        if (key === 'plugin install thoth-mem@thoth-mem') {
            this.state.mutations.push(key);
            if (this.state.failPluginOnce) {
                this.state.failPluginOnce = false;
                return {exitCode: 17, stdout: '', stderr: 'plugin install failed'};
            }
            this.state.plugin = true;
            return success('installed');
        }
        if (key === 'plugin uninstall thoth-mem@thoth-mem') {
            this.state.mutations.push(key);
            this.state.plugin = false;
            return success('uninstalled');
        }
        if (key === 'plugin marketplace remove thoth-mem') {
            this.state.mutations.push(key);
            this.state.marketplace = false;
            return success('removed');
        }
        return {exitCode: 64, stdout: '', stderr: 'unexpected command'};
    }
}

interface Fixture {
    root: string;
    dataDir: string;
    projectPath: string;
    receiptSequence: number;
    roots: SetupRoots;
}

function claudeHarness(): SetupRequest['harness'] {
    return 'claude-code';
}

function request(scope: 'global' | 'project' = 'global', overrides: Partial<SetupRequest> = {}): SetupRequest {
    return {
        harness: claudeHarness(),
        scope,
        ...(scope === 'project' ? {projectPath: overrides.projectPath ?? 'missing-project'} : {}),
        planOnly: false,
        force: false,
        json: true,
        ...overrides,
    };
}

async function withFixture(run: (fixture: Fixture) => Promise<void>): Promise<void> {
    const root = await mkdtemp(join(tmpdir(), 'thoth-claude-setup-'));
    const fixture: Fixture = {
        root,
        dataDir: join(root, 'data'),
        projectPath: join(root, 'project'),
        receiptSequence: 0,
        roots: {
            homeDir: join(root, 'home'),
            cwd: root,
            packageRoot: join(root, 'package'),
        },
    };
    await mkdir(join(fixture.roots.packageRoot, '.claude-plugin'), {recursive: true});
    await mkdir(join(fixture.roots.packageRoot, 'integrations', 'claude-code'), {recursive: true});
    await writeFile(
        join(fixture.roots.packageRoot, '.claude-plugin', 'marketplace.json'),
        JSON.stringify({name: 'thoth-mem', plugins: [{name: 'thoth-mem', source: './integrations/claude-code'}]}),
        'utf8',
    );
    try {
        await run(fixture);
    } finally {
        await rm(root, {recursive: true, force: true});
    }
}

function options(
    fixture: Fixture,
    executor: ControlledClaudeExecutor,
    trace?: NonNullable<SetupEngineOptions['transaction']>['trace'],
): SetupEngineOptions & {
    claudeExecutor: ClaudeCommandExecutor;
} {
    return {
        roots: fixture.roots,
        dataDir: fixture.dataDir,
        executablePath: join(fixture.root, 'bin', 'thoth-mem.js'),
        claudeExecutor: executor,
        transaction: {
            idFactory: () => 'claude-setup-receipt-' + String(++fixture.receiptSequence),
            now: () => new Date('2026-07-16T12:00:00.000Z'),
            ...(trace ? {trace} : {}),
        },
    };
}

describe('managed Claude Code setup', () => {
    it.each(['global', 'project'] as const)(
        'installs the package-owned marketplace/plugin identity in an isolated %s scope',
        async (scope) => {
            await withFixture(async (fixture) => {
                const manager = new ControlledClaudeExecutor({marketplace: false, plugin: false, mutations: []});
                const setupRequest = request(scope, {
                    ...(scope === 'project' ? {projectPath: fixture.projectPath} : {}),
                });
                if (scope === 'project') await mkdir(fixture.projectPath, {recursive: true});

                const result = await inspectAndPlanSetup(setupRequest, options(fixture, manager));
                const paths = resolveSetupPaths(setupRequest, fixture.roots);

                expect(paths.targetRoot).toBe(scope === 'global'
                    ? join(fixture.roots.homeDir, '.claude')
                    : join(fixture.projectPath, '.claude'));
                expect(result).toMatchObject({
                    status: 'complete',
                    changed: true,
                    harness: 'claude-code',
                    scope,
                });
                expect(result.receipt).toEqual(expect.any(String));
                expect(manager.state.mutations).toEqual([
                    'plugin marketplace add EremesNG/thoth-mem',
                    'plugin install thoth-mem@thoth-mem',
                ]);
            });
        },
    );

    it('keeps plan-only and unproven manager outcomes zero-write', async () => {
        await withFixture(async (fixture) => {
            const manager = new ControlledClaudeExecutor({marketplace: false, plugin: false, mutations: []});
            const setupRequest = request('global', {planOnly: true});
            const before = await readFile(join(fixture.roots.packageRoot, '.claude-plugin', 'marketplace.json'), 'utf8');

            const result = await inspectAndPlanSetup(setupRequest, options(fixture, manager));

            expect(result).toMatchObject({status: 'complete', changed: false, receipt: null});
            expect(manager.state.mutations).toEqual([]);
            expect(await readFile(join(fixture.roots.packageRoot, '.claude-plugin', 'marketplace.json'), 'utf8')).toBe(before);
            expect(CLAUDE_MANAGER_PROBES.find((probe) => probe.status === 'requires_user_action')).toBeDefined();
            const unprovenManager = new ControlledClaudeExecutor({
                version: 'claude-code 2.0.0',
                marketplace: false,
                plugin: false,
                mutations: [],
            });
            const unproven = await inspectAndPlanSetup(request('global'), options(fixture, unprovenManager));
            expect(unproven).toMatchObject({status: 'requires_user_action', changed: false, receipt: null});
            expect(unprovenManager.state.mutations).toEqual([]);
        });
    });

    it('returns an exact current no-op and repairs only receipt-owned manager drift', async () => {
        await withFixture(async (fixture) => {
            const manager = new ControlledClaudeExecutor({marketplace: false, plugin: false, mutations: []});
            const setupRequest = request();
            const installed = await inspectAndPlanSetup(setupRequest, options(fixture, manager));
            expect(installed).toMatchObject({status: 'complete', changed: true});
            const receipt = installed.receipt!;
            const mutationsBeforeNoOp = [...manager.state.mutations];

            const current = await inspectAndPlanSetup(setupRequest, options(fixture, manager));
            expect(current).toMatchObject({status: 'complete', changed: false, receipt: null});
            expect(manager.state.mutations).toEqual(mutationsBeforeNoOp);

            manager.state.plugin = false;
            const repaired = await inspectAndPlanSetup(setupRequest, options(fixture, manager));
            expect(repaired).toMatchObject({status: 'complete', changed: true});
            expect(manager.state.mutations.slice(mutationsBeforeNoOp.length)).toEqual(['plugin install thoth-mem@thoth-mem']);
            expect(repaired.receipt).not.toBe(receipt);
        });
    });

    it('refuses foreign or ambiguous ownership without adding a duplicate activation', async () => {
        await withFixture(async (fixture) => {
            const manager = new ControlledClaudeExecutor({
                marketplace: false,
                plugin: false,
                foreignMarketplace: true,
                foreignPlugin: true,
                mutations: [],
            });

            const result = await inspectAndPlanSetup(request(), options(fixture, manager));

            expect(result).toMatchObject({status: 'requires_user_action', changed: false, receipt: null});
            expect(manager.state.mutations).toEqual([]);
            expect(CLAUDE_OWNERSHIP_STATES.filter((state) => state.classification !== 'receipt-owned')
            .every((state) => state.setupDisposition === 'preserve')).toBe(true);
        });
    });

    it('recovers a verified partial manager state without touching external state', async () => {
        await withFixture(async (fixture) => {
            const manager = new ControlledClaudeExecutor({
                marketplace: false,
                plugin: false,
                failPluginOnce: true,
                mutations: [],
            });
            const first = await inspectAndPlanSetup(request(), options(fixture, manager));
            expect(first).toMatchObject({status: 'partial', changed: true});
            expect(first.receipt).toEqual(expect.any(String));

            const recovered = await inspectAndPlanSetup(request(), options(fixture, manager));
            expect(recovered).toMatchObject({status: 'complete', changed: true});
            expect(manager.state.mutations).toEqual([
                'plugin marketplace add EremesNG/thoth-mem',
                'plugin install thoth-mem@thoth-mem',
                'plugin install thoth-mem@thoth-mem',
            ]);
        });
    });

    it('rolls back only the receipt-created manager state and preserves later user edits', async () => {
        await withFixture(async (fixture) => {
            const manager = new ControlledClaudeExecutor({marketplace: false, plugin: false, mutations: []});
            const setupRequest = request('project', {projectPath: fixture.projectPath});
            await mkdir(join(fixture.projectPath, '.claude'), {recursive: true});
            const userSettings = join(fixture.projectPath, '.claude', 'settings.json');
            await writeFile(userSettings, '{"userSetting":true}\n', 'utf8');
            const installed = await inspectAndPlanSetup(setupRequest, options(fixture, manager));
            await writeFile(userSettings, '{"userSetting":true,"laterEdit":true}\n', 'utf8');

            const rollback = await inspectAndPlanSetup({
                ...setupRequest,
                rollbackReceipt: installed.receipt!
            }, options(fixture, manager));

            expect(rollback).toMatchObject({status: 'complete', changed: true});
            expect(manager.state).toMatchObject({marketplace: false, plugin: false});
            expect(await readFile(userSettings, 'utf8')).toContain('laterEdit');
        });
    });

    it('fails closed for interrupted or tampered Claude receipts', async () => {
        await withFixture(async (fixture) => {
            const interruptedManager = new ControlledClaudeExecutor({
                marketplace: false,
                plugin: false,
                interruptAfterMarketplace: true,
                mutations: [],
            });
            const interrupted = await inspectAndPlanSetup(request(), options(fixture, interruptedManager));
            expect(interrupted).toMatchObject({status: 'partial', changed: true});
            expect(interrupted.receipt).toEqual(expect.any(String));

            interruptedManager.state.interruptAfterMarketplace = false;
            const recovered = await inspectAndPlanSetup(request(), options(fixture, interruptedManager));
            expect(recovered).toMatchObject({status: 'complete', changed: true});
            const rollback = await inspectAndPlanSetup(
                {...request(), rollbackReceipt: recovered.receipt!},
                options(fixture, interruptedManager),
            );
            expect(rollback).toMatchObject({status: 'complete', changed: true});
            expect(interruptedManager.state).toMatchObject({marketplace: false, plugin: false});

            const corruptManager = new ControlledClaudeExecutor({marketplace: false, plugin: false, mutations: []});
            const clean = await inspectAndPlanSetup(request('project', {projectPath: fixture.projectPath}), options(fixture, corruptManager));
            await writeFile(clean.receipt!, '{"tampered":true}', 'utf8');
            const corrupt = await inspectAndPlanSetup(
                request('project', {projectPath: fixture.projectPath, planOnly: true}),
                options(fixture, corruptManager),
            );
            expect(corrupt).toMatchObject({status: 'requires_user_action', changed: false});
            expect(corruptManager.state.mutations).toEqual([
                'plugin marketplace add EremesNG/thoth-mem',
                'plugin install thoth-mem@thoth-mem',
            ]);
        });
    });
    it.each(['version', 'capability', 'state'] as const)(
        'fails closed without mutation when the Claude %s probe is unavailable',
        async (probeFailure) => {
            await withFixture(async (fixture) => {
                const manager = new ControlledClaudeExecutor({
                    probeFailure,
                    marketplace: false,
                    plugin: false,
                    mutations: [],
                });

                const result = await inspectAndPlanSetup(request(), options(fixture, manager));

                expect(result).toMatchObject({status: 'requires_user_action', changed: false, receipt: null});
                expect(manager.state.mutations).toEqual([]);
            });
        },
    );

    it.each(['malformed', 'unreadable'] as const)(
        'fails closed without mutation for %s Claude settings',
        async (state) => {
            await withFixture(async (fixture) => {
                const setupRequest = request();
                const paths = resolveSetupPaths(setupRequest, fixture.roots);
                if (state === 'malformed') {
                    await mkdir(join(fixture.roots.homeDir, '.claude'), {recursive: true});
                    await writeFile(paths.configPath, '{', 'utf8');
                } else {
                    await mkdir(paths.configPath, {recursive: true});
                }
                const manager = new ControlledClaudeExecutor({marketplace: false, plugin: false, mutations: []});

                const result = await inspectAndPlanSetup(setupRequest, options(fixture, manager));

                expect(result).toMatchObject({status: 'requires_user_action', changed: false, receipt: null});
                expect(manager.state.mutations).toEqual([]);
            });
        },
    );

    it('rescans receipt ownership after the lock before repairing manager drift', async () => {
        await withFixture(async (fixture) => {
            const manager = new ControlledClaudeExecutor({marketplace: false, plugin: false, mutations: []});
            const setupRequest = request();
            const installed = await inspectAndPlanSetup(setupRequest, options(fixture, manager));
            manager.state.plugin = false;
            const mutationsBefore = [...manager.state.mutations];

            const result = await inspectAndPlanSetup(
                setupRequest,
                options(fixture, manager, async ({kind}) => {
                    if (kind === 'lock_acquired') await writeFile(installed.receipt!, '{"tampered":true}', 'utf8');
                }),
            );

            expect(result).toMatchObject({status: 'requires_user_action', changed: false});
            expect(manager.state.mutations).toEqual(mutationsBefore);
        });
    });

    it('rereads manager ownership after the lock before rollback removal', async () => {
        await withFixture(async (fixture) => {
            const manager = new ControlledClaudeExecutor({marketplace: false, plugin: false, mutations: []});
            const setupRequest = request();
            const installed = await inspectAndPlanSetup(setupRequest, options(fixture, manager));
            const mutationsBefore = [...manager.state.mutations];

            const result = await inspectAndPlanSetup(
                {...setupRequest, rollbackReceipt: installed.receipt!},
                options(fixture, manager, ({kind}) => {
                    if (kind === 'lock_acquired') manager.state.foreignPlugin = true;
                }),
            );

            expect(result).toMatchObject({status: 'requires_user_action', changed: false});
            expect(manager.state.mutations).toEqual(mutationsBefore);
        });
    });

    it('rolls back a split partial receipt without removing unowned plugin state', async () => {
        await withFixture(async (fixture) => {
            const manager = new ControlledClaudeExecutor({
                marketplace: false,
                plugin: false,
                interruptAfterMarketplace: true,
                mutations: [],
            });
            const partial = await inspectAndPlanSetup(request(), options(fixture, manager));
            expect(partial).toMatchObject({status: 'partial', changed: true});
            manager.state.interruptAfterMarketplace = false;

            const rollback = await inspectAndPlanSetup(
                {...request(), rollbackReceipt: partial.receipt!},
                options(fixture, manager),
            );

            expect(rollback).toMatchObject({status: 'complete', changed: true});
            expect(manager.state).toMatchObject({marketplace: false, plugin: false});
            expect(manager.state.mutations).toEqual([
                'plugin marketplace add EremesNG/thoth-mem',
                'plugin marketplace remove thoth-mem',
            ]);
        });
    });
    it('resumes a signed in-progress marketplace checkpoint into a rollbackable recovery receipt', async () => {
        await withFixture(async (fixture) => {
            const manager = new ControlledClaudeExecutor({
                marketplace: false,
                plugin: false,
                interruptAfterMarketplace: true,
                mutations: [],
            });
            const partial = await inspectAndPlanSetup(request(), options(fixture, manager));
            expect(partial).toMatchObject({status: 'partial', changed: true});
            const receiptBasePath = join(fixture.dataDir, 'setup', 'receipts');
            const loaded = await loadSetupReceipt(partial.receipt!, {
                dataDir: fixture.dataDir,
                expectedBasePath: receiptBasePath,
            });
            expect(loaded.ok).toBe(true);
            if (!loaded.ok) throw new Error('expected signed receipt');
            const checkpointed = await persistSetupReceipt(partial.receipt!, {
                ...loaded.receipt,
                status: 'in_progress',
            }, {
                dataDir: fixture.dataDir,
                expectedBasePath: receiptBasePath,
            });
            expect(checkpointed.ok).toBe(true);
            manager.state.interruptAfterMarketplace = false;

            const recovered = await inspectAndPlanSetup(request(), options(fixture, manager));
            expect(recovered).toMatchObject({status: 'complete', changed: true});
            const rollback = await inspectAndPlanSetup(
                {...request(), rollbackReceipt: recovered.receipt!},
                options(fixture, manager),
            );
            expect(rollback).toMatchObject({status: 'complete', changed: true});
            expect(manager.state).toMatchObject({marketplace: false, plugin: false});
        });

    });

        it('supersedes a marketplace-only partial receipt before recovery rollback', async () => {
            await withFixture(async (fixture) => {
                const manager = new ControlledClaudeExecutor({
                    marketplace: false,
                    plugin: false,
                    interruptAfterMarketplace: true,
                    mutations: [],
                });
                const partial = await inspectAndPlanSetup(request(), options(fixture, manager));
                expect(partial).toMatchObject({status: 'partial', changed: true});
                const receiptBasePath = join(fixture.dataDir, 'setup', 'receipts');
                const firstReceipt = await loadSetupReceipt(partial.receipt!, {
                    dataDir: fixture.dataDir,
                    expectedBasePath: receiptBasePath,
                });
                expect(firstReceipt.ok).toBe(true);
                if (!firstReceipt.ok) throw new Error('expected signed partial receipt');
                expect(firstReceipt.receipt.steps).toEqual(expect.arrayContaining([
                    expect.objectContaining({id: 'claude-marketplace', outcome: 'confirmed'}),
                ]));

                manager.state.interruptAfterMarketplace = false;
                const recovered = await inspectAndPlanSetup(request(), options(fixture, manager));
                expect(recovered).toMatchObject({status: 'complete', changed: true});
                expect(recovered.receipt).not.toEqual(partial.receipt);
                const recoveredReceipt = JSON.parse(await readFile(recovered.receipt!, 'utf8')) as Record<string, unknown>;
                expect(recoveredReceipt.supersedes).toBe(firstReceipt.receipt.id);

                const staleRollback = await inspectAndPlanSetup(
                    {...request(), rollbackReceipt: partial.receipt!},
                    options(fixture, manager),
                );
                expect(staleRollback).toMatchObject({status: 'requires_user_action', changed: false});
                expect(manager.state).toMatchObject({marketplace: true, plugin: true});

                const activeRollback = await inspectAndPlanSetup(
                    {...request(), rollbackReceipt: recovered.receipt!},
                    options(fixture, manager),
                );
                expect(activeRollback).toMatchObject({status: 'complete', changed: true});
                expect(manager.state).toMatchObject({marketplace: false, plugin: false});
            });
        });
    });

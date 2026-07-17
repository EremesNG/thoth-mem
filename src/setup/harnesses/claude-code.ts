import { randomUUID } from 'node:crypto';
    import { lstat, readFile } from 'node:fs/promises';
    import { basename, dirname, join, resolve } from 'node:path';

    import { getConfig } from '../../config.js';
    import { getVersion } from '../../version.js';
    import {
      createNodeClaudeCommandExecutor,
      inspectClaudeCodeManager,
      runClaudeCodeManagerOperation,
      type ClaudeCommandExecutor,
      type ClaudeManagerInspection,
      type ClaudeManagerOperation,
    } from '../claude-code-cli.js';
    import type { SetupEngineOptions } from '../engine.js';
    import {
      type SetupPaths,
      type SetupRoots,
    } from '../paths.js';
    import {
      createSetupReceipt,
      persistSetupReceipt,
      resolveSetupReceiptPaths,
      scanSetupReceipts,
      type SetupReceipt,
      type SetupReceiptV1,
    } from '../receipt.js';
    import {
      acquireSetupTargetLock,
      canonicalizeSetupTarget,
    } from '../transaction-lock.js';
    import type {
      SetupRequest,
      SetupResult,
      SetupStepOutcome,
    } from '../types.js';

    export interface ClaudeCodeSetupStrategy {
      inspectAndPlan(
        request: SetupRequest,
        roots: SetupRoots,
        paths: SetupPaths,
        options: SetupEngineOptions,
      ): Promise<SetupResult>;
    }

    export const claudeCodeSetupStrategy: ClaudeCodeSetupStrategy = {
      inspectAndPlan: inspectAndPlanClaudeCodeSetup,
    };

    async function inspectAndPlanClaudeCodeSetup(
    request: SetupRequest,
    roots: SetupRoots,
    paths: SetupPaths,
    options: SetupEngineOptions,
): Promise<SetupResult> {
    if (!await hasClaudePackageIdentity(paths)) {
        return failedInspectionResult(request, paths.targetRoot, paths.sourceAssetsPath);
    }
    if (await hasManualClaudeConfiguration(paths)) {
        return requiresSetupActionResult(
            request,
            paths,
            'Manual Claude Code thoth-mem configuration exists in the selected scope.',
            'Preserve the manual configuration or migrate it with an independently verified receipt before managed setup.',
            'Inspect Claude Code coexistence state',
        );
    }

    let dataDir: string;
    let canonicalTarget: string;
    let receiptBasePath: string;
    try {
        dataDir = canonicalDataDir(options, roots, !request.planOnly);
        canonicalTarget = await canonicalizeSetupTarget(paths.targetRoot);
        receiptBasePath = setupReceiptBasePath(request, paths, dataDir);
    } catch {
        return invalidPathResult(request);
    }
    const scanned = await scanSetupReceipts(receiptBasePath, {
        dataDir,
        expectedBasePath: receiptBasePath,
    });
    if (!scanned.ok) {
        return requiresSetupActionResult(
            request,
            paths,
            'Selected Claude Code setup receipts or their HMAC key could not be verified.',
            'Restore the verified receipt key and receipt topology before retrying.',
            'Verify Claude Code setup receipts',
        );
    }
    const incomplete = scanned.receipts.filter(({receipt}) => (
        receipt.harness === 'claude'
        && receipt.scope === request.scope
        && resolve(receipt.target) === resolve(canonicalTarget)
        && receipt.status === 'in_progress'
        && (!request.rollbackReceipt || resolve(request.rollbackReceipt) !== resolve(receiptPathFor(receiptBasePath, receipt.id)))
    ));
    const resumableReceipt = !request.rollbackReceipt
    && incomplete.length === 1
    && isResumableClaudeReceipt(incomplete[0]!.receipt, request, canonicalTarget)
        ? incomplete[0]!
        : null;
    if (incomplete.length > 0 && !resumableReceipt) {
        return requiresSetupActionResult(
            request,
            paths,
            'An interrupted Claude Code receipt exists for the selected scope.',
            'Inspect the verified in-progress receipt before retrying setup or rollback.',
            'Inspect interrupted Claude Code receipt',
        );
    }

    const executor = options.claudeExecutor ?? createNodeClaudeCommandExecutor();
    let manager = await inspectClaudeCodeManager({
        executor,
        scope: request.scope,
        ...(request.projectPath ? {projectPath: request.projectPath} : {}),
    });
    if (manager.status !== 'ready') return claudeManagerResult(request, paths, manager, false, null);

    if (request.rollbackReceipt) {
        if (request.planOnly) {
            return requiresSetupActionResult(
                request,
                paths,
                'Plan-only Claude Code rollback performed no writes.',
                'Run the verified rollback without --plan after reviewing the receipt.',
                'Inspect Claude Code rollback receipt',
            );
        }
        return executeClaudeCodeRollback(
            request,
            paths,
            dataDir,
            canonicalTarget,
            receiptBasePath,
            scanned.receipts,
            executor,
            manager,
            options,
        );
    }

    if (manager.marketplace === 'present' && manager.plugin === 'present') {
        return claudeManagerResult(request, paths, manager, false, null);
    }
    if (request.planOnly) return claudeManagerResult(request, paths, manager, false, null);
    if (
        manager.marketplace === 'present'
        && manager.plugin === 'absent'
        && !resumableReceipt
        && !hasClaudeReceiptOwnership(scanned.receipts, request, canonicalTarget)
    ) {
        return requiresSetupActionResult(
            request,
            paths,
            'The selected Claude Code marketplace is externally managed and has no receipt-owned thoth-mem recovery proof.',
            'Preserve the marketplace-managed state and install or repair the plugin manually.',
            'Validate Claude Code ownership before repair',
        );
    }
    if (manager.marketplace === 'absent' && manager.plugin === 'present') {
        return requiresSetupActionResult(
            request,
            paths,
            'Claude Code reports a plugin without a verified thoth-mem marketplace.',
            'Resolve the ambiguous manager state manually; no duplicate activation was added.',
            'Validate Claude Code manager state',
        );
    }

    const lock = await acquireSetupTargetLock(dataDir, request.harness, request.scope, paths.targetRoot);
    if (!lock.ok) {
        return requiresSetupActionResult(
            request,
            paths,
            'The selected Claude Code setup target is locked or unavailable.',
            'Wait for the active operation to finish, then retry.',
            'Acquire Claude Code setup lock',
        );
    }
    try {
        await traceSetup(options, 'lock_acquired');
        if (!await hasClaudePackageIdentity(paths) || await hasManualClaudeConfiguration(paths)) {
            return requiresSetupActionResult(
                request,
                paths,
                'Claude Code package identity or settings changed before mutation.',
                'Resolve the selected scope manually and retry; no manager command was run.',
                'Reread Claude Code coexistence state',
            );
        }
        const lockedScanned = await scanSetupReceipts(receiptBasePath, {
            dataDir,
            expectedBasePath: receiptBasePath,
        });
        if (!lockedScanned.ok) {
            return requiresSetupActionResult(
                request,
                paths,
                'Claude Code receipt integrity changed before mutation.',
                'Restore the verified receipt key and receipt topology before retrying.',
                'Reread Claude Code setup receipts',
            );
        }
        const lockedIncomplete = lockedScanned.receipts.filter(({receipt}) => (
            receipt.harness === 'claude'
            && receipt.scope === request.scope
            && resolve(receipt.target) === resolve(canonicalTarget)
            && receipt.status === 'in_progress'
        ));
        const lockedResumableReceipt = lockedIncomplete.length === 1
        && isResumableClaudeReceipt(lockedIncomplete[0]!.receipt, request, canonicalTarget)
            ? lockedIncomplete[0]!
            : null;
        if (lockedIncomplete.length > 0 && !lockedResumableReceipt) {
            return requiresSetupActionResult(
                request,
                paths,
                'An interrupted Claude Code receipt appeared before mutation.',
                'Inspect the verified in-progress receipt before retrying setup.',
                'Reread interrupted Claude Code receipt',
            );
        }
        manager = await inspectClaudeCodeManager({
            executor,
            scope: request.scope,
            ...(request.projectPath ? {projectPath: request.projectPath} : {}),
        });
        if (manager.status !== 'ready') return claudeManagerResult(request, paths, manager, false, null);
        let effectiveReceipts = lockedScanned.receipts;
        if (lockedResumableReceipt) {
            if (manager.marketplace !== 'present' || manager.plugin !== 'absent') {
                return requiresSetupActionResult(
                    request,
                    paths,
                    'The interrupted Claude Code receipt no longer matches verified manager state.',
                    'Inspect the manager and receipt manually before recovery.',
                    'Validate resumable Claude Code receipt',
                );
            }
            const promoted = await persistSetupReceipt(lockedResumableReceipt.path, {
                ...lockedResumableReceipt.receipt,
                status: 'partial',
                updated_at: transactionNow(options),
            }, {
                dataDir,
                expectedBasePath: receiptBasePath,
                fault: options.transaction?.receiptFault,
            });
            if (!promoted.ok) {
                return requiresSetupActionResult(
                    request,
                    paths,
                    'The interrupted Claude Code receipt could not be checkpointed for recovery.',
                    'Restore the verified receipt key and inspect the interrupted operation manually.',
                    'Checkpoint resumable Claude Code receipt',
                );
            }
            effectiveReceipts = lockedScanned.receipts.map((entry) => (
                resolve(entry.path) === resolve(lockedResumableReceipt.path)
                    ? {path: entry.path, receipt: promoted.receipt}
                    : entry
            ));
        }
        if (manager.marketplace === 'present' && manager.plugin === 'present') {
            return claudeManagerResult(request, paths, manager, false, null);
        }
        if (
            manager.marketplace === 'present'
            && manager.plugin === 'absent'
            && !hasClaudeReceiptOwnership(effectiveReceipts, request, canonicalTarget)
        ) {
            return requiresSetupActionResult(
                request,
                paths,
                'Claude Code marketplace ownership changed before repair.',
                'Preserve the externally managed marketplace and repair it manually.',
                'Reread Claude Code ownership before repair',
            );
        }
        if (manager.marketplace === 'absent' && manager.plugin === 'present') {
            return requiresSetupActionResult(
                request,
                paths,
                'Claude Code plugin ownership changed before repair.',
                'Resolve the ambiguous manager state manually; no duplicate activation was added.',
                'Reread Claude Code manager state before repair',
            );
        }
        const priorMarketplaceReceipt = findClaudeReceiptOwnership(
            effectiveReceipts,
            request,
            canonicalTarget,
        );
        return executeClaudeCodeSetupTransaction(
            request,
            paths,
            dataDir,
            canonicalTarget,
            receiptBasePath,
            executor,
            manager,
            priorMarketplaceReceipt !== null,
            priorMarketplaceReceipt?.receipt.id ?? null,
            options,
        );
    } finally {
        await lock.release();
    }
}

async function executeClaudeCodeSetupTransaction(
    request: SetupRequest,
    paths: SetupPaths,
    dataDir: string,
    canonicalTarget: string,
    receiptBasePath: string,
    executor: ClaudeCommandExecutor,
    initialManager: ClaudeManagerInspection,
    priorMarketplaceOwned: boolean,
    supersedesReceiptId: string | null,
    options: SetupEngineOptions,
): Promise<SetupResult> {
    const receiptPaths = resolveSetupReceiptPaths(receiptBasePath, nextReceiptId(options));
    const startedAt = transactionNow(options);
    let receipt = createSetupReceipt({
        id: basename(dirname(receiptPaths.receiptPath)),
        operation: 'setup',
        status: 'in_progress',
        harness: request.harness,
        scope: request.scope,
        target: canonicalTarget,
        package_version: getVersion(),
        force: request.force,
        ...(supersedesReceiptId ? {supersedes: supersedesReceiptId} : {}),
        started_at: startedAt,
        updated_at: startedAt,
        steps: [
            {
                id: 'claude-marketplace',
                kind: 'external_command',
                outcome: initialManager.marketplace === 'present'
                    ? priorMarketplaceOwned ? 'confirmed' : 'skipped'
                    : 'planned',
                external_scope: request.scope,
                owned_key: 'claude-marketplace:thoth-mem',
            },
            {
                id: 'claude-plugin',
                kind: 'external_command',
                outcome: initialManager.plugin === 'present' ? 'skipped' : 'planned',
                external_scope: request.scope,
                owned_key: 'claude-plugin:thoth-mem@thoth-mem',
            },
            {id: 'verify', kind: 'verification', outcome: 'planned'},
        ],
    });
    const initialPersisted = await persistReceiptCheckpoint(
        receiptPaths.receiptPath,
        receiptBasePath,
        receipt,
        dataDir,
        options,
    );
    if (!initialPersisted.ok) {
        return receiptFailureResult(request, paths, false, null, 'Claude Code setup could not persist write-ahead receipt evidence.');
    }
    receipt = initialPersisted.receipt as SetupReceiptV1;
    await traceSetup(options, 'receipt_in_progress', receiptPaths.receiptPath);

    let manager = initialManager;
    let changed = false;
    for (const operation of claudeRequiredOperations(manager)) {
        const result = await runClaudeCodeManagerOperation({
            executor,
            operation,
            scope: request.scope,
            ...(request.projectPath ? {projectPath: request.projectPath} : {}),
        });
        manager = await inspectClaudeCodeManager({
            executor,
            scope: request.scope,
            ...(request.projectPath ? {projectPath: request.projectPath} : {}),
        });
        changed = changed || claudeOperationConfirmed(operation, manager);
        const stepId = operation === 'marketplace-add' ? 'claude-marketplace' : 'claude-plugin';
        if (result.ok && claudeOperationConfirmed(operation, manager)) {
            const checkpointed = await persistClaudeReceiptStatus(
                receiptPaths.receiptPath,
                receiptBasePath,
                receipt,
                stepId,
                'confirmed',
                'in_progress',
                dataDir,
                options,
            );
            if (!checkpointed.ok) {
                return receiptFailureResult(request, paths, changed, receiptPaths.receiptPath, 'Claude Code setup command completed but its receipt checkpoint could not be confirmed.');
            }
            receipt = checkpointed.receipt;
            continue;
        }
        if (result.interrupted) {
            const checkpointed = await persistClaudeReceiptStatus(
                receiptPaths.receiptPath,
                receiptBasePath,
                receipt,
                stepId,
                claudeOperationConfirmed(operation, manager) ? 'confirmed' : 'failed',
                'partial',
                dataDir,
                options,
            );
            return checkpointed.ok
                ? claudeManagerResult(request, paths, manager, changed, receiptPaths.receiptPath, 'partial')
                : receiptFailureResult(request, paths, changed, receiptPaths.receiptPath, 'Interrupted Claude Code setup ownership could not be checkpointed.');
        }
        const partial = await persistClaudeReceiptStatus(
            receiptPaths.receiptPath,
            receiptBasePath,
            receipt,
            stepId,
            'failed',
            'partial',
            dataDir,
            options,
        );
        return partial.ok
            ? claudeManagerResult(request, paths, manager, changed, receiptPaths.receiptPath, 'partial')
            : receiptFailureResult(request, paths, changed, receiptPaths.receiptPath, 'Claude Code setup failed and its partial receipt could not be persisted.');
    }

    if (manager.status !== 'ready' || manager.marketplace !== 'present' || manager.plugin !== 'present') {
        return claudeManagerResult(request, paths, manager, changed, receiptPaths.receiptPath, 'partial');
    }
    const completed = await persistClaudeReceiptStatus(
        receiptPaths.receiptPath,
        receiptBasePath,
        receipt,
        'verify',
        'confirmed',
        'complete',
        dataDir,
        options,
    );
    if (!completed.ok) {
        return receiptFailureResult(request, paths, changed, receiptPaths.receiptPath, 'Claude Code setup completed but its final receipt could not be confirmed.');
    }
    await traceSetup(options, 'receipt_complete', receiptPaths.receiptPath);
    return claudeManagerResult(request, paths, manager, changed, receiptPaths.receiptPath, 'complete');
}

async function executeClaudeCodeRollback(
    request: SetupRequest,
    paths: SetupPaths,
    dataDir: string,
    canonicalTarget: string,
    receiptBasePath: string,
    scanned: Array<{ path: string; receipt: SetupReceipt }>,
    executor: ClaudeCommandExecutor,
    manager: ClaudeManagerInspection,
    options: SetupEngineOptions,
): Promise<SetupResult> {
    const selectedPath = request.rollbackReceipt!;
    const selected = scanned.find(({path}) => resolve(path) === resolve(selectedPath));
    if (!selected || !isClaudeSetupReceipt(selected.receipt, request, canonicalTarget)) {
        return requiresSetupActionResult(
            request,
            paths,
            'The selected receipt is not a verified Claude Code setup receipt for this target.',
            'Select the original verified Claude Code setup receipt; --force cannot bypass receipt verification.',
            'Verify Claude Code rollback receipt',
        );
    }
    let receipt = selected.receipt;
    if (receipt.status === 'rolled_back') return claudeManagerResult(request, paths, manager, false, null, 'complete');
    if ((receipt.status !== 'complete' && receipt.status !== 'partial') || !manager.removalReady || manager.status !== 'ready') {
        return requiresSetupActionResult(
            request,
            paths,
            'Claude Code rollback lacks verified receipt ownership or manager removal capability.',
            'Use the documented Claude Code manager workflow manually; no manager cache was removed.',
            'Validate Claude Code rollback ownership',
        );
    }
    let pluginOwned = receipt.steps.some((step) => step.id === 'claude-plugin' && step.outcome === 'confirmed');
    let marketplaceOwned = receipt.steps.some((step) => step.id === 'claude-marketplace' && step.outcome === 'confirmed');
    const lock = await acquireSetupTargetLock(dataDir, request.harness, request.scope, paths.targetRoot);
    if (!lock.ok) {
        return requiresSetupActionResult(request, paths, 'The selected Claude Code rollback target is locked or unavailable.', 'Wait for the active operation to finish, then retry rollback.', 'Acquire Claude Code rollback lock');
    }
    try {
        await traceSetup(options, 'lock_acquired');
        const lockedScanned = await scanSetupReceipts(receiptBasePath, {
            dataDir,
            expectedBasePath: receiptBasePath,
        });
        if (!lockedScanned.ok) {
            return requiresSetupActionResult(
                request,
                paths,
                'Claude Code receipt integrity changed before rollback removal.',
                'Restore the verified receipt key and receipt topology before retrying.',
                'Reread Claude Code rollback receipt',
            );
        }
        const lockedSelected = lockedScanned.receipts.find(({path}) => resolve(path) === resolve(selectedPath));
        if (!lockedSelected || !isClaudeSetupReceipt(lockedSelected.receipt, request, canonicalTarget)) {
            return requiresSetupActionResult(
                request,
                paths,
                'Claude Code rollback receipt changed before removal.',
                'Select the original verified receipt and retry; no manager command was run.',
                'Reread Claude Code rollback receipt',
            );
        }
        receipt = lockedSelected.receipt;
        if (receipt.status === 'rolled_back') return claudeManagerResult(request, paths, manager, false, null, 'complete');
        if (receipt.status !== 'complete' && receipt.status !== 'partial') {
            return requiresSetupActionResult(
                request,
                paths,
                'Claude Code rollback receipt is not complete or safely checkpointed partial state.',
                'Recover or inspect the receipt manually before rollback.',
                'Validate Claude Code rollback receipt state',
            );
        }
        if (hasClaudeSupersedingRecovery(lockedScanned.receipts, receipt, request, canonicalTarget)) {
            return requiresSetupActionResult(
                request,
                paths,
                'A later verified Claude Code recovery receipt now owns this rollback authority.',
                'Use the active recovery receipt for rollback; no manager command was run.',
                'Validate active Claude Code rollback authority',
            );
        }
        if (!await hasClaudePackageIdentity(paths) || await hasManualClaudeConfiguration(paths)) {
            return requiresSetupActionResult(
                request,
                paths,
                'Claude Code package identity or settings changed before rollback removal.',
                'Resolve the selected scope manually and retry; no manager command was run.',
                'Reread Claude Code coexistence state',
            );
        }
        manager = await inspectClaudeCodeManager({
            executor,
            scope: request.scope,
            ...(request.projectPath ? {projectPath: request.projectPath} : {}),
        });
        if (!manager.removalReady || manager.status !== 'ready') {
            return requiresSetupActionResult(
                request,
                paths,
                'Claude Code manager ownership changed before rollback removal.',
                'Resolve the manager state manually; no manager command was run.',
                'Reread Claude Code manager ownership',
            );
        }
        pluginOwned = receipt.steps.some((step) => step.id === 'claude-plugin' && step.outcome === 'confirmed');
        marketplaceOwned = receipt.steps.some((step) => step.id === 'claude-marketplace' && step.outcome === 'confirmed');
        let changed = false;
        if (pluginOwned && manager.plugin === 'present') {
            const removed = await runClaudeCodeManagerOperation({
                executor,
                operation: 'plugin-uninstall',
                scope: request.scope, ...(request.projectPath ? {projectPath: request.projectPath} : {})
            });
            manager = await inspectClaudeCodeManager({
                executor,
                scope: request.scope, ...(request.projectPath ? {projectPath: request.projectPath} : {})
            });
            if (!removed.ok || manager.status !== 'ready' || manager.plugin !== 'absent') return claudeManagerResult(request, paths, manager, changed, selectedPath, 'partial');
            changed = true;
        }
        if (marketplaceOwned && manager.marketplace === 'present') {
            const removed = await runClaudeCodeManagerOperation({
                executor,
                operation: 'marketplace-remove',
                scope: request.scope, ...(request.projectPath ? {projectPath: request.projectPath} : {})
            });
            manager = await inspectClaudeCodeManager({
                executor,
                scope: request.scope, ...(request.projectPath ? {projectPath: request.projectPath} : {})
            });
            if (!removed.ok || manager.status !== 'ready' || manager.marketplace !== 'absent') return claudeManagerResult(request, paths, manager, changed, selectedPath, 'partial');
            changed = true;
        }
        const rolledBack = await persistSetupReceipt(selectedPath, {
            ...receipt,
            status: 'rolled_back',
            updated_at: transactionNow(options),
        }, {dataDir, expectedBasePath: receiptBasePath, fault: options.transaction?.receiptFault});
        if (!rolledBack.ok) return receiptFailureResult(request, paths, changed, selectedPath, 'Claude Code rollback completed but the receipt could not be updated.');
        return claudeManagerResult(request, paths, manager, changed, null, 'complete');
    } finally {
        await lock.release();
    }
}

function claudeRequiredOperations(manager: ClaudeManagerInspection): ClaudeManagerOperation[] {
    const operations: ClaudeManagerOperation[] = [];
    if (manager.marketplace === 'absent') operations.push('marketplace-add');
    if (manager.plugin === 'absent') operations.push('plugin-install');
    return operations;
}

function claudeOperationConfirmed(operation: ClaudeManagerOperation, manager: ClaudeManagerInspection): boolean {
    return operation === 'marketplace-add' ? manager.marketplace === 'present' : manager.plugin === 'present';
}

async function persistClaudeReceiptStatus(
    receiptPath: string,
    receiptBasePath: string,
    receipt: SetupReceiptV1,
    stepId: string,
    outcome: SetupStepOutcome,
    status: SetupReceiptV1['status'],
    dataDir: string,
    options: SetupEngineOptions,
): Promise<{ ok: true; receipt: SetupReceiptV1 } | { ok: false }> {
    const updated: SetupReceiptV1 = {
        ...receipt,
        status,
        updated_at: transactionNow(options),
        steps: receipt.steps.map((step) => step.id === stepId ? {...step, outcome} : step),
    };
    const persisted = await persistReceiptCheckpoint(receiptPath, receiptBasePath, updated, dataDir, options);
    return persisted.ok ? {ok: true, receipt: persisted.receipt as SetupReceiptV1} : {ok: false};
}

function claudeManagerResult(
    request: SetupRequest,
    paths: SetupPaths,
    manager: ClaudeManagerInspection,
    changed: boolean,
    receipt: string | null,
    status: SetupResult['status'] = manager.status === 'ready' ? 'complete' : manager.status,
): SetupResult {
    return {
        status,
        changed,
        harness: request.harness,
        scope: request.scope,
        target: paths.targetRoot,
        steps: [
            {name: 'Inspect package-owned Claude Code marketplace identity', outcome: 'confirmed'},
            {
                name: 'Inspect Claude Code manager capability and ownership',
                outcome: manager.status === 'ready' ? 'confirmed' : 'unavailable'
            },
            {
                name: 'Verify Claude Code manager state',
                outcome: status === 'complete' ? 'confirmed' : status === 'partial' ? 'failed' : 'unavailable'
            },
        ],
        diagnostics: manager.diagnostics,
        manual_actions: manager.manualActions,
        receipt,
    };
}

function hasClaudeReceiptOwnership(
    receipts: Array<{ path: string; receipt: SetupReceipt }>,
    request: SetupRequest,
    canonicalTarget: string,
): boolean {
    return findClaudeReceiptOwnership(receipts, request, canonicalTarget) !== null;
}

function findClaudeReceiptOwnership(
    receipts: Array<{ path: string; receipt: SetupReceipt }>,
    request: SetupRequest,
    canonicalTarget: string,
): { path: string; receipt: SetupReceiptV1 } | null {
    for (const entry of receipts) {
        const receipt = entry.receipt;
        if (
            isClaudeSetupReceipt(receipt, request, canonicalTarget)
            && (receipt.status === 'complete' || receipt.status === 'partial')
            && receipt.steps.some((step) => step.id === 'claude-marketplace' && step.outcome === 'confirmed')
            && !hasClaudeSupersedingRecovery(receipts, receipt, request, canonicalTarget)
        ) {
            return {path: entry.path, receipt};
        }
    }
    return null;
}

function hasClaudeSupersedingRecovery(
    receipts: Array<{ path: string; receipt: SetupReceipt }>,
    predecessor: SetupReceiptV1,
    request: SetupRequest,
    canonicalTarget: string,
): boolean {
    return receipts.some(({receipt}) => (
        isClaudeSetupReceipt(receipt, request, canonicalTarget)
        && receipt.supersedes === predecessor.id
        && (receipt.status === 'complete' || receipt.status === 'partial' || receipt.status === 'rolled_back')
    ));
}

function isClaudeSetupReceipt(
    receipt: SetupReceipt,
    request: SetupRequest,
    canonicalTarget: string,
): receipt is SetupReceiptV1 {
    return receipt.schema_version === 1
        && receipt.operation === 'setup'
        && receipt.harness === 'claude'
        && receipt.scope === request.scope
        && resolve(receipt.target) === resolve(canonicalTarget)
        && receipt.steps.some((step) => step.id === 'claude-marketplace' && step.kind === 'external_command')
        && receipt.steps.some((step) => step.id === 'claude-plugin' && step.kind === 'external_command')
        && receipt.steps.some((step) => step.id === 'verify' && step.kind === 'verification');
}


function isResumableClaudeReceipt(
    receipt: SetupReceipt,
    request: SetupRequest,
    canonicalTarget: string,
): receipt is SetupReceiptV1 {
    return isClaudeSetupReceipt(receipt, request, canonicalTarget)
        && receipt.status === 'in_progress'
        && receipt.steps.some((step) => step.id === 'claude-marketplace' && step.outcome === 'confirmed')
        && receipt.steps.some((step) => step.id === 'claude-plugin' && step.outcome !== 'confirmed');
}

function receiptPathFor(receiptBasePath: string, id: string): string {
    return resolveSetupReceiptPaths(receiptBasePath, id).receiptPath;
}

async function hasClaudePackageIdentity(paths: SetupPaths): Promise<boolean> {
    const manifest = await readRegularFileOrNull(join(paths.sourceAssetsPath, 'marketplace.json'));
    if (manifest === null) return false;
    try {
        const parsed = JSON.parse(manifest) as Record<string, unknown>;
        const plugins = parsed.plugins;
        return parsed.name === 'thoth-mem'
            && Array.isArray(plugins)
            && plugins.length === 1
            && isRecord(plugins[0])
            && plugins[0].name === 'thoth-mem'
            && plugins[0].source === './integrations/claude-code';
    } catch {
        return false;
    }
}

async function hasManualClaudeConfiguration(paths: SetupPaths): Promise<boolean> {
    let config: string | null;
    try {
        config = await readRegularFileOrNull(paths.configPath);
    } catch {
        return true;
    }
    if (config === null) return false;
    try {
        const parsed = JSON.parse(config);
        if (!isRecord(parsed)) return true;
        if (parsed.mcpServers === undefined) return false;
        return !isRecord(parsed.mcpServers) || Object.hasOwn(parsed.mcpServers, 'thoth-mem');
    } catch {
        return true;
    }
}


    function failedInspectionResult(
      request: SetupRequest,
      target: string,
      sourceAssetsPath: string,
    ): SetupResult {
      return {
        status: 'failed',
        changed: false,
        harness: request.harness,
        scope: request.scope,
        target,
        steps: [{
          name: `Inspect packaged Claude Code assets: ${sourceAssetsPath}`,
          outcome: 'failed',
        }],
        diagnostics: ['Unable to inspect the packaged Claude Code setup assets or selected target.'],
        manual_actions: ['Verify filesystem permissions and that the installed package contains the required integration assets.'],
        receipt: null,
      };
    }

    function invalidPathResult(request: SetupRequest): SetupResult {
      return {
        status: 'failed',
        changed: false,
        harness: request.harness,
        scope: request.scope,
        target: request.projectPath ?? 'unresolved global target',
        steps: [{ name: 'Validate setup paths', outcome: 'failed' }],
        diagnostics: ['Setup paths must be non-empty, absolute roots and remain in the selected scope.'],
        manual_actions: ['Provide a valid explicit project path for project scope and retry.'],
        receipt: null,
      };
    }

    function requiresSetupActionResult(
      request: SetupRequest,
      paths: SetupPaths,
      diagnostic: string,
      manualAction: string,
      stepName = 'Validate setup transaction state',
    ): SetupResult {
      return {
        status: 'requires_user_action',
        changed: false,
        harness: request.harness,
        scope: request.scope,
        target: paths.targetRoot,
        steps: [{ name: stepName, outcome: 'unavailable' }],
        diagnostics: [diagnostic],
        manual_actions: [manualAction],
        receipt: null,
      };
    }

    function canonicalDataDir(
      options: SetupEngineOptions,
      roots: SetupRoots,
      mutating: boolean,
    ): string {
      if (mutating) return getConfig(options.dataDir ? { dataDir: options.dataDir } : {}).dataDir;
      return options.dataDir ?? process.env.THOTH_DATA_DIR ?? join(roots.homeDir, '.thoth');
    }

    function setupReceiptBasePath(
      request: SetupRequest,
      paths: SetupPaths,
      dataDir: string,
    ): string {
      return request.scope === 'global'
        ? join(dataDir, 'setup', 'receipts')
        : join(dirname(paths.targetRoot), '.thoth', 'setup', 'receipts');
    }

    function transactionNow(options: SetupEngineOptions): string {
      return (options.transaction?.now?.() ?? new Date()).toISOString();
    }

    function nextReceiptId(options: SetupEngineOptions): string {
      return options.transaction?.idFactory?.() ?? randomUUID();
    }

    async function traceSetup(options: SetupEngineOptions, kind: string, path?: string): Promise<void> {
      try {
        await options.transaction?.trace?.({ kind, ...(path ? { path } : {}) });
      } catch {
        // Trace observers are diagnostic-only and cannot change transaction state.
      }
    }

    async function persistReceiptCheckpoint(
      receiptPath: string,
      receiptBasePath: string,
      receipt: SetupReceipt,
      dataDir: string,
      options: SetupEngineOptions,
    ) {
      return persistSetupReceipt(receiptPath, receipt, {
        dataDir,
        expectedBasePath: receiptBasePath,
        fault: options.transaction?.receiptFault,
      });
    }

    function receiptFailureResult(
      request: SetupRequest,
      paths: SetupPaths,
      changed: boolean,
      receiptPath: string | null,
      diagnostic: string,
    ): SetupResult {
      return {
        status: 'failed', changed, harness: request.harness, scope: request.scope, target: paths.targetRoot,
        steps: [{ name: 'Apply receipt-backed setup transaction', outcome: 'failed' }], diagnostics: [diagnostic],
        manual_actions: changed
          ? ['Inspect the verified in-progress receipt before retrying or rolling back.']
          : ['No setup target change remains; review the failed receipt before retrying.'],
        receipt: receiptPath,
      };
    }

    function isMissingPathError(error: unknown): boolean {
      return error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT';
    }

    async function readRegularFileOrNull(path: string): Promise<string | null> {
      try {
        const details = await lstat(path);
        if (!details.isFile() || details.isSymbolicLink()) throw new Error('setup-file-not-regular');
        return readFile(path, 'utf8');
      } catch (error) {
        if (isMissingPathError(error)) return null;
        throw error;
      }
    }

    function isRecord(value: unknown): value is Record<string, unknown> {
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    }

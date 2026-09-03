import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { validateIntegrationInventory, type IntegrationInventory } from '../../src/integration/package-inventory.js';

describe('canonical integration package inventory', () => {
  const inventory = JSON.parse(readFileSync('integrations/inventory.json', 'utf8')) as IntegrationInventory;

  it('ships the bounded memory workflow and durable semantic-boundary contract', () => {
    const skill = readFileSync(join('plugin', 'skills', 'thoth-mem', 'SKILL.md'), 'utf8');
    const toolNames = [...skill.matchAll(/`(mem_[a-z]+)`/gu)].map((match) => match[1]);

    expect(new Set(toolNames)).toEqual(new Set([
      'mem_save',
      'mem_recall',
      'mem_context',
      'mem_get',
      'mem_project',
      'mem_session',
    ]));
    expect(skill).toMatch(/recall prior project context[\s\S]*save durable decisions[\s\S]*continuation handoff/iu);
    expect(skill).toMatch(/compact[\s\S]*context[\s\S]*selected[\s\S]*`mem_get`/iu);
    expect(skill).toMatch(/before acting[\s\S]*at a durable boundary[\s\S]*before meaningful work ends/iu);
    expect(skill).toMatch(/architecture[\s\S]*root\s+cause|root\s+cause[\s\S]*architecture/iu);
    expect(skill).toMatch(/convention[\s\S]*completed change[\s\S]*later work/iu);
    expect(skill).toMatch(/Objective[\s\S]*Completed[\s\S]*First pending action[\s\S]*Blockers[\s\S]*Key files\/checks/u);
    expect(skill).toMatch(/evidence\.kind="handoff"[\s\S]*memory\.kind="handoff"/u);
    expect(skill).toMatch(/transient status[\s\S]*speculation[\s\S]*raw logs[\s\S]*canonical artifact/iu);
    for (const excluded of [/transcripts/iu, /generated\s+prompts/iu, /assistant\s+reasoning/iu, /tool\s+streams/iu, /delegated\s+output/iu]) {
      expect(skill, excluded.source).toMatch(excluded);
    }
    expect(skill).toMatch(/<private>[\s\S]*credentials[\s\S]*secrets/iu);
    expect(skill).toMatch(/root_session_key[\s\S]*(?:together|paired)[\s\S]*harness/iu);
    expect(skill).toMatch(/project-only[\s\S]*(?:unattributed|without claiming session continuity)/iu);
    expect(skill).toMatch(/confirmed recalled or saved record ids[\s\S]*project[\s\S]*session bounds[\s\S]*(?:degraded|unattributed|not confirmed)/iu);
    expect(skill).toMatch(/`mem_session`[\s\S]*actual[\s\S]*lifecycle\s+event/iu);
    expect(skill).not.toMatch(/dashboard|observatory|community|graph|vector|hyde|http administration/iu);
    expect(skill).not.toMatch(/mem_session\s*\(\s*action|session_id|include_timeline|max_length|navigation="community"/iu);
  });

  it('teaches one direct promoted-memory authoring convention across packaged skills', () => {
    const skillPaths = [
      join('plugin', 'skills', 'thoth-mem', 'SKILL.md'),
      ...['opencode', 'codex', 'claude-code'].map((harness) => join('integrations', harness, 'skills', 'thoth-mem', 'SKILL.md')),
    ];
    const skills = skillPaths.map((path) => readFileSync(path, 'utf8'));

    expect(new Set(skills)).toHaveLength(1);
    for (const [index, skill] of skills.entries()) {
      expect(skill, skillPaths[index]).toMatch(/direct promoted memory[\s\S]*other than a handoff/iu);
      expect(skill, skillPaths[index]).toMatch(/`Result`:[\s\S]*`Rationale`:[\s\S]*`Scope`:[\s\S]*`Caveat \/ safe action`:/u);
      expect(skill, skillPaths[index]).toMatch(/omit[\s\S]*Scope[\s\S]*Caveat \/ safe action[\s\S]*do not apply[\s\S]*do not invent/iu);
      expect(skill, skillPaths[index]).toMatch(/authoring convention[\s\S]*free-text `memory\.content`[\s\S]*not[\s\S]*new fields/iu);
      expect(skill, skillPaths[index]).toMatch(/do not impose[\s\S]*evidence[\s\S]*observation records[\s\S]*session summaries[\s\S]*handoffs/iu);
    }
  });

  it('teaches timeline routing and bounded expansion across packaged skills', () => {
    const skillPaths = [join('plugin', 'skills', 'thoth-mem', 'SKILL.md'), ...['opencode', 'codex', 'claude-code'].map((harness) => join('integrations', harness, 'skills', 'thoth-mem', 'SKILL.md'))];
    for (const path of skillPaths) {
      const skill = readFileSync(path, 'utf8');
      expect(skill, path).toMatch(/topic|query[\s\S]*chronolog/iu);
      expect(skill, path).toMatch(/mem_project[\s\S]*action[=:]timeline/iu);
      expect(skill, path).toMatch(/nextCursor[\s\S]*only as needed/iu);
      expect(skill, path).toMatch(/historical entries[\s\S]*untrusted context/iu);
      expect(skill, path).toMatch(/stable IDs[\s\S]*mem_get/iu);
      expect(skill, path).toMatch(/not raw (?:session|activity)[\s\S]*history/iu);
      expect(skill, path).not.toMatch(/include_timeline/iu);
    }
  });

  it('owns one exact hook, MCP, Skill/reference, adapter runner, and manifest bundle per harness', () => {
    const valid = validateIntegrationInventory(inventory);
    expect(valid.shared).toEqual(['hook-runner.mjs']);
    expect(existsSync(join('integrations', 'shared', valid.shared[0]!))).toBe(true);
    for (const [harness, assets] of Object.entries(valid.harnesses)) {
      for (const asset of assets) expect(existsSync(join('integrations', harness, asset)), `${harness}:${asset}`).toBe(true);
      const combined = assets.map((asset) => readFileSync(join('integrations', harness, asset), 'utf8')).join('\n');
      expect(combined).not.toMatch(/dashboard|observatory|sqlite-vec|hyde/i);
    }

    for (const harness of ['codex', 'claude-code']) {
      const runner = readFileSync(join('integrations', harness, 'runner.mjs'), 'utf8');
      expect(runner).toContain("plugin', 'runners', 'public-runner.mjs");
      expect(runner).not.toMatch(/recovery\?\.items|items\.map|recovered context/iu);
    }

    const opencode = readFileSync(join('integrations', 'opencode', 'skills', 'thoth-mem', 'references', 'opencode.md'), 'utf8');
    expect(opencode).toMatch(/thoth_mem_root_identity/);
    expect(opencode).toMatch(/root_session_key/);
    expect(opencode).toMatch(/authorization/);
    expect(opencode).toMatch(/observation_review[\s\S]*observation_promotion[\s\S]*root_lifecycle/u);

    for (const [harness, reference, expected] of [
      ['codex', 'codex.md', /CODEX_THREAD_ID[\s\S]*list_threads[\s\S]*root_session_key/],
      ['claude-code', 'claude-code.md', /session_id[\s\S]*cwd[\s\S]*CLAUDE_SESSION_ID[\s\S]*root_session_key/],
    ] as const) {
      const canonical = readFileSync(join('integrations', harness, 'skills', 'thoth-mem', 'references', reference), 'utf8');
      expect(canonical).toMatch(expected);
      expect(canonical).toMatch(/observation_review[\s\S]*observation_promotion[\s\S]*review and promotion may not/u);
      expect(readFileSync(join('plugin', 'skills', 'thoth-mem', 'references', reference), 'utf8')).toBe(canonical);
    }
  });

  it('rejects missing, duplicate, cross-owner, standalone identity-asset, and deferred inventory entries', () => {
    const clone = (): IntegrationInventory => structuredClone(inventory);
    const missing = clone(); missing.harnesses.codex.pop(); expect(() => validateIntegrationInventory(missing)).toThrow(/incomplete/i);
    const duplicate = clone(); duplicate.harnesses.opencode.push(duplicate.harnesses.opencode[0]!); expect(() => validateIntegrationInventory(duplicate)).toThrow(/duplicate/i);
    const identity = clone(); identity.harnesses.opencode[0] = 'identity-tool.mjs'; expect(() => validateIntegrationInventory(identity)).toThrow(/invalid|deferred/i);
    const deferred = clone(); deferred.harnesses.codex[0] = 'dashboard/manifest.json'; expect(() => validateIntegrationInventory(deferred)).toThrow(/invalid|deferred/i);
    const extraOwner = clone(); extraOwner.harnesses.shared = []; expect(() => validateIntegrationInventory(extraOwner)).toThrow(/exactly three/i);
    const duplicateShared = clone(); duplicateShared.shared.push('hook-runner.mjs'); expect(() => validateIntegrationInventory(duplicateShared)).toThrow(/shared runner/i);
  });
});

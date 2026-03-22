import { describe, it, expect } from 'vitest';
import { ALL_TOOLS, getToolCount } from '../../src/tools/index.js';

describe('Tool Registry', () => {
  it('has 13 tools total', () => {
    expect(ALL_TOOLS).toHaveLength(13);
  });

  it('agent profile has 10 tools', () => {
    expect(getToolCount(['agent'])).toBe(10);
  });

  it('admin profile has 3 tools', () => {
    expect(getToolCount(['admin'])).toBe(3);
  });

  it('both profiles combined has 13 tools', () => {
    expect(getToolCount(['agent', 'admin'])).toBe(13);
  });

  it('empty profile array returns 0 tools', () => {
    expect(getToolCount([])).toBe(0);
  });

  it('all agent tools have correct profile', () => {
    const agentTools = ALL_TOOLS.filter(t => t.profile === 'agent');
    expect(agentTools).toHaveLength(10);
    const names = agentTools.map(t => t.name);
    expect(names).toContain('mem_save');
    expect(names).toContain('mem_search');
    expect(names).toContain('mem_context');
    expect(names).toContain('mem_get_observation');
    expect(names).toContain('mem_session_start');
    expect(names).toContain('mem_session_summary');
    expect(names).toContain('mem_suggest_topic_key');
    expect(names).toContain('mem_capture_passive');
    expect(names).toContain('mem_save_prompt');
    expect(names).toContain('mem_update');
  });

  it('all admin tools have correct profile', () => {
    const adminTools = ALL_TOOLS.filter(t => t.profile === 'admin');
    expect(adminTools).toHaveLength(3);
    const names = adminTools.map(t => t.name);
    expect(names).toContain('mem_delete');
    expect(names).toContain('mem_stats');
    expect(names).toContain('mem_timeline');
  });

  it('no tool appears in both profiles', () => {
    const agentNames = ALL_TOOLS.filter(t => t.profile === 'agent').map(t => t.name);
    const adminNames = ALL_TOOLS.filter(t => t.profile === 'admin').map(t => t.name);
    const overlap = agentNames.filter(n => adminNames.includes(n));
    expect(overlap).toHaveLength(0);
  });

  it('all tool names are unique', () => {
    const names = ALL_TOOLS.map(t => t.name);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(names.length);
  });
});

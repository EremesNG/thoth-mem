import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { beginRequest, boundedError, canCommitRequest, createResourceState, deriveGraphPhase, type ResourcePhase } from '../../dashboard/src/components/observatory/resource-state.js';
import ResourceStateNotice from '../../dashboard/src/components/observatory/ResourceStateNotice.js';

const dashboardRequire = createRequire(new URL('../../dashboard/package.json', import.meta.url));
const { createElement } = dashboardRequire('react');
const { renderToStaticMarkup } = dashboardRequire('react-dom/server');

describe('observatory resource state', () => {
  it('rejects stale request completions', () => {
    const first = beginRequest(createResourceState<string>());
    const second = beginRequest(first);
    expect(canCommitRequest(second, first.requestId)).toBe(false);
    expect(canCommitRequest(second, second.requestId)).toBe(true);
  });
  it('keeps failures bounded', () => expect(boundedError(new Error('x'.repeat(500)))).toHaveLength(320));
  it('renders nine distinct recoverable states with bounded next actions', () => {
    const phases:ResourcePhase[]=['empty','sparse','dense','truncated','exhausted','degraded','aborted','failed-inspection','retry'];
    const rendered = phases.map((phase) => renderToStaticMarkup(createElement(ResourceStateNotice, { phase, onAction: () => undefined })));
    expect(new Set(rendered).size).toBe(9);
    for (const [index, html] of rendered.entries()) {
      expect(html).toContain(`data-resource-notice="${phases[index]}"`);
      expect(html).toContain('<button');
      expect(html.length).toBeLessThan(500);
    }
  });
  it('derives live graph states rendered by the production notice', () => {
    const base={loading:false,hasData:true,nodeCount:4,dense:false,truncated:false,exhausted:false,degraded:false,error:false};
    expect(deriveGraphPhase({...base,hasData:false,nodeCount:0})).toBe('empty');
    expect(deriveGraphPhase({...base,truncated:true})).toBe('truncated');
    expect(deriveGraphPhase({...base,degraded:true})).toBe('degraded');
  });
});

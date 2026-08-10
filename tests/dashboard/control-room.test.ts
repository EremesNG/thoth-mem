import { describe, expect, it } from 'vitest';
import { buildCreateObservationPayload } from '../../dashboard/src/components/control-room/control-room-state.js';
import { withDashboardBrowser } from './dashboard-browser-harness.js';

describe('secondary control room', () => {
  it('preserves complete create scope', () => {
    expect(buildCreateObservationPayload({title:'t',content:'c',type:'decision',project:'p',sessionId:'s',topicKey:'k'})).toEqual({title:'t',content:'c',type:'decision',project:'p',session_id:'s',topic_key:'k'});
  });
  it('executes command outcomes and trace cleanup through the real production Control Room', async () => {
    await withDashboardBrowser(async (browser) => {
      await browser.goto('/console/operations'); await browser.waitFor(`document.querySelector('.control-room')`);
      await browser.waitFor(`document.querySelector('.control-room-scope[data-resource-state="ready"]')`);
      expect(await browser.count('.control-room [role="combobox"]')).toBe(4);
      expect(await browser.count('.admin-scope-row input:not([role="combobox"])')).toBe(0);
      await browser.click('.control-room [role="combobox"][aria-label="Project"]'); await browser.fill('.control-room [role="combobox"][aria-label="Project"]','browser'); await browser.key('ArrowDown'); await browser.key('Enter');
      await browser.waitFor(`document.querySelector('.control-room-scope[data-resource-state="ready"]') && document.querySelector('.control-room [role="combobox"][aria-label="Project"]')?.value === 'browser-nebula'`);
      await browser.click('.control-room [role="combobox"][aria-label="Session"]'); await browser.fill('.control-room [role="combobox"][aria-label="Session"]','browser-session'); await browser.key('ArrowDown'); await browser.key('Enter');
      await browser.click('.control-room [role="combobox"][aria-label="Topic"]'); await browser.fill('.control-room [role="combobox"][aria-label="Topic"]','browser/alpha'); await browser.key('ArrowDown'); await browser.key('Enter');
      await browser.fill('.control-panel input','Browser command'); await browser.fill('.control-panel textarea','Isolated command evidence');
      await browser.clickText('.control-panel button','Review and save'); await browser.waitFor(`document.querySelector('.confirm-dialog')?.open === true`);
      expect(await browser.text('.confirm-dialog')).toContain('browser-nebula / browser-session / browser/alpha'); await browser.clickText('.confirm-dialog button','Go back');
      expect(await browser.evaluate<boolean>(`document.querySelector('.confirm-dialog')?.open === false`)).toBe(true);

      const failure=`[private]ADMIN_SECRET[/private] ${'x'.repeat(500)}`; await browser.setRoutes([{includes:'/observations',method:'POST',status:500,body:failure,delayMs:300}]);
      await browser.clickText('.control-panel button','Review and save'); await browser.clickText('.confirm-dialog button','Run this change');
      await browser.waitFor(`[...document.querySelectorAll('.confirm-dialog button')].some((button)=>button.textContent?.includes('Working'))`); await browser.clickText('.confirm-dialog button','Working');
      await browser.waitFor(`document.querySelector('.command-evidence.degraded')`); const error=await browser.text('.command-evidence.degraded');
      expect(error).not.toContain('ADMIN_SECRET'); expect(error.length).toBeLessThanOrEqual(340);
      expect(browser.requests.filter((request)=>request.method==='POST'&&request.url.includes('/observations'))).toHaveLength(1);
      expect(browser.interceptedBodies[0]).toMatchObject({project:'browser-nebula',session_id:'browser-session',topic_key:'browser/alpha'});
      await browser.clearRoutes(); await browser.clickText('.confirm-dialog button','Go back'); await browser.clickText('.control-panel button','Review and save'); await browser.clickText('.confirm-dialog button','Run this change');
      await browser.waitFor(`document.querySelector('.command-evidence:not(.degraded)')`); expect((await browser.text('.command-evidence:not(.degraded)')).length).toBeLessThan(1_000);

      const base={origin:'http',status:'ok',project:'browser-nebula',session_id:null,started_at:'2026-01-01',finished_at:'2026-01-01',duration_ms:2,request_json:'{}',response_json:'{}',error:null,request_truncated:false,response_truncated:false,created_at:'2026-01-01'};
      const slow={...base,id:1,trace_id:'trace-slow',target:'<private>TRACE_SECRET</private> mem_save'}; const fast={...base,id:2,trace_id:'trace-fast',target:'[private]TRACE_SECRET_2[/private] mem_recall'};
      await browser.setRoutes([{includes:'/operation-traces/trace-slow',status:200,body:slow,delayMs:500},{includes:'/operation-traces/trace-fast',status:200,body:fast},{includes:'/operation-traces',status:200,body:{traces:[slow,fast],total:2}}]);
      await browser.goto('/console/traces'); await browser.waitFor(`document.querySelectorAll('.trace-tape li').length === 2`); expect(await browser.text('.control-room')).not.toContain('TRACE_SECRET');
      await browser.click('[role="combobox"][aria-label="Memory action"]');
      await browser.waitFor(`document.querySelector('[role="listbox"][aria-label="Memory action choices"]')`);
      const targetOptions = await browser.evaluate<Array<{id:string;text:string;value:string|null}>>(`[
        ...document.querySelectorAll('[role="listbox"][aria-label="Memory action choices"] [role="option"]')
      ].map((option) => ({ id: option.id, text: option.textContent ?? '', value: option.getAttribute('value') }))`);
      expect(targetOptions.map((option) => option.id + ' ' + (option.value ?? '')).join(' ')).not.toMatch(/TRACE_SECRET|\[?\/?private/i);
      expect(targetOptions.map((option) => option.text).join(' ')).not.toContain('TRACE_SECRET');
      const requestsBeforeTarget = browser.requests.length;
      await browser.clickText('[role="listbox"][aria-label="Memory action choices"] [role="option"]', 'mem_recall');
      await browser.waitFor(`document.querySelector('[role="combobox"][aria-label="Memory action"]')?.value.includes('mem_recall')`);
      await browser.evaluate(`new Promise((resolve) => setTimeout(resolve, 100))`);
      const targetRequest = browser.requests.slice(requestsBeforeTarget).find((request) => request.url.includes('/operation-traces?') && new URL(request.url).searchParams.has('target'));
      expect(targetRequest && new URL(targetRequest.url).searchParams.get('target')).toContain('mem_recall');
      await browser.clickText('.trace-tape li button','mem_recall'); await browser.waitFor(`document.querySelector('.trace-detail')?.textContent?.includes('trace-fast')`); expect(await browser.text('.trace-detail')).not.toContain('TRACE_SECRET');
      await browser.clickText('.trace-tape li button','mem_save'); await new Promise((resolve)=>setTimeout(resolve,75)); expect(browser.requests.some((request)=>request.url.includes('/operation-traces/trace-slow'))).toBe(true); await browser.goto('/console/indexing'); await new Promise((resolve)=>setTimeout(resolve,650));
      expect(await browser.count('.trace-detail')).toBe(0); expect(await browser.text('.control-room')).toContain('Index health'); await browser.clearRoutes();
    });
  },40_000);
});

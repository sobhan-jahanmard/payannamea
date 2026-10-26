const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const stages = require('../../common/stages.json');

(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.WORKER_UI_TEST_BROWSER || 'chrome' });
  try {
    const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
    const trace = { version: 1, trace_id: 'isolated-trace', order_id: 'fixture-order', nodes: [], edges: [], review_events: [], sessions: [], legacy_inferred: false };
    const append = (index, lane, status) => {
      const node = { id: `attempt-${trace.nodes.length + 1}`, step: stages[index].id, lane, status, started_at: '2026-10-22T10:00:00Z', finished_at: null, inferred: false, error: status === 'failed' ? 'خطای نمونه در خروجی' : '' };
      const previous = trace.nodes.at(-1);
      trace.nodes.push(node);
      if (previous) trace.edges.push({ id: `edge-${trace.edges.length + 1}`, source: previous.id, target: node.id, kind: previous.lane === lane ? 'forward' : 'retry', inferred: false });
    };
    for (let index = 0; index < 22; index++) append(index, 0, index === 21 ? 'failed' : 'succeeded');
    for (let index = 16; index < 22; index++) append(index, 1, index === 21 ? 'failed' : 'succeeded');
    for (let index = 16; index < 19; index++) append(index, 2, index === 18 ? 'running' : 'succeeded');
    trace.review_events.push({ id: 'review-test', review_id: 'test', after_attempt_id: 'attempt-22', status: 'completed', score: 14.5, created_at: '2026-10-22T11:00:00Z', started_at: '2026-10-22T11:01:00Z', finished_at: '2026-10-22T11:02:00Z', error: null });
    await page.addInitScript(({ trace, stages }) => {
      let listener;
      const state = { running: true, workspace: 'isolated', outputs: {}, context: { order_id: 'fixture-order', order: { title: 'آزمون مسیر اجرای پایان‌نامه', order_type: 'پایان‌نامه کارشناسی ارشد' }, status: 'in_progress', current_step: stages[18].id, completed_steps: stages.slice(0, 18).map(stage => stage.id), execution_trace: trace } };
      window.__graphFixture = { opened: [], update: patch => { Object.assign(state, patch); listener?.({ type: 'state', value: structuredClone(state) }); } };
      const forbidden = async () => { throw new Error('No worker mutations are permitted'); };
      window.workerPlus = {
        readState: async () => structuredClone(state), onEvent: callback => { listener = callback; return () => {}; },
        lookupOrder: async () => ({ id: 'other-order', order: { title: 'سفارش دیگر', order_type: 'تحقیق دانشگاهی' } }),
        openReport: async file => { window.__graphFixture.opened.push(file); },
        startRun: forbidden, resumeRun: forbidden, stopRun: forbidden, resetRun: forbidden
      };
    }, { trace, stages });
    await page.goto(process.env.WORKER_UI_TEST_URL || 'http://127.0.0.1:5174/');
    const graph = page.getByRole('region', { name: 'گراف مسیر اجرا' });
    await graph.getByText('۳۱ تلاش · ۲ برگشت / ادامهٔ مجدد · ۱ بازبینی AI', { exact: true }).waitFor();
    assert.equal(await graph.locator('.graph-node:not(.pending)').count(), 32);
    await graph.getByRole('button', { name: 'بازبینی هوش مصنوعی، نمره ۱۴٫۵ از ۲۰' }).click();
    await graph.locator('.graph-selection').getByText('بازبینی توسط هوش مصنوعی · نمره ۱۴٫۵ از ۲۰').waitFor();
    assert.equal(await graph.locator('.graph-edge.return[data-source-step="22"][data-target-step="17"]').count(), 2);
    assert(await graph.locator('.graph-edge').evaluateAll(edges => edges.every(edge => edge.getAttribute('marker-end')?.includes('url('))));
    assert.equal(await page.locator('.steps .step').count(), 22);
    const dimensions = await page.locator('.steps').evaluate(element => ({ height: element.clientHeight, scroll: element.scrollHeight, max: getComputedStyle(element).maxHeight, overflow: getComputedStyle(element).overflowY }));
    assert.equal(dimensions.max, 'none'); assert.equal(dimensions.overflow, 'visible'); assert(dimensions.scroll <= dimensions.height + 1);
    const graphBox = await graph.boundingBox(); const stepsBox = await page.locator('.timeline').boundingBox();
    assert(graphBox.x > stepsBox.x, 'Graph belongs to the right of the stage list');
    await graph.getByRole('button', { name: 'مرحلهٔ ۲۲، مسیر ۱، خطا', exact: true }).click();
    await graph.locator('.graph-selection').getByText('خطای نمونه در خروجی', { exact: true }).waitFor();
    await graph.getByRole('button', { name: 'باز کردن فایل تاریخچهٔ گراف' }).click();
    assert.deepEqual(await page.evaluate(() => window.__graphFixture.opened), ['reports/execution_graph.json']);
    if (process.env.WORKER_GRAPH_SCREENSHOT) await page.screenshot({ path: process.env.WORKER_GRAPH_SCREENSHOT, fullPage: true });
    await page.reload();
    await graph.getByText('۳۱ تلاش · ۲ برگشت / ادامهٔ مجدد · ۱ بازبینی AI', { exact: true }).waitFor();
    await page.locator('.searchbox input').fill('other-order');
    await page.getByRole('button', { name: 'پیدا کردن', exact: true }).click();
    await page.getByRole('heading', { name: 'سفارش دیگر', exact: true }).waitFor();
    assert.equal(await graph.locator('.graph-node:not(.pending)').count(), 0, 'Another order must not inherit this graph');
    console.log('Execution graph passed: directed returns, scored review node, parallel attempts, saved graph reload, node diagnostics and order isolation.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

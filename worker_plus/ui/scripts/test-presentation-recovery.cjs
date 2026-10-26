// Isolated browser fixture: validates profile instructions; no worker starts.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const stages = require('../../common/stages.json');
const hints = require('../../common/recovery_hints.json');
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
    await page.addInitScript(({ stages, hints }) => {
      const failure = { failed_step: '07_generate_content', restart_step: '07_generate_content', error: 'Slide 10: source quote/locator mismatch: S1.original_name' };
      const legacy = [hints.title, ...hints.patterns.filter(p => new RegExp(p.match, 'i').test(failure.error)).map(p => p.instruction), `${hints.stage_instruction}${failure.restart_step}: ${hints.stages[failure.restart_step]}`, hints.error_label + failure.error, hints.preserve, hints.verify].join('\n');
      failure.repair_note = legacy; failure.repair_note_version = hints.version;
      const order = { order_type: 'ارائه و پاورپوینت', title: 'آزمون بازیابی ارائه', quantity_type: 'slides', quantity_value: 10 };
      const state = { running: false, workspace: 'isolated-fixture', outputs: {}, context: { order_id: 'fixture', order, status: 'failed', completed_steps: stages.slice(0, 12).map(s => s.id), active_failure: failure, operator_note: 'یادداشت دستی کاربر\n\n' + legacy } };
      window.__runs = []; window.workerPlus = { readState: async () => state, onEvent: () => () => {}, startRun: async data => window.__runs.push(data) };
    }, { stages, hints });
    await page.goto(process.env.WORKER_UI_TEST_URL || 'http://127.0.0.1:5176/');
    await page.getByRole('heading', { name: 'آزمون بازیابی ارائه', exact: true }).waitFor();
    await page.waitForFunction(() => document.querySelector('#operator-note').value.includes('metadata_evidence'));
    const text = await page.locator('#operator-note').inputValue();
    assert(text.includes('یادداشت دستی کاربر')); assert(text.includes('پژوهش وب، داده یا محاسبهٔ جدید اضافه نکن'));
    assert(!text.includes('وب را واقعاً جست‌وجو کن')); assert(!text.includes('متن نهایی را از پژوهش و تحلیل انجام‌شده بنویس'));
    assert.deepEqual(await page.evaluate(() => window.__runs), []);
    console.log('Presentation recovery UI: source-only guide, legacy plan removed, manual note retained; no order run.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });

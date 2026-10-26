// Isolated UI fixture: no backend access or worker execution.
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const stages = require('../../common/stages.json');

(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.WORKER_UI_TEST_BROWSER || 'chrome' });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.addInitScript(stages => {
      let listener;
      const state = { running: true, workspace: 'isolated-fixture', outputs: {}, context: {
        order_id: 'fixture-active', order: { title: 'سفارش فعال برای بررسی ویجت', order_type: 'تحقیق دانشگاهی' },
        status: 'in_progress', current_step: stages[6].id, completed_steps: stages.slice(0, 6).map(stage => stage.id)
      } };
      window.__widgetFixture = { update: patch => { Object.assign(state, patch); listener?.({ type: 'state', value: structuredClone(state) }); } };
      const forbidden = async () => { throw new Error('Worker mutation is forbidden in this test'); };
      window.workerPlus = {
        readState: async () => structuredClone(state),
        resizeDesktopWidget: async () => {}, showMainWindow: async () => {},
        onEvent: callback => { listener = callback; return () => { listener = undefined; }; },
        lookupOrder: async () => ({ id: 'fixture-other', order: { title: 'سفارش انتخاب‌شدهٔ دیگر', status: 'submitted' } }),
        startRun: forbidden, resumeRun: forbidden, stopRun: forbidden, resetRun: forbidden
      };
    }, stages);
    await page.goto((process.env.WORKER_UI_TEST_URL || 'http://127.0.0.1:5174/').replace(/#.*$/, '') + '#run-widget');
    const widget = page.getByRole('complementary', { name: 'وضعیت زندهٔ اجرا' });
    await widget.getByText('مرحلهٔ ۷ · در حال اجرا', { exact: true }).waitFor();
    assert(await widget.getByText(stages[6].label, { exact: true }).isVisible());
    assert.equal(await page.locator('main').count(), 0, 'Desktop route renders only the widget');
    await widget.getByRole('button', { name: 'جمع کردن وضعیت اجرا' }).click();
    assert.equal(await widget.locator('#run-widget-details').count(), 0);
    await page.evaluate(() => window.__widgetFixture.update({ running: false, context: {
      order_id: 'fixture-active', order: { title: 'سفارش فعال برای بررسی ویجت' }, status: 'failed',
      completed_steps: [], active_failure: { failed_step: '05a_analyze_customer_sources', restart_step: '05a_analyze_customer_sources', error: 'خطای نمونه در خواندن منبع' }
    } }));
    await widget.getByText('مرحلهٔ ۷ · خطا در اجرا', { exact: true }).waitFor();
    await widget.getByRole('button', { name: 'باز کردن وضعیت اجرا' }).focus();
    await page.keyboard.press('Enter');
    await widget.getByText('خطای نمونه در خواندن منبع', { exact: true }).waitFor();
    const screenshot = process.env.WORKER_UI_WIDGET_SCREENSHOT;
    if (screenshot) await widget.screenshot({ path: path.resolve(screenshot) });
    assert(await widget.getByText('سفارش فعال برای بررسی ویجت', { exact: true }).isVisible());
    await page.evaluate(stages => window.__widgetFixture.update({ running: false, context: {
      order_id: 'fixture-active', status: 'in_progress', current_step: stages[6].id, completed_steps: stages.slice(0, 6).map(stage => stage.id)
    } }), stages);
    await widget.getByText('مرحلهٔ ۷ · متوقف', { exact: true }).waitFor();
    await page.evaluate(stages => window.__widgetFixture.update({ context: {
      order_id: 'fixture-active', status: 'dry_run_complete', completed_steps: stages.map(stage => stage.id)
    } }), stages);
    await widget.getByText('مرحلهٔ ۲۲ · کامل شد', { exact: true }).waitFor();
    assert.equal(await widget.getByRole('progressbar').getAttribute('aria-valuenow'), String(stages.length));
    await page.evaluate(() => window.__widgetFixture.update({ context: null }));
    await widget.getByText('آمادهٔ اجرا', { exact: true }).waitFor();
    await widget.getByRole('button', { name: 'جمع کردن وضعیت اجرا' }).click();
    await page.reload();
    await widget.getByRole('button', { name: 'باز کردن وضعیت اجرا' }).waitFor();
    assert.equal(await widget.locator('#run-widget-details').count(), 0, 'Collapse preference must survive reload');
    console.log('Run widget: live running/error/stopped/completed/idle states, isolated desktop route, keyboard toggle and saved preference passed.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

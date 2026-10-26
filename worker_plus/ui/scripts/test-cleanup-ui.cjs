// Browser-only cleanup confirmation fixture. No worker, backend, or real files.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.WORKER_UI_TEST_BROWSER || 'chrome' });
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => {
      const state = {
        running: false, workspace: 'C:\\fixture\\workspace\\order_test-order',
        outputs: {}, logs: '',
        context: { order_id: 'test-order', order: { id: 'test-order', title: 'سفارش آزمایشی', order_type: 'تحقیق دانشگاهی' }, status: 'paused', completed_steps: [] }
      };
      let listener;
      window.__resetFixture = { calls: [], state };
      const harmless = async () => {};
      window.workerPlus = {
        readState: async () => structuredClone(state),
        lookupOrder: async id => ({ id, order: { id, title: 'سفارش دیگر', order_type: 'تحقیق دانشگاهی' } }),
        resetRun: async options => {
          window.__resetFixture.calls.push(options);
          state.context = null;
          listener?.({ type: 'state', value: structuredClone(state) });
          return { reset: true, files_removed: 2, workspace: state.workspace };
        },
        startRun: harmless, resumeRun: harmless, stopRun: harmless, openWorkspace: harmless,
        openReport: harmless, openArtifact: harmless, openOutput: harmless, onEvent: callback => { listener = callback; return () => { listener = undefined; }; }
      };
    });
    await page.goto(process.env.WORKER_UI_TEST_URL || 'http://127.0.0.1:5174/');
    const cleanup = page.getByRole('button', { name: 'reset and cleanup' });
    await cleanup.waitFor();
    assert(await cleanup.isEnabled());
    await cleanup.click();
    const dialog = page.getByRole('alertdialog', { name: 'پاک‌سازی اجرای محلی؟' });
    await dialog.waitFor();
    assert(await dialog.getByText('این کار قابل بازگشت نیست.', { exact: false }).isVisible());
    await dialog.getByRole('button', { name: 'لغو' }).click();
    assert.equal(await page.evaluate(() => window.__resetFixture.calls.length), 0);
    await cleanup.click();
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('alertdialog').count(), 0);
    assert.equal(await page.evaluate(() => window.__resetFixture.calls.length), 0);
    await cleanup.click();
    await dialog.getByRole('button', { name: 'حذف فایل‌ها و بازنشانی' }).click();
    await page.getByRole('status').filter({ hasText: 'فایل محلی پاک شد' }).waitFor();
    assert.deepEqual(await page.evaluate(() => window.__resetFixture.calls), [{ orderId: 'test-order', workspace: 'C:\\fixture\\workspace\\order_test-order' }]);
    assert(await cleanup.isDisabled());
    console.log('PASS: cleanup warning, cancellation, Escape, confirmed reset and cleared UI');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

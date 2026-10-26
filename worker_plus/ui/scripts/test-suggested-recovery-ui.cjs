// Verify the suggested-stage button sends the failure guidance for every order type.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.WORKER_UI_TEST_BROWSER || 'chrome' });
  try {
    const orderTypes = ['پایان‌نامه کارشناسی', 'پایان‌نامه کارشناسی ارشد', 'پروپوزال پایان‌نامه', 'تحقیق دانشگاهی', 'ارائه و پاورپوینت'];
    for (const { orderType, raw } of orderTypes.flatMap(orderType => [{ orderType, raw: false }, { orderType, raw: true }])) {
      const page = await browser.newPage();
      await page.addInitScript(({ type, raw }) => {
        const failure = raw
          ? { failed_step: '03_check_intake', restart_step: '03_check_intake', error: '[WinError 5] Access is denied: order_context.json.tmp -> order_context.json' }
          : { failed_step: '05c_research_evidence', restart_step: '05c_research_evidence', error: 'C3: evidence does not address topic product' };
        const state = { running: false, workspace: 'C:\\fixture\\workspace\\in_progress', outputs: {}, logs: '',
          autoRepair: { status: 'applied', order_id: 'test-order', stage: '05c_research_evidence', files: ['presentation/workflow.py'] },
          context: { order_id: 'test-order', order: { id: 'test-order', title: 'سفارش آزمایشی', order_type: type },
            status: 'failed', completed_steps: ['01_fetch_order', '02_prepare_workspace'],
            ...(raw ? { current_step: '03_check_intake', errors: [failure.error] } : { active_failure: failure, recovery_history: [failure] }) } };
        window.__suggestedFixture = { calls: [] };
        const harmless = async () => {};
        window.workerPlus = {
          readState: async () => structuredClone(state),
          startRun: async options => { window.__suggestedFixture.calls.push(options); },
          lookupOrder: async () => ({ id: 'test-order', order: state.context.order }), listAiReviews: async () => [],
          resumeRun: harmless, stopRun: harmless, openWorkspace: harmless,
          openReport: harmless, openArtifact: harmless, openOutput: harmless,
          onEvent: () => () => {}
        };
      }, { type: orderType, raw });
      await page.goto(process.env.WORKER_UI_TEST_URL || 'http://127.0.0.1:5175/');
      const suggested = page.getByRole('button', { name: 'اصلاح و ادامه از مرحلهٔ پیشنهادی' });
      await suggested.waitFor();
      assert.equal(await page.getByText('آخرین بررسی خودکار کد: اصلاح آزموده اعمال شد').count(), 1, orderType);
      const expectedError = raw ? '[WinError 5] Access is denied' : 'C3: evidence does not address topic product';
      await page.waitForFunction(error => document.querySelector('#operator-note')?.value.includes(error), expectedError);
      assert.equal(await page.evaluate(() => window.__suggestedFixture.calls.length), 0);
      await suggested.click();
      await page.waitForFunction(() => window.__suggestedFixture.calls.length === 1);
      const [call] = await page.evaluate(() => window.__suggestedFixture.calls);
      assert.equal(call.step, raw ? 3 : 9, orderType);
      assert.equal(call.orderId, 'test-order', orderType);
      assert.equal(call.autoRepair, true, orderType);
      assert(call.note.includes(expectedError), orderType);
      if (!raw && orderType === 'ارائه و پاورپوینت') assert(call.note.includes('ادعاهای سالم را حفظ کن'), orderType);
      await page.close();
    }
    console.log('PASS: repair button, notes and restart stage for structured failures and raw stage-3 errors across all five order types');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

// Browser integration test with an isolated preload fixture; no worker/backend actions.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');

(async () => {
  const root = path.resolve(__dirname, '../../workspace/refactor_smoke_20261006');
  const workflow = JSON.parse(fs.readFileSync(path.join(root, 'reports/workflow_artifacts.json'), 'utf8'));
  const original = workflow.artifacts.find(row => row.current && row.kind === 'analysis_results');
  assert(original, 'Run the actual analysis integration fixture first');
  const old = { ...original, id: 'ui-history-fixture', version: 0, current: false };
  const current = { ...original, status: 'STALE', validation: { ...original.validation, issues: [{ code: 'UI_TEST_STALE', message: 'تغییر نسخه داده به اجرای مجدد محاسبات نیاز دارد.' }] } };
  workflow.artifacts = workflow.artifacts.filter(row => row.id !== original.id).concat(old, current);
  const historicalCount = workflow.artifacts.filter(row => !row.current).length;
  const state = { running: false, workflow, workspace: root, outputs: { 'final.pdf': true }, logs: 'Isolated UI integration fixture',
    context: { order_id: workflow.order_id, order: { title: 'آزمون شواهد پژوهش و محاسبات', order_type: 'تحقیق دانشگاهی', status: 'pending' },
      status: 'paused', current_step: '05e_execute_analysis', completed_steps: ['05d_prepare_data'],
      finalization_state: 'REVISION_REQUIRED', pause_reason: 'آزمون توقف برای اصلاح',
      active_failure: { failed_step: '04_extract_university_rules', restart_step: '04_extract_university_rules',
        error: 'Critical style-guide rules need correction', report_path: 'reports/style_guide_validation.json',
        issues: [{ code: 'STYLE_GUIDE_VISUAL_RULE_UNRESOLVED', location: 'G001 page 7', message: 'الزام درج شمارهٔ صفحه از استخراج شیوه‌نامه جا افتاده است.' },
                 { code: 'STYLE_GUIDE_VISUAL_RULE_UNRESOLVED', location: 'G001 page 7', message: 'نمرات جدول گزارش‌ها باید با مقادیر ۱۰، ۳۰، ۲۰ و ۱۲۰ و جمع ۱۸۰ حفظ شوند.' }] },
      usage: { calls: 2, totalTokens: 1234, cachedInputTokens: 0, unknown_usage_calls: 0 } } };
  const browser = await chromium.launch({ headless: true, channel: process.env.WORKER_UI_TEST_BROWSER || 'chrome' });
  try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  await page.addInitScript(state => {
    const harmless = async () => {};
    let listener;
    const emit = () => listener?.({ type: 'state', value: structuredClone(state) });
    const fixture = window.__cleanupFixture = {
      calls: [], runCalls: [], failNext: false, finish: undefined,
      setRunning: running => { state.running = running; emit(); },
      setFailure: failure => { state.context.active_failure = failure; emit(); },
      refresh: emit
    };
    window.workerPlus = { readState: async () => structuredClone(state),
      lookupOrder: async value => ({ id: value, order: { title: 'سفارش دیگر', status: 'pending', order_type: 'تحقیق دانشگاهی' } }),
      startRun: async options => { fixture.runCalls.push(options); }, resumeRun: harmless, stopRun: harmless, openWorkspace: harmless,
      resetRun: async options => {
        if (options.orderId !== state.context?.order_id || options.workspace !== state.workspace) throw new Error('Wrong cleanup target');
        fixture.calls.push(options);
        if (fixture.failNext) { fixture.failNext = false; throw new Error('فایل خروجی باز است؛ آن را ببندید و دوباره تلاش کنید.'); }
        state.cleaning = true; emit();
        await new Promise(resolve => { fixture.finish = resolve; });
        state.context = null; state.workflow = undefined; state.outputs = {}; state.logs = ''; state.cleaning = false; emit();
        return { reset: true, files_removed: 4, workspace: state.workspace };
      },
      openReport: harmless, openArtifact: harmless, openOutput: harmless, onEvent: callback => { listener = callback; return () => { listener = undefined; }; } };
  }, state);
  await page.goto(process.env.WORKER_UI_TEST_URL || 'http://127.0.0.1:5174/');
  await page.getByRole('heading', { name: 'خروجی‌ها و شواهد اجرا' }).waitFor();
  assert.equal(await page.locator('.failure-details li').count(), 2);
  assert(await page.getByText('الزام درج شمارهٔ صفحه از استخراج شیوه‌نامه جا افتاده است.', { exact: true }).isVisible());
  assert(await page.getByText('نمرات جدول گزارش‌ها باید با مقادیر ۱۰، ۳۰، ۲۰ و ۱۲۰ و جمع ۱۸۰ حفظ شوند.', { exact: true }).isVisible());
  const note = page.locator('#operator-note');
  const pythonRecoveryNote = failure => execFileSync(process.env.WORKER_PLUS_PYTHON || 'python', ['-c', 'import json, sys; from common.recovery import recovery_note; print(recovery_note(json.load(sys.stdin)), end="")'],
    { cwd: path.resolve(__dirname, '../..'), input: JSON.stringify(failure), encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } }).replace(/\r\n/g, '\n');
  const automatic = pythonRecoveryNote(state.context.active_failure);
  await page.waitForFunction(() => document.querySelector('#operator-note').value.includes('راهنمای اصلاح خودکار'));
  assert.equal(await note.inputValue(), automatic, 'Python and desktop must build identical legacy recovery plans');
  await note.fill('دستور دستی من را حفظ کن\n\n' + automatic);
  await page.evaluate(() => window.__cleanupFixture.refresh());
  assert.equal(await note.inputValue(), 'دستور دستی من را حفظ کن\n\n' + automatic);
  const suggested = page.getByRole('button', { name: 'اجرا از مرحلهٔ پیشنهادی', exact: true });
  await suggested.click();
  let requested = await page.evaluate(() => window.__cleanupFixture.runCalls.at(-1));
  assert.equal(requested.step, 4);
  assert(requested.note.includes('دستور دستی من را حفظ کن'));
  assert(requested.note.includes(automatic));
  await note.fill('یادداشت دستی بدون راهکار');
  await suggested.click();
  requested = await page.evaluate(() => window.__cleanupFixture.runCalls.at(-1));
  assert(requested.note.includes(automatic), 'Suggested Run must supply repair instructions even if the textarea was cleared');
  assert(requested.note.includes('یادداشت دستی بدون راهکار'));
  const contractFailure = { failed_step: '04a_build_order_contract', restart_step: '04a_build_order_contract', error: 'Task context exceeds 100000 characters: resolve_operations' };
  await page.evaluate(failure => window.__cleanupFixture.setFailure(failure), contractFailure);
  const contractNote = pythonRecoveryNote(contractFailure);
  await page.waitForFunction(() => document.querySelector('#operator-note').value.includes('operation_requirements'));
  assert.equal(await note.inputValue(), 'یادداشت دستی بدون راهکار\n\n' + contractNote);
  assert(!(await note.inputValue()).includes(automatic), 'A new failure must replace only the previous automatic plan');
  await suggested.click();
  requested = await page.evaluate(() => window.__cleanupFixture.runCalls.at(-1));
  assert.equal(requested.step, 5);
  assert.equal(requested.note, 'یادداشت دستی بدون راهکار\n\n' + contractNote);
  const researchFailure = { failed_step: '05c_research', restart_step: '05c_research', kind: 'blocked',
    error: 'Research validation failed; see research/validation.json', repair_note: 'یادداشت قدیمی: فایل قفل‌شده را آزاد کن',
    issues: [{ code: 'REQUIRED_SOURCE_MISSING', message: 'guide-id' }, { code: 'CONTRADICTORY_EVIDENCE_IGNORED', message: 'E23' }] };
  await page.evaluate(failure => window.__cleanupFixture.setFailure(failure), researchFailure);
  const researchNote = pythonRecoveryNote(researchFailure);
  await page.waitForFunction(() => document.querySelector('#operator-note').value.includes('contradictions'));
  assert.equal(await note.inputValue(), 'یادداشت دستی بدون راهکار\n\n' + researchNote);
  assert(!(await note.inputValue()).includes('قفل'), 'Blocked research validation is not a locked-file error');
  await suggested.click();
  requested = await page.evaluate(() => window.__cleanupFixture.runCalls.at(-1));
  assert.equal(requested.step, 9);
  assert.equal(requested.note, 'یادداشت دستی بدون راهکار\n\n' + researchNote);
  await page.screenshot({ path: path.join(root, 'reports/ui-research-recovery.png'), fullPage: true });
  await page.evaluate(failure => window.__cleanupFixture.setFailure(failure), contractFailure);
  await page.waitForFunction(() => document.querySelector('#operator-note').value.includes('operation_requirements'));
  await page.screenshot({ path: path.join(root, 'reports/ui-automatic-recovery.png'), fullPage: true });
  const cleanup = page.getByRole('button', { name: 'reset and cleanup', exact: true });
  assert(await cleanup.isEnabled());
  await page.evaluate(() => window.__cleanupFixture.setRunning(true));
  await page.waitForFunction(() => document.querySelector('.cleanup-button').disabled);
  assert(await cleanup.isDisabled());
  await page.evaluate(() => window.__cleanupFixture.setRunning(false));
  await page.waitForFunction(() => !document.querySelector('.cleanup-button').disabled);
  assert.equal(await page.locator('.artifact-table tr.historical').count(), 0);
  await page.getByRole('button', { name: 'تاریخچه نسخه‌ها' }).click();
  assert.equal(await page.locator('.artifact-table tr.historical').count(), historicalCount);
  await page.getByRole('button', { name: 'نیازمند رسیدگی', exact: true }).click();
  assert.equal(await page.locator('.artifact-table tbody tr').count(), 1);
  await page.getByRole('button', { name: 'نسخه‌های جاری' }).click();
  await page.locator('.artifacts-panel').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(root, 'reports/ui-artifacts.png'), fullPage: true });
  const search = page.getByPlaceholder('لینک یا شناسه سفارش را وارد کنید…');
  await search.fill('different-order');
  await search.press('Enter');
  await page.getByRole('heading', { name: 'سفارش دیگر', exact: true }).waitFor();
  assert.equal(await page.locator('.artifacts-panel').count(), 0);
  assert.equal(await page.locator('.failure-details').count(), 0);
  assert.equal(await note.inputValue(), '', 'Repair instructions must not leak to another order');
  assert.equal(await page.getByText('مصرف ثبت‌شده سفارش', { exact: true }).count(), 0);
  assert.equal(await page.getByText('آزمون توقف برای اصلاح', { exact: true }).count(), 0);
  assert(await page.getByRole('button', { name: 'ادامه اجرا', exact: true }).isDisabled());
  assert(await cleanup.isDisabled());
  assert(await page.getByRole('button', { name: 'باز کردن workspace', exact: true }).isDisabled());
  assert(await page.locator('.output-grid button').filter({ hasText: 'final.pdf' }).isDisabled());
  await note.fill('یادداشت مشترک');
  await search.fill('third-order');
  await search.press('Enter');
  await page.waitForFunction(() => document.querySelector('.order-id-row .muted').textContent === 'third-order');
  await note.fill('یادداشت مشترک');
  await search.fill('different-order');
  await search.press('Enter');
  await page.waitForFunction(() => document.querySelector('.order-id-row .muted').textContent === 'different-order' && document.querySelector('#operator-note').value === 'یادداشت مشترک');
  await search.fill(workflow.order_id);
  await search.press('Enter');
  await page.getByRole('heading', { name: 'خروجی‌ها و شواهد اجرا' }).waitFor();
  await page.waitForFunction(() => document.querySelector('#operator-note').value.includes('operation_requirements'));
  assert.equal(await note.inputValue(), 'یادداشت دستی بدون راهکار\n\n' + contractNote, 'Returning to the order preserves its notes');
  await page.locator('#operator-note').fill('یادداشت اجرای قبلی');
  await page.evaluate(() => { window.__cleanupFixture.failNext = true; });
  await cleanup.click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'حذف فایل‌ها و بازنشانی' }).click();
  await page.getByText('فایل خروجی باز است؛ آن را ببندید و دوباره تلاش کنید.', { exact: true }).waitFor();
  assert(await cleanup.isEnabled());
  assert.equal(await page.locator('.artifacts-panel').count(), 1);
  await cleanup.click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'حذف فایل‌ها و بازنشانی' }).click();
  await page.waitForFunction(() => Boolean(window.__cleanupFixture.finish));
  assert(await cleanup.isDisabled());
  assert(await page.getByRole('button', { name: 'شروع اجرای کامل', exact: true }).isDisabled());
  assert(await page.getByRole('button', { name: 'ادامه اجرا', exact: true }).isDisabled());
  assert.equal(await page.locator('.step button:not(:disabled)').count(), 0);
  assert.equal(await page.locator('.output-grid button:not(:disabled)').count(), 0);
  assert(await page.getByRole('button', { name: 'باز کردن workspace', exact: true }).isDisabled());
  assert.equal(await page.evaluate(() => window.__cleanupFixture.calls.length), 2);
  await page.evaluate(() => window.__cleanupFixture.finish());
  await page.getByRole('status').filter({ hasText: 'فایل محلی پاک شد' }).waitFor();
  assert.equal(await page.locator('.artifacts-panel').count(), 0);
  assert.match(await page.locator('.panel-title p').innerText(), /^0 از/);
  assert.equal(await page.locator('#operator-note').inputValue(), '');
  assert(await cleanup.isDisabled());
  assert(await page.getByRole('button', { name: 'ادامه اجرا', exact: true }).isDisabled());
  assert(await page.getByRole('button', { name: 'شروع اجرای کامل', exact: true }).isEnabled());
  assert.equal(await page.locator('.output-grid button:not(:disabled)').count(), 0);
  await page.screenshot({ path: path.join(root, 'reports/ui-cleanup.png'), fullPage: true });
  console.log('PASS: automatic actionable notes, Python/UI plan parity, suggested-stage payloads, manual note preservation, order isolation, artifacts and cleanup guards');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

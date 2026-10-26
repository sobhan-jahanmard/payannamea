// UI fixture only; starting or changing an actual worker is forbidden.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const stages = require('../../common/stages.json');

(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.WORKER_UI_TEST_BROWSER || 'chrome' });
  try {
    const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
    await page.addInitScript(stages => {
      const order = { title: 'ارائه آزمایشی بدون اجرا', order_type: 'ارائه و پاورپوینت', status: 'approved', quantity_type: 'slides', quantity_value: 20, presentation_style: 'analytical-business', presentation_font: 'Vazirmatn' };
      const state = { running: false, workspace: 'isolated-fixture', outputs: { 'final.pdf': true, 'final.pptx': true, 'sample.pdf': true, 'sample.pptx': true }, context: {
        order_id: 'presentation-fixture', order, status: 'dry_run_complete', completed_steps: stages.map(stage => stage.id)
      }};
      window.__presentationOpened = [];
      window.workerPlus = {
        readState: async () => state, onEvent: () => () => {}, openOutput: async name => window.__presentationOpened.push(name),
        presentationPreview: async (id, number) => {
          if (id !== 'presentation-fixture') throw Error('Wrong order');
          const slides = [{ number: 1, title: 'اسلاید اول', notes: 'source.pdf · صفحات ۲ تا ۳' }, { number: 2, title: 'اسلاید دوم', notes: 'source.pdf · صفحات ۵ تا ۶' }];
          return number ? { ...slides[number - 1], image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=' } : { slides, style: 'analytical-business', font: 'Vazirmatn', ready: true };
        },
        startRun: async () => { throw Error('No real runs allowed'); }
      };
    }, stages);
    await page.goto(process.env.WORKER_UI_TEST_URL || 'http://127.0.0.1:5175/');
    await page.getByRole('heading', { name: 'ارائه آزمایشی بدون اجرا', exact: true }).waitFor();
    await page.getByText('ساخت پاورپوینت قابل ویرایش', { exact: true }).waitFor();
    assert.equal(await page.locator('.steps .step').count(), 22);
    assert(await page.getByText('20 اسلاید', { exact: true }).isVisible());
    const output = page.locator('.completed-output');
    await output.getByRole('button', { name: 'final.pptx', exact: true }).click();
    await output.getByRole('button', { name: 'sample.pptx', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.__presentationOpened), ['final.pptx', 'sample.pptx']);
    assert.equal(await output.getByText('final.docx', { exact: true }).count(), 0);
    await page.getByRole('button', { name: 'پیش‌نمایش اسلاید و یادداشت مطالعه' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('heading', { name: 'اسلاید اول' }).waitFor();
    assert(await dialog.getByText('source.pdf · صفحات ۲ تا ۳', { exact: true }).isVisible());
    await dialog.getByRole('button', { name: 'بعدی', exact: true }).click();
    await dialog.getByRole('heading', { name: 'اسلاید دوم' }).waitFor();
    assert(await dialog.getByText('source.pdf · صفحات ۵ تا ۶', { exact: true }).isVisible());
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('dialog').count(), 0);
    console.log('Presentation UI passed: profile stage labels, slide count, editable PPTX and sample buttons; no worker started.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

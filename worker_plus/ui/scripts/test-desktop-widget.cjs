// Real Electron windows using an isolated app copy and workspace. No worker starts.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { _electron: electron } = require('playwright');

(async () => {
  const buildUi = process.env.WORKER_UI_TEST_APP;
  assert(buildUi, 'Set WORKER_UI_TEST_APP to an isolated UI build with dist and dist-electron');
  const workerRoot = path.dirname(buildUi);
  assert(path.basename(path.dirname(workerRoot)).startsWith('release-portable-staging-desktop-'), 'Use an isolated desktop test build');
  const contextFile = path.join(workerRoot, 'workspace/in_progress/order_context.json');
  assert(!fs.existsSync(contextFile), 'The fixture must start with an empty isolated workspace');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'daneshyar-widget-'));
  const bootstrap = path.join(temp, 'main.cjs');
  fs.writeFileSync(bootstrap, `const {app}=require('electron'); app.setPath('userData',${JSON.stringify(path.join(temp, 'profile'))}); require(${JSON.stringify(path.join(buildUi, 'dist-electron/main.js'))});`);
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.VITE_DEV_SERVER_URL;
  const app = await electron.launch({ executablePath: path.resolve(__dirname, '../node_modules/electron/dist/electron.exe'), args: [bootstrap], env });
  try {
    await app.firstWindow();
    await app.evaluate(async ({ BrowserWindow }) => {
      while (BrowserWindow.getAllWindows().length !== 2) await new Promise(resolve => setTimeout(resolve, 25));
    });
    const pages = app.windows();
    await Promise.all(pages.map(page => page.waitForURL(/index\.html/)));
    let widget = pages.find(page => page.url().includes('#run-widget'));
    assert(widget);
    const main = pages.find(page => !page.url().includes('#run-widget'));
    assert(main);
    await widget.getByRole('status').getByText('آمادهٔ اجرا', { exact: true }).waitFor();
    assert.equal(await main.locator('.run-widget').count(), 0, 'Widget must be a separate native window');
    const native = await app.evaluate(({ BrowserWindow, screen }) => {
      const overlay = BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('#run-widget'));
      const main = BrowserWindow.getAllWindows().find(win => !win.webContents.getURL().includes('#run-widget'));
      main.minimize();
      return { onTop: overlay.isAlwaysOnTop(), parent: overlay.getParentWindow()?.id, bounds: overlay.getBounds(), area: screen.getDisplayMatching(main.getBounds()).workArea };
    });
    assert(native.onTop); assert.equal(native.parent, undefined);
    // Check the actual Windows extended style, not only Electron's cached
    // isAlwaysOnTop setting. This caught the disappearing overlay in production.
    const nativeTopmost = async () => {
      if (process.platform !== 'win32') return true;
      const hwnd = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('#run-widget')).getNativeWindowHandle().readBigUInt64LE().toString());
      assert(/^\d+$/.test(hwnd));
      const command = `Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class WidgetStyle{[DllImport("user32.dll",EntryPoint="GetWindowLongPtrW")]public static extern IntPtr Read(IntPtr h,int n);}'; (([WidgetStyle]::Read([IntPtr]::new([long]${hwnd}),-20).ToInt64() -band 8) -ne 0)`;
      return execFileSync('powershell.exe', ['-NoProfile', '-Command', command], { windowsHide: true, encoding: 'utf8' }).trim() === 'True';
    };
    assert(await nativeTopmost(), 'The native WS_EX_TOPMOST style must be set after showing/resizing');
    assert.equal(native.bounds.x + native.bounds.width, native.area.x + native.area.width - 8);
    assert.equal(native.bounds.y + native.bounds.height, native.area.y + native.area.height - 8);
    assert(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('#run-widget')).isVisible()), 'Overlay must remain visible when the main window is minimized');
    await widget.getByRole('button', { name: 'جمع کردن وضعیت اجرا' }).click();
    await widget.waitForFunction(() => window.innerHeight <= 80);
    const collapsedHeight = await widget.evaluate(() => window.innerHeight);
    await widget.getByRole('button', { name: 'باز کردن وضعیت اجرا' }).click();
    await widget.waitForFunction(height => window.innerHeight > height, collapsedHeight);
    fs.mkdirSync(path.dirname(contextFile), { recursive: true });
    fs.writeFileSync(contextFile, JSON.stringify({ order_id: 'isolated-widget-order', order: { title: 'سفارش آزمایشی مستقل' }, status: 'failed',
      active_failure: { failed_step: '05a_analyze_customer_sources', error: 'خطای آزمایشی منابع', restart_step: '05a_analyze_customer_sources' }, completed_steps: [] }));
    await widget.getByText('مرحلهٔ ۷ · خطا در اجرا', { exact: true }).waitFor();
    await widget.getByText('خطای آزمایشی منابع', { exact: true }).waitFor();
    await widget.getByRole('button', { name: 'باز کردن برنامه' }).click();
    assert(await app.evaluate(({ BrowserWindow }) => !BrowserWindow.getAllWindows().find(win => !win.webContents.getURL().includes('#run-widget')).isMinimized()));
    const toggle = main.getByRole('button', { name: 'ویجت دسکتاپ', exact: true });
    await toggle.click();
    await main.waitForFunction(() => document.querySelector('.desktop-widget-button').getAttribute('aria-pressed') === 'false');
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('#run-widget')).isVisible()), false);
    await toggle.click();
    assert(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('#run-widget')).isVisible()));
    assert(await nativeTopmost(), 'Showing the widget must restore its native topmost style');
    // An OS hide is not a user request to turn the widget off.
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('#run-widget')).hide());
    await widget.waitForFunction(async () => (await window.workerPlus.readState()).desktopWidgetVisible === true);
    await app.evaluate(async ({ BrowserWindow }) => {
      const overlay = BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('#run-widget'));
      const deadline = Date.now() + 8000;
      while (!overlay.isVisible() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
      if (!overlay.isVisible()) throw new Error('Unexpected hide was not recovered');
      overlay.setAlwaysOnTop(false);
      overlay.setBounds({ x: -20_000, y: -20_000, width: 376, height: 120 });
      while ((!overlay.isAlwaysOnTop() || overlay.getBounds().x < -10_000) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
      if (!overlay.isAlwaysOnTop() || overlay.getBounds().x < -10_000) throw new Error('Lost topmost/off-screen position was not recovered');
    });
    assert(await nativeTopmost());
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('#run-widget')).close());
    await main.waitForFunction(() => document.querySelector('.desktop-widget-button').getAttribute('aria-pressed') === 'false');
    await new Promise(resolve => setTimeout(resolve, 5500));
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('#run-widget')).isVisible()), false, 'The watchdog must respect an explicit hide');
    await toggle.click();
    assert(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('#run-widget')).isVisible()), 'Closing the widget should hide it and allow reopening');
    // A destroyed status window must be recreated without restarting the app.
    const replacement = app.waitForEvent('window');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('#run-widget')).destroy());
    widget = await replacement;
    await widget.waitForURL(/#run-widget/);
    await widget.getByText('خطای آزمایشی منابع', { exact: true }).waitFor();
    assert(await nativeTopmost());
    // Simulate a renderer crash; only the status renderer should reload.
    const recoveredText = await app.evaluate(async ({ BrowserWindow }) => {
      const contents = BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('#run-widget')).webContents;
      // Playwright rejects page waits once a renderer has crashed, so observe
      // recovery from Electron's main process and inspect the new renderer.
      const loaded = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Widget renderer did not recover')), 15000);
        contents.once('did-finish-load', () => { clearTimeout(timeout); resolve(); });
      });
      contents.forcefullyCrashRenderer();
      await loaded;
      const deadline = Date.now() + 8000;
      let text = '';
      while (Date.now() < deadline) {
        text = await contents.executeJavaScript('document.body.innerText');
        if (text.includes('خطای آزمایشی منابع')) return text;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      throw new Error('Recovered renderer did not receive live state: ' + text);
    });
    assert(recoveredText.includes('خطای آزمایشی منابع'));
    assert(await nativeTopmost());
    assert.equal(fs.existsSync(path.join(workerRoot, 'workspace/active.json')), false, 'No worker run or claim should be created');
    console.log('Desktop widget passed: native topmost style, minimize, collapse/expand, hide/show, OS hide recovery, lost topmost/off-screen recovery, explicit hide respected, destroyed window recovery and renderer crash recovery. No order run.');
  } finally {
    await app.close();
    if (fs.existsSync(contextFile)) fs.unlinkSync(contextFile);
    // Created by this test with a fixed prefix under the system temp directory.
    assert.equal(path.dirname(temp), os.tmpdir());
    assert(path.basename(temp).startsWith('daneshyar-widget-'));
    fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

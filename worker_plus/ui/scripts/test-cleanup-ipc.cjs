// Real desktop IPC -> Python cleanup, entirely inside an owned temporary fixture.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

(async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'worker-plus-cleanup-ipc-'));
  assert.equal(path.dirname(temporary), os.tmpdir());
  assert(path.basename(temporary).startsWith('worker-plus-cleanup-ipc-'));
  const workerRoot = path.join(temporary, 'worker_plus');
  const compiledRoot = path.join(workerRoot, 'ui/dist-electron');
  const commonRoot = path.join(workerRoot, 'common');
  fs.mkdirSync(compiledRoot, { recursive: true });
  fs.mkdirSync(commonRoot, { recursive: true });
  for (const file of ['main.js', 'cleanup.js']) fs.copyFileSync(path.join(__dirname, '../dist-electron', file), path.join(compiledRoot, file));
  for (const file of ['workspace_cleanup.py', 'execution_lock.py']) fs.copyFileSync(path.join(__dirname, '../../common', file), path.join(commonRoot, file));
  fs.writeFileSync(path.join(workerRoot, '.env'), 'BACKEND_URL=http://127.0.0.1:1\n');
  // A local waiting process exercises the real stop/start guards without an order claim.
  fs.writeFileSync(path.join(workerRoot, 'run.py'), 'import sys, time\nfrom pathlib import Path\nsys.stdin.reconfigure(encoding="utf-8")\nnote = sys.stdin.read()\nPath("received-note.txt").write_text(note, encoding="utf-8")\nprint("isolated-worker-ready", flush=True)\ntime.sleep(45)\n');
  const workspaceRoot = path.join(workerRoot, 'workspace');
  const run = path.join(workspaceRoot, 'runs/current');
  const context = path.join(run, 'order_context.json');
  const pointer = path.join(workspaceRoot, 'active.json');
  const archive = path.join(workspaceRoot, 'order_test/runs/archive/keep.txt');
  const otherRun = path.join(workspaceRoot, 'runs/other/keep.txt');
  const legacy = path.join(workspaceRoot, 'in_progress/order_context.json');
  const write = (file, contents) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, contents); };
  write(context, JSON.stringify({ order_id: 'test-order', status: 'paused' }));
  write(pointer, JSON.stringify({ path: 'runs/current' }));
  write(path.join(run, 'final/final.pdf'), 'PDF fixture');
  write(path.join(run, 'reports/workflow_artifacts.json'), JSON.stringify({ order_id: 'test-order', artifacts: [] }));
  write(archive, 'archive'); write(otherRun, 'other'); write(legacy, JSON.stringify({ order_id: 'legacy-order' }));
  const handlers = new Map();
  const events = [];
  const openedPaths = [];
  const fakeElectron = {
    app: { isPackaged: false, whenReady: async () => {}, on() {}, quit() {} },
    BrowserWindow: class { constructor() { this.webContents = { send: (_channel, event) => events.push(event) }; } loadFile() {} static getAllWindows() { return []; } },
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    shell: { openPath: async target => { openedPaths.push(target); return ''; } }
  };
  const originalLoader = Module._load;
  const originalFetch = global.fetch;
  global.fetch = async () => { throw new Error('Cleanup must not call a backend'); };
  let stopped = true;
  const invoke = (channel, ...args) => handlers.get(channel)(undefined, ...args);
  try {
    Module._load = function(name, ...args) { return name === 'electron' ? fakeElectron : originalLoader.call(this, name, ...args); };
    require(path.join(compiledRoot, 'main.js'));
    Module._load = originalLoader;
    await new Promise(resolve => setImmediate(resolve));
    const options = { orderId: 'test-order', workspace: run };
    await assert.rejects(async () => invoke('worker:reset', { ...options, orderId: 'wrong-order' }));
    await assert.rejects(async () => invoke('worker:reset', { ...options, workspace: workspaceRoot }));
    assert(fs.existsSync(context));
    const linkedArchive = path.join(run, 'linked-archive');
    fs.symlinkSync(path.dirname(archive), linkedArchive, 'junction');
    await assert.rejects(async () => invoke('worker:reset', options), /لینک|junction/);
    assert.equal(invoke('worker:state').cleaning, false);
    assert(fs.existsSync(context));
    assert.equal(fs.readFileSync(archive, 'utf8'), 'archive');
    fs.unlinkSync(linkedArchive);
    await assert.rejects(async () => invoke('worker:open-output', 'final.pdf'), /تأیید/);
    write(context, JSON.stringify({ order_id: 'test-order', status: 'dry_run_complete', completed_steps: ['10_validate_and_publish'] }));
    await invoke('worker:open-output', 'final.pdf');
    await invoke('worker:open-final-folder');
    assert(openedPaths.includes(path.join(run, 'final', 'final.pdf')));
    assert(openedPaths.includes(path.join(run, 'final')));
    write(context, JSON.stringify({ order_id: 'test-order', status: 'paused' }));
    const largeNote = 'راهنمای اصلاح '.repeat(10000) + 'END_OF_NOTE';
    invoke('worker:start', { orderId: 'test-order', offline: true, sample: false, step: 5, note: largeNote });
    stopped = false;
    const deadline = Date.now() + 8000;
    while (!events.some(event => event.type === 'log' && String(event.value).includes('isolated-worker-ready'))) {
      assert(Date.now() < deadline, 'Temporary worker did not start');
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    assert.equal(fs.readFileSync(path.join(workerRoot, 'received-note.txt'), 'utf8'), largeNote);
    const startingLog = events.find(event => event.type === 'log' && String(event.value).includes('[worker] starting'));
    assert(String(startingLog.value).includes('--operator-note-stdin'));
    assert(!String(startingLog.value).includes(largeNote));
    await assert.rejects(async () => invoke('worker:reset', options));
    assert(fs.existsSync(context));
    await invoke('worker:stop'); stopped = true;
    const pending = invoke('worker:reset', options);
    assert.equal(invoke('worker:state').cleaning, true);
    await assert.rejects(async () => invoke('worker:start', { orderId: 'test-order', offline: true, sample: false }));
    await assert.rejects(async () => invoke('worker:reset', options));
    const result = await pending;
    assert.equal(result.reset, true);
    assert.equal(result.files_removed, 3);
    assert.equal(fs.existsSync(run), false);
    const state = invoke('worker:state');
    assert.equal(state.context, null);
    assert.equal(state.workflow, undefined);
    assert.equal(state.logs, '');
    assert.equal(state.cleaning, false);
    assert(Object.values(state.outputs).every(value => value === false));
    assert.equal(state.workspace, run);
    assert.equal(fs.readFileSync(archive, 'utf8'), 'archive');
    assert.equal(fs.readFileSync(otherRun, 'utf8'), 'other');
    assert(fs.existsSync(legacy));
    assert.equal(fs.readFileSync(path.join(workerRoot, '.env'), 'utf8'), 'BACKEND_URL=http://127.0.0.1:1\n');
    console.log('PASS: complete 130k+ guidance over stdin, desktop IPC -> Python cleanup, worker guards, local scope and cleared desktop state');
  } finally {
    Module._load = originalLoader; global.fetch = originalFetch;
    if (!stopped && handlers.has('worker:stop')) await invoke('worker:stop');
    // The absolute deletion target was checked above and created by this test.
    fs.rmSync(temporary, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

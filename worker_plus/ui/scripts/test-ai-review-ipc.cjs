// Isolated Electron IPC smoke: review and fix use saved local files, never the backend.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

(async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'worker-plus-ai-review-ipc-'));
  assert.equal(path.dirname(temporary), os.tmpdir());
  const workerRoot = path.join(temporary, 'worker_plus');
  const compiledRoot = path.join(workerRoot, 'ui', 'dist-electron');
  fs.mkdirSync(compiledRoot, { recursive: true });
  for (const name of ['main.js', 'cleanup.js', 'presentation-preview.js'])
    fs.copyFileSync(path.join(__dirname, '..', 'dist-electron', name), path.join(compiledRoot, name));
  const orderId = '2fb16202-09b1-4b61-8dfa-88250ac64471';
  const workspace = path.join(workerRoot, 'workspace', 'in_progress');
  const write = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value); };
  write(path.join(workerRoot, 'workspace', 'active.json'), JSON.stringify({ path: 'in_progress' }));
  write(path.join(workspace, 'order_context.json'), JSON.stringify({ order_id: orderId, status: 'dry_run_complete',
    completed_steps: ['10_validate_and_publish'], order: { order_type: 'ارائه و پاورپوینت' } }));
  write(path.join(workspace, 'input', 'files', 'source.txt'), 'Original source');
  write(path.join(workspace, 'final', 'final.pptx'), 'Presentation bytes');
  const archive = path.join(workerRoot, 'workspace', `order_${orderId}`);
  write(path.join(archive, 'order_context.json'), JSON.stringify({ order_id: orderId }));
  write(path.join(workerRoot, 'ai_review.py'), `import argparse,json
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--local-job-id');p.add_argument('--local-workspace');a=p.parse_args()
f=Path(a.local_workspace)/'reports'/'ai_reviews.json'
d=json.loads(f.read_text(encoding='utf-8'))
for job in d['jobs']:
 if job['id']==a.local_job_id:
  job.update({'status':'completed','score':16 if job['action']=='review' else None,'report':'Local review report','fix_prompt':'Rebuild this order source calculations' if job['action']=='review' else None,'applied_files':[],'restart_step':9 if job['action']=='fix' else None,'restart_stage_id':'05c_research_evidence' if job['action']=='fix' else None,'finished_at':'2026-10-25T00:00:00Z'})
f.write_text(json.dumps(d),encoding='utf-8')
`);
  const handlers = new Map();
  const fakeElectron = {
    app: { isPackaged: false, whenReady: async () => {}, on() {}, quit() {} },
    BrowserWindow: class {
      constructor() { this.webContents = { send() {}, on() {} }; }
      loadFile() { return Promise.resolve(); } on() {} once() {} isDestroyed() { return false; }
      getBounds() { return { x: 0, y: 0, width: 1280, height: 840 }; }
      setBounds() {} setAlwaysOnTop() {} showInactive() {} hide() {}
      static getAllWindows() { return []; }
    },
    screen: { getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1040 } }), on() {} },
    powerMonitor: { on() {} },
    ipcMain: { handle: (name, handler) => handlers.set(name, handler) },
    shell: { openPath: async () => '' }
  };
  const originalLoader = Module._load;
  const originalFetch = global.fetch;
  global.fetch = async () => { throw new Error('AI review must not call the backend'); };
  const invoke = (name, ...args) => handlers.get(name)(undefined, ...args);
  try {
    Module._load = function(name, ...args) { return name === 'electron' ? fakeElectron : originalLoader.call(this, name, ...args); };
    require(path.join(compiledRoot, 'main.js'));
    Module._load = originalLoader;
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(invoke('ai-review:list', orderId), []);
    invoke('ai-review:start', orderId);
    const deadline = Date.now() + 8000;
    while (invoke('ai-review:list', orderId)[0]?.status !== 'completed') {
      assert(Date.now() < deadline, 'Local review did not complete');
      await new Promise(resolve => setTimeout(resolve, 40));
    }
    const review = invoke('ai-review:list', orderId)[0];
    assert.equal(review.score, 16);
    await assert.rejects(async () => invoke('ai-review:fix', orderId, review.id, 'short'), /۲۰/);
    invoke('ai-review:fix', orderId, review.id, 'Rebuild the calculations in this order from its original source files.');
    while (invoke('ai-review:list', orderId)[0]?.action !== 'fix' || invoke('ai-review:list', orderId)[0]?.status !== 'completed') {
      assert(Date.now() < deadline + 8000, 'Local fix did not complete');
      await new Promise(resolve => setTimeout(resolve, 40));
    }
    const jobs = invoke('ai-review:list', orderId);
    assert.equal(jobs.length, 2);
    assert.equal(jobs[0].restart_step, 9);
    assert.equal(jobs[0].restart_stage_id, '05c_research_evidence');
    assert.deepEqual(jobs[0].applied_files, []);
    assert.equal(jobs[1].score, 16);
    const archiveJobs = JSON.parse(fs.readFileSync(path.join(archive, 'reports', 'ai_reviews.json'), 'utf8')).jobs;
    assert.equal(archiveJobs.length, 2);
    console.log('PASS: local review/fix IPC, persistent history, output fingerprint and no backend request');
  } finally {
    Module._load = originalLoader; global.fetch = originalFetch;
    assert(temporary.startsWith(os.tmpdir() + path.sep));
    fs.rmSync(temporary, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

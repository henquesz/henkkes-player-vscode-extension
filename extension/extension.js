// @ts-check
const vscode = require('vscode');
const cp = require('child_process');
const path = require('path');
const readline = require('readline');

/** @type {cp.ChildProcessWithoutNullStreams | undefined} */
let proc;
let disposed = false;
/** @type {any} */
let state = { active: false };
/** @type {string | null} */
let thumb = null;
/** @type {vscode.StatusBarItem} */
let statusItem;
/** @type {PlayerViewProvider} */
let provider;
/** @type {vscode.OutputChannel} */
let log;

/** @param {vscode.ExtensionContext} context */
function activate(context) {
  log = vscode.window.createOutputChannel('Henkkes Player');
  provider = new PlayerViewProvider();

  statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusItem.command = 'henkkesPlayer.toggle';

  // A mesma view em dois lugares: na barra do Claude Code (junto do chat) e no Explorer.
  const viewOptions = { webviewOptions: { retainContextWhenHidden: true } };
  context.subscriptions.push(
    log,
    statusItem,
    vscode.window.registerWebviewViewProvider('henkkesPlayer.chatView', provider, viewOptions),
    vscode.window.registerWebviewViewProvider('henkkesPlayer.view', provider, viewOptions),
    vscode.commands.registerCommand('henkkesPlayer.toggle', () => send('toggle')),
    vscode.commands.registerCommand('henkkesPlayer.next', () => send('next')),
    vscode.commands.registerCommand('henkkesPlayer.prev', () => send('prev')),
  );

  if (process.platform !== 'win32') {
    vscode.window.showWarningMessage('Henkkes Player: por enquanto só funciona no Windows.');
    return;
  }
  startHelper(context);
}

/** @param {vscode.ExtensionContext} context */
function startHelper(context) {
  const script = path.join(context.extensionPath, 'media', 'smtc.ps1');
  // Tem que ser o Windows PowerShell 5.1: o pwsh 7 não carrega tipos WinRT.
  proc = cp.spawn(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script],
    { windowsHide: true },
  );

  readline.createInterface({ input: proc.stdout }).on('line', (line) => {
    let msg;
    try { msg = JSON.parse(line); } catch { return; }
    if (msg.type === 'error') { log.appendLine('[helper] ' + msg.message); return; }
    if (msg.type === 'state') onState(msg);
  });

  proc.stderr.on('data', (d) => log.appendLine('[stderr] ' + d.toString()));
  proc.on('exit', (code) => {
    log.appendLine(`Helper saiu (código ${code}).`);
    proc = undefined;
    if (!disposed) setTimeout(() => startHelper(context), 3000);
  });
}

/** @param {string} cmd */
function send(cmd) {
  if (proc && proc.stdin.writable) proc.stdin.write(cmd + '\n');
}

/** @param {any} msg */
function onState(msg) {
  let thumbChanged = false;
  if ('thumb' in msg) {
    thumb = msg.thumb || null;
    thumbChanged = true;
    delete msg.thumb;
  }
  state = msg;

  if (!state.active) {
    statusItem.hide();
  } else {
    const icon = state.playing ? '$(debug-pause)' : '$(play)';
    const title = state.title.length > 40 ? state.title.slice(0, 39) + '…' : state.title;
    statusItem.text = `${icon} ${title}`;
    statusItem.tooltip = `${state.title}\n${state.artist}\n\nClique para ${state.playing ? 'pausar' : 'tocar'}`;
    statusItem.show();
  }

  provider.post(thumbChanged ? { ...state, thumb } : state);
}

class PlayerViewProvider {
  constructor() {
    /** @type {Set<vscode.WebviewView>} */
    this.views = new Set();
  }

  /** @param {vscode.WebviewView} view */
  resolveWebviewView(view) {
    this.views.add(view);
    view.webview.options = { enableScripts: true };
    view.webview.html = getHtml();
    view.webview.onDidReceiveMessage((m) => {
      if (m && typeof m.cmd === 'string') send(m.cmd);
    });
    view.onDidDispose(() => { this.views.delete(view); });
    view.webview.postMessage({ ...state, thumb });
  }

  /** @param {any} msg */
  post(msg) {
    for (const v of this.views) v.webview.postMessage(msg);
  }
}

function getHtml() {
  const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
  return /* html */ `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy"
  content="default-src 'none'; img-src data:; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<style nonce="${nonce}">
  html, body { height: 100%; }
  body {
    margin: 0; padding: 8px 10px; display: flex; align-items: center;
    color: var(--vscode-foreground); font-family: var(--vscode-font-family);
  }
  .pill {
    position: relative; width: 100%; height: 56px; border-radius: 999px; overflow: hidden; isolation: isolate;
    background: var(--vscode-editorWidget-background);
    border: 1px solid var(--vscode-widget-border, rgba(128,128,128,.25));
    display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: center; gap: 8px;
    padding: 0 18px;
  }
  .pill.empty { grid-template-columns: 1fr; text-align: center; }
  .pill.empty .controls, .pill.empty .time, .pill.empty .bar, .pill.empty .artist { display: none; }
  .pill.has-art { color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,.6); border-color: rgba(255,255,255,.12); }
  .bg {
    position: absolute; inset: -20px; width: calc(100% + 40px); height: calc(100% + 40px); z-index: -2;
    object-fit: cover; filter: blur(14px) saturate(1.3) brightness(.55); display: none;
  }
  .pill.has-art .bg { display: block; }
  .pill.has-art::before {
    content: ""; position: absolute; inset: 0; z-index: -1;
    background: linear-gradient(90deg, rgba(0,0,0,.45), rgba(0,0,0,.15) 50%, rgba(0,0,0,.45));
  }
  .meta { min-width: 0; }
  .title { font-size: 12px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .artist { font-size: 11px; opacity: .75; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 1px; }
  .pill.empty .title { font-weight: 400; font-size: 12px; color: var(--vscode-descriptionForeground); }
  .controls { display: flex; align-items: center; gap: 2px; }
  button {
    background: none; border: none; color: inherit; cursor: pointer;
    padding: 6px; border-radius: 50%; display: grid; place-items: center;
  }
  button:hover { background: rgba(255,255,255,.14); }
  button:focus-visible { outline: 1px solid var(--vscode-focusBorder); }
  svg { width: 16px; height: 16px; fill: currentColor; filter: drop-shadow(0 1px 1px rgba(0,0,0,.4)); }
  button.main svg { width: 24px; height: 24px; }
  .time { font-size: 11px; text-align: right; opacity: .85; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .time .sep { margin: 0 3px; opacity: .6; }
  .bar { position: absolute; left: 18px; right: 18px; bottom: 5px; height: 2px; border-radius: 1px; background: rgba(255,255,255,.22); }
  .pill:not(.has-art) .bar { background: var(--vscode-scrollbarSlider-background); }
  .fill { height: 100%; width: 0; border-radius: 1px; background: currentColor; }
  @media (max-width: 280px) { .time .sep, .time .dur { display: none; } }
</style>
</head>
<body>
  <div id="pill" class="pill empty">
    <img id="bg" class="bg" alt="">
    <div class="meta">
      <div id="title" class="title">Nada tocando no navegador.</div>
      <div id="artist" class="artist"></div>
    </div>
    <div class="controls">
      <button data-cmd="prev" title="Anterior" aria-label="Anterior">
        <svg viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>
      </button>
      <button data-cmd="toggle" class="main" id="toggle" title="Tocar/pausar" aria-label="Tocar/pausar">
        <svg id="icon" viewBox="0 0 24 24"></svg>
      </button>
      <button data-cmd="next" title="Próximo" aria-label="Próximo">
        <svg viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
      </button>
    </div>
    <div class="time"><span id="pos">0:00</span><span class="sep">/</span><span id="dur" class="dur">0:00</span></div>
    <div class="bar"><div id="fill" class="fill"></div></div>
  </div>

<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const $ = (id) => document.getElementById(id);
  const PLAY = '<path d="M8 5v14l11-7z"/>';
  const PAUSE = '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>';

  let s = { active: false };
  let hasArt = false;
  let lastTick = performance.now();

  const fmt = (t) => {
    t = Math.max(0, Math.floor(t || 0));
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = String(t % 60).padStart(2, '0');
    return h ? h + ':' + String(m).padStart(2, '0') + ':' + sec : m + ':' + sec;
  };

  document.querySelectorAll('button[data-cmd]').forEach((b) =>
    b.addEventListener('click', () => vscode.postMessage({ cmd: b.dataset.cmd })));

  window.addEventListener('message', (e) => {
    const m = e.data;
    if ('thumb' in m) {
      hasArt = !!m.thumb;
      if (m.thumb) $('bg').src = m.thumb;
    }
    s = m;
    lastTick = performance.now();
    render();
  });

  function render() {
    const pill = $('pill');
    pill.classList.toggle('empty', !s.active);
    pill.classList.toggle('has-art', !!s.active && hasArt);
    if (!s.active) { $('title').textContent = 'Nada tocando no navegador.'; return; }
    $('title').textContent = s.title || 'Sem título';
    $('title').title = s.title || '';
    $('artist').textContent = s.artist || '';
    $('icon').innerHTML = s.playing ? PAUSE : PLAY;
    $('toggle').setAttribute('aria-label', s.playing ? 'Pausar' : 'Tocar');
    progress();
  }

  // Interpola o progresso entre as atualizações (que chegam a cada 500 ms).
  function progress() {
    if (!s.active) return;
    let pos = s.position || 0;
    if (s.playing) pos += (performance.now() - lastTick) / 1000;
    if (s.duration) pos = Math.min(pos, s.duration);
    $('pos').textContent = fmt(pos);
    $('dur').textContent = fmt(s.duration);
    $('fill').style.width = s.duration ? (pos / s.duration * 100) + '%' : '0';
  }
  setInterval(progress, 250);
</script>
</body>
</html>`;
}

function deactivate() {
  disposed = true;
  if (proc) { proc.stdin.end(); proc.kill(); }
}

module.exports = { activate, deactivate };

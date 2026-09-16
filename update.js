'use strict';
/* 更新窗口 renderer（设计档 §2.6 U-4/U-5/U-13）：纯展示，不决策。 */
const api = window.updAPI;
const $ = (id) => document.getElementById(id);

let mode = 'app';
let harnessStart = 0;
let harnessTimer = null;

function show(id) { $(id).classList.remove('hidden'); }
function hide(id) { $(id).classList.add('hidden'); }
function setText(id, text) { $(id).textContent = text; }

function hideAllButtons() {
  hide('retry-btn'); hide('cancel-btn'); hide('install-btn'); hide('close-btn');
}

/** Harness 不确定进度：显示已用时（U-5）。 */
function startElapsed() {
  harnessStart = Date.now();
  clearInterval(harnessTimer);
  show('elapsed');
  harnessTimer = setInterval(() => {
    const s = Math.floor((Date.now() - harnessStart) / 1000);
    setText('elapsed', '已用时 ' + Math.floor(s / 60) + ' 分 ' + (s % 60) + ' 秒');
  }, 1000);
}
function stopElapsed() {
  clearInterval(harnessTimer);
  harnessStart = 0;
  hide('elapsed');
}

// ---- App 模式（U-4）：下载中 {percent}% → 校验中 → 就绪（安装并重启）→ 错误（重试/关闭） ----
function renderApp(status) {
  hideAllButtons();
  if (status.phase === 'downloading') {
    show('progress-wrap');
    setText('status-text', '正在下载更新包…');
    const pct = Math.max(0, Math.min(100, status.percent || 0));
    $('progress-fill').style.width = pct + '%';
    setText('percent-text', pct + '%');
    show('cancel-btn');
  } else if (status.phase === 'verifying') {
    show('progress-wrap');
    setText('status-text', '正在校验 sha256…');
    $('progress-fill').style.width = '100%';
    setText('percent-text', '');
  } else if (status.phase === 'ready') {
    hide('progress-wrap');
    setText('status-text', '✅ sha256 校验通过，可以安装');
    setText('percent-text', '');
    show('install-btn');
    show('close-btn');
  } else if (status.phase === 'error' || status.phase === 'canceled') {
    hide('progress-wrap');
    setText('status-text', status.phase === 'canceled' ? '已取消' : '❌ ' + (status.message || '更新失败'));
    setText('percent-text', '');
    show('retry-btn');
    show('close-btn');
  }
}

// ---- Harness 模式（U-5）：安装依赖中（已用时）→ 验证中 → 切换并重启 → 完成（3s 自动关闭）→ 错误 ----
function renderHarness(status) {
  hideAllButtons();
  hide('progress-wrap');
  if (status.phase === 'installing') {
    setText('status-text', '正在安装依赖（需要几分钟）…');
    if (!harnessStart) startElapsed();
    show('cancel-btn');
  } else if (status.phase === 'verifying') {
    setText('status-text', '正在验证新版本…');
    show('cancel-btn');
  } else if (status.phase === 'switching') {
    setText('status-text', '正在切换并重启后端…');
  } else if (status.phase === 'done') {
    stopElapsed();
    setText('status-text', '✅ 更新完成');
    setTimeout(() => api.closeWindow(), 3000);
  } else if (status.phase === 'error' || status.phase === 'canceled') {
    stopElapsed();
    setText('status-text', status.phase === 'canceled' ? '已取消' : '❌ ' + (status.message || '更新失败，旧版不受影响，可重试'));
    show('retry-btn');
    show('close-btn');
  }
}

// ---- 按钮事件（U-13：关闭只关窗不取消；取消 → 中止在途并清临时，回到可重试态） ----
$('cancel-btn').onclick = () => { setText('status-text', '正在取消…'); api.cancel(); };
$('install-btn').onclick = () => api.installNow();
$('retry-btn').onclick = () => api.retry();
$('close-btn').onclick = () => api.closeWindow();

api.onStatus((status) => {
  if (!status) return;
  if (status.mode === 'harness' && mode !== 'harness') {
    mode = 'harness';
    document.title = '更新 Harness';
    setText('heading', '更新 Harness');
  }
  if (mode === 'harness') renderHarness(status);
  else renderApp(status);
});

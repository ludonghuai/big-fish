'use strict';
/* Bigfish 市场更新逻辑（AC10，设计档 §2.2.5）——market.js 的辅助模块，经 market.html
   同页 <script> 加载、共享全局作用域：使用 market.js 定义的 api/state/toast/setBusy/doRestart/refreshState。
   独立成文件的原因：market.js 有 ≤500 行的硬上限（评审 #5），更新动作逻辑外置于此。 */

/** 卡片 → 更新项（主进程按与 normalizePlugin 相同的 id 口径计算下发）。 */
function updOf(p) {
  return state.updates.find((u) => u.id === p.id);
}

/** 单个更新：走既有 pnpm 通道（market:update → installPlugin + 一次 restartBackend），结果 toast。 */
async function doUpdate(upd) {
  if (state.busy) return;
  setBusy(true);
  try {
    const res = await api.update(upd.updateSpec);
    if (!res.ok) { toast('更新失败：' + res.message, 'err', []); return; }
    toast('✅ 已更新 ' + upd.name, 'ok', [
      { label: '立即重启', cls: 'primary', run: () => doRestart() },
      { label: '稍后重启', run: () => {} },
    ]);
  } catch (err) {
    toast('更新出错：' + ((err && err.message) || err), 'err', []);
  } finally {
    setBusy(false);
  }
  refreshState();
}

/** 全部更新：逐项执行，汇总 toast（成功 N / 失败 M），主进程侧装完全部后一次重启。 */
async function doUpdateAll() {
  if (state.busy) return;
  setBusy(true);
  try {
    const results = await api.updateAll();
    let okN = 0;
    let failN = 0;
    for (const r of results) { if (r.ok) okN++; else failN++; }
    toast('全部更新：成功 ' + okN + ' 项 / 失败 ' + failN + ' 项', failN ? 'err' : 'ok', [
      { label: '立即重启', cls: 'primary', run: () => doRestart() },
      { label: '稍后重启', run: () => {} },
    ]);
  } catch (err) {
    toast('全部更新出错：' + ((err && err.message) || err), 'err', []);
  } finally {
    setBusy(false);
  }
  refreshState();
}

document.getElementById('update-all').onclick = () => doUpdateAll();

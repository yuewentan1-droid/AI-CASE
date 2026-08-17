// 通用 UI：toast、模块切换、进度条、折叠面板
import { isPipelineLocked } from './store.js';
import { refreshOverflowHint } from './layout/overflowHint.js';
const $ = (id) => document.getElementById(id);

let toastTimer = null;
export function toast(msg, type) {
  const el = $('toast');
  el.textContent = msg;
  el.className = type ? `show ${type}` : 'show';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = ''; }, 2400);
}

// 加载态 toast：显示后持续可见，直到被普通 toast 替换（导出等耗时操作使用）
// 避免用户点击导出后因 AI 生成文件名等待而无任何反馈
export function showLoadingToast(msg) {
  const el = $('toast');
  clearTimeout(toastTimer); // 取消可能遗留的自动隐藏计时，保证加载提示持续显示
  el.textContent = msg;
  el.className = 'show loading';
}

// 工具栏驱动的模块切换：显示对应模块，同步工具栏高亮（里程碑未解锁则忽略）
let _moduleShownHook = null; // 模块切换后的钩子（main.js 注册，用于切回时恢复评审等）
export function setModuleShownHook(fn) { _moduleShownHook = fn; }

export function showModule(name) {
  if (isPipelineLocked(name)) return;
  document.querySelectorAll('.module').forEach((m) => m.classList.toggle('active', m.dataset.module === name));
  document.querySelectorAll('.tbtn[data-module]').forEach((b) => b.classList.toggle('active', b.dataset.module === name));
  // 离开首页即移除首页隐藏态，左侧工具栏滑出常驻
  const layout = document.querySelector('.app-layout');
  if (name !== 'home') layout.classList.remove('home-hidden');
  // 切换到其它功能页时自动收起右侧文件预览，回到默认布局；再次预览需回到文件点击
  layout.classList.remove('preview-center');
  layout.classList.add('preview-hidden');
  document.getElementById('right').classList.remove('open');
  document.getElementById('center').scrollTop = 0;
  // 模块切换完成后回调，供恢复评审内容等场景使用
  if (_moduleShownHook) _moduleShownHook(name);
}

// 进度条：显示并推进到 pct%（0-100）
export function showProgress(pct, text) {
  const wrap = $('progress');
  wrap.classList.remove('hidden');
  $('progress-bar').style.width = `${pct}%`;
  $('progress-pct').textContent = `${Math.round(pct)}%`;
  if (text) $('progress-text').textContent = text;
}

export function hideProgress() {
  $('progress').classList.add('hidden');
  $('progress-bar').style.width = '0%';
  $('progress-pct').textContent = '0%';
}

// 折叠面板：返回 accordion 区块 HTML（默认折叠，标题可展开/收起）
export function accordionSection(title, bodyHtml, badgeHtml = '') {
  return `
    <div class="accordion">
      <div class="accordion-head" role="button" tabindex="0">
        <span class="accordion-arrow">▸</span>
        <span class="accordion-title">${title}</span>
        ${badgeHtml}
      </div>
      <div class="accordion-body">${bodyHtml}</div>
    </div>`;
}

// 为容器内的折叠面板绑定展开/收起；切换后刷新溢出提示，避免展开内容被裁剪且无法再次收起
export function bindAccordions(root) {
  root.querySelectorAll('.accordion-head').forEach((head) => {
    head.addEventListener('click', () => {
      const acc = head.parentElement;
      acc.classList.toggle('open');
      head.querySelector('.accordion-arrow').textContent = acc.classList.contains('open') ? '▾' : '▸';
      if (typeof refreshOverflowHint === 'function') refreshOverflowHint(root);
    });
  });
}

// 里程碑完成后引导：提示是否跳转下一步
export function promptNextStep(doneLabel, nextModule, nextLabel) {
  openModal(`
    <div class="modal-title"><span class="ok-icon">✓</span>${doneLabel} 已完成</div>
    <div class="modal-body">是否前往下一步「${nextLabel}」？</div>
    <div class="modal-actions">
      <button type="button" class="btn ghost" id="modal-stay">留在本页</button>
      <button type="button" class="btn" id="modal-next">前往${nextLabel} →</button>
    </div>
  `);
  const stay = $('modal-stay');
  const next = $('modal-next');
  if (stay) stay.addEventListener('click', closeModal);
  if (next) next.addEventListener('click', () => { closeModal(); showModule(nextModule); });
}

// 通用弹窗：openModal 渲染内容，closeModal 关闭；点遮罩可关闭
let modalBound = false;
export function openModal(html) {
  const m = $('modal');
  m.innerHTML = `<div class="modal-card">${html}</div>`;
  m.classList.remove('hidden');
  if (!modalBound) {
    m.addEventListener('click', (e) => { if (e.target === m) closeModal(); });
    modalBound = true;
  }
}
export function closeModal() {
  $('modal').classList.add('hidden');
}

// 统一错误弹窗：所有报错都用整洁弹窗展示，避免长文本挤乱页面布局
export function showErrorModal(title, detail) {
  openModal(`
    <div class="modal-title err"><span class="ok-icon">✗</span>${title}</div>
    <div class="modal-error-detail"><pre>${detail || '未知错误'}</pre></div>
    <div class="modal-actions"><button type="button" class="btn" id="modal-ok">知道了</button></div>
  `);
  const ok = $('modal-ok');
  if (ok) ok.addEventListener('click', closeModal);
}

// 将文本保存为文件：优先弹系统「另存为」对话框让用户选择保存路径；
// 浏览器不支持 File System Access API 时回退为下载到浏览器默认下载目录
export async function downloadTextFile(filename, content) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  // 用户点击触发的异步内调用（persistNamed 开头即调用），仍处于用户激活窗口，可弹出保存对话框
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: '文本文件', accept: { 'text/plain': ['.txt'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return true; // 用户已选择路径并保存成功
    } catch (e) {
      if (e && e.name === 'AbortError') return false; // 用户取消
      // 其它错误回退到下载
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a); // 部分浏览器需 anchor 挂入 DOM 才触发下载
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  return true;
}

// 顶部文件条 + 文件管理：批量上传以 chip / 正方形卡片展示；文件管理默认折叠、分页、可勾选多选作为追加分析
import { getUploadedFiles, setUploadedFiles, getCurrentUpload, getSelectedNames, setSelectedNames, toggleSelectedName, getSessionId } from '../store.js';
import { toast, showModule, openModal, closeModal } from '../ui.js';
import { deleteUploads, listUploads } from '../api.js';
import { openPreview } from './rightpanel.js';
import { openFileBrowser } from './fileBrowser.js';

export function renderFileBar() {
  const bar = document.getElementById('filebar');
  // 顶部「已上传」只显示本次上传（currentUpload），刷新后清空；与持久化的文件管理分离
  const files = getCurrentUpload();
  if (!files.length) {
    // 无文件时留空，利用 CSS `.filebar:empty { display:none }` 隐藏整条顶部文件条，保持界面简洁
    bar.innerHTML = '';
    return;
  }
  // 顶部已上传：仅展示本次上传，点击预览；不提供删除（删除统一在「文件管理」做）
  let html = '<span class="fbar-title">已上传：</span>';
  files.forEach((f, i) => {
    const name = f.name || `文件 ${i + 1}`;
    const size = f.size != null ? formatSize(f.size) : '';
    html += `<span class="file-chip" data-i="${i}" title="${escapeAttr(name)}">
      <span class="chip-name">${escapeHtml(name)}</span>
      ${size ? `<span class="chip-size">${size}</span>` : ''}
    </span>`;
  });
  bar.innerHTML = html;

  bar.querySelectorAll('.file-chip[data-i]').forEach((chip) => {
    chip.addEventListener('click', () => {
      bar.querySelectorAll('.file-chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      openPreview(files[+chip.dataset.i]);
    });
  });
}

// 二次确认删除（避免误删），确认后才真正从来源目录删除
function confirmDelete(files) {
  openModal(`
    <div class="modal-title">删除文件</div>
    <p class="modal-desc">将从本地持久化目录删除 ${files.length} 个文件（已上传 / 自动保存的来源文件），删除后刷新不再恢复。是否确认？</p>
    <div class="modal-actions">
      <button type="button" class="btn ghost" id="dlg-cancel">取消</button>
      <button type="button" class="btn danger" id="dlg-ok">确认删除</button>
    </div>
  `);
  return new Promise((resolve) => {
    document.getElementById('dlg-cancel').addEventListener('click', () => { closeModal(); resolve(false); });
    document.getElementById('dlg-ok').addEventListener('click', () => { closeModal(); resolve(true); });
  });
}

async function removeFile(name) {
  const removed = getUploadedFiles().find((f) => f.name === name);
  if (!removed) return;
  if (!(await confirmDelete([removed]))) return;
  const res = await deleteUploads(getSessionId(), [removed.name]); // 同步从本地磁盘移除，确认成功才更新界面
  if (!res || !res.success) { toast('删除失败，请重试', 'err'); return; }
  setUploadedFiles(getUploadedFiles().filter((f) => f.name !== name));
  toggleSelectedName(removed.name, false); // 移除文件同步取消勾选
  renderFileBar();
  renderFileList();
  toast('已删除该文件', 'ok');
}

// 文件管理：默认折叠，靠左排开，一行 10 个、默认 2 行一页（20 个），超出分页；可勾选多选作为「追加 AI 分析」文件
const FILES_PER_PAGE = 20;
let flPage = 1;
let flQuery = '';   // 文件管理搜索关键字（按文件名子串或后缀过滤）

// 文件管理展开：移除折叠，让文件卡可见（上传/保存/刷新恢复后调用，避免文件被隐藏）
export function expandFileList() {
  const box = document.getElementById('file-manager-list');
  if (box) box.classList.remove('collapsed');
}

// 刷新后恢复该会话已持久化的上传文件（除非用户删除，否则从本地重新读取展示）
export async function restoreUploadedFiles() {
  const session = getSessionId();
  if (!session) return;
  const res = await listUploads(session);
  if (res && res.success && res.files && res.files.length) {
    setUploadedFiles(res.files.map((f) => ({ name: f.name, size: f.size, path: f.path, restored: true, _ts: f.mtime * 1000 })));
    // 仅恢复「文件管理」（持久化）；顶部「已上传」为本次上传，刷新后保持为空
    expandFileList(); // 恢复后展开，让持久化的文件可见
    renderFileList();
  }
}

export function renderFileList() {
  const box = document.getElementById('file-manager-list');
  const files = getUploadedFiles();
  const collapsed = box.classList.contains('collapsed');
  // 计数与标题同排展示（在「文件管理」标题行）
  const countEl = document.getElementById('fl-count');
  if (countEl) countEl.textContent = files.length ? `共 ${files.length} 个文件 · 勾选「追加分析」纳入 AI 分析` : '';
  if (!files.length) {
    box.classList.add('collapsed');
    box.innerHTML = '';
    return;
  }

  const sel = getSelectedNames();
  // 按时间戳降序（最新在前）：_ts 缺失时置 0 排到末尾；再按搜索关键字过滤
  const sorted = files.slice().sort((a, b) => ((b._ts || 0) - (a._ts || 0))).filter((f) => matches(f, flQuery));
  const totalPages = Math.max(1, Math.ceil(sorted.length / FILES_PER_PAGE));
  if (flPage > totalPages) flPage = totalPages;
  const start = (flPage - 1) * FILES_PER_PAGE;
  const page = sorted.slice(start, start + FILES_PER_PAGE);

  // 卡片网格（折叠时隐藏），10 个一排、2 行一页；搜索无匹配时展示空状态（同文件浏览器）
  let html = '';
  if (!sorted.length) {
    html = `<div class="uc-grid fl-grid${collapsed ? ' collapsed' : ''}"><p class="fl-empty">未找到匹配文件</p></div>`;
  } else {
  html += `<div class="uc-grid fl-grid${collapsed ? ' collapsed' : ''}">`;
  html += page.map((f, idx) => {
    const name = f.name || `文件 ${idx + 1}`;
    const size = f.size != null ? formatSize(f.size) : '';
    const checked = sel.has(name) ? ' checked' : '';
    return `<div class="uc-card file fl-item" data-i="${start + idx}" data-name="${escapeAttr(name)}" title="点击预览">
      <div class="uc-head"><span class="uc-name" title="${escapeAttr(name)}">${escapeHtml(name)}</span></div>
      <div class="uc-icon"><span class="uc-ext">${escapeHtml(fileExt(name))}</span></div>
      <div class="uc-sub">${size}</div>
      <div class="fl-actions">
        <label class="fl-check"><input type="checkbox" class="fl-sel" data-name="${escapeAttr(name)}"${checked}> 追加分析</label>
        <button type="button" class="fl-x" title="删除该文件">×</button>
      </div>
    </div>`;
  }).join('');
  html += '</div>';
  }

  if (totalPages > 1) {
    html += `<div class="fl-pager">
      <button type="button" class="btn sm ghost" data-page="${flPage - 1}"${flPage <= 1 ? ' disabled' : ''}>上一页</button>
      <span>第 ${flPage} / ${totalPages} 页</span>
      <button type="button" class="btn sm ghost" data-page="${flPage + 1}"${flPage >= totalPages ? ' disabled' : ''}>下一页</button>
    </div>`;
  }
  box.innerHTML = html;

  // 标题展开/收起箭头同步状态
  const caret = document.querySelector('.fl-caret');
  if (caret) caret.textContent = collapsed ? '▶' : '▼';

  // 点击卡片 → 右侧预览；勾选框与删除按钮单独控制（互不误触）
  box.querySelectorAll('.fl-item').forEach((card) => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.fl-actions')) return;
      box.querySelectorAll('.fl-item').forEach((c) => c.classList.remove('active'));
      card.classList.add('active');
      openPreview(sorted[+card.dataset.i]);
    });
  });
  box.querySelectorAll('.fl-actions').forEach((l) => {
    l.addEventListener('click', (e) => e.stopPropagation());
  });
  box.querySelectorAll('.fl-sel').forEach((cb) => {
    cb.addEventListener('change', () => {
      toggleSelectedName(cb.dataset.name, cb.checked);
      if (!cb.checked) return; // 仅勾选时提示
      // 勾选「追加分析」：引导去需求评审，或留在本页继续上传/输入
      openModal(`
        <div class="modal-title">已勾选「追加分析」</div>
        <p class="modal-desc">是否立即前往需求评审开始分析？或留在当前页继续上传文件 / 补充输入。</p>
        <div class="modal-actions">
          <button type="button" class="btn ghost" id="flj-stay">留在当前页</button>
          <button type="button" class="btn" id="flj-go">去需求评审</button>
        </div>
      `);
      document.getElementById('flj-stay').addEventListener('click', () => closeModal());
      document.getElementById('flj-go').addEventListener('click', () => {
        closeModal();
        showModule('analysis');
        const btn = document.getElementById('analyze-btn');
        btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
        btn.classList.add('pulse');
        setTimeout(() => btn.classList.remove('pulse'), 1600);
      });
    });
  });
  // 卡片内删除按钮：二次确认后从本地来源目录真正删除
  box.querySelectorAll('.fl-x').forEach((x) => {
    x.addEventListener('click', () => removeFile(x.closest('.fl-item').dataset.name || sorted[+x.closest('.fl-item').dataset.i]?.name));
  });
  box.querySelectorAll('.fl-pager button').forEach((b) => {
    b.addEventListener('click', () => { flPage = +b.dataset.page; renderFileList(); });
  });
}

// 「打开目录」：打开应用内自定义文件浏览器弹窗（不触发展开/收起，也不打开系统资源管理器）
export function initOpenDir() {
  const btn = document.getElementById('fl-open-dir');
  if (!btn) return;
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!getSessionId()) { toast('请先上传文件', 'err'); return; }
    try {
      await openFileBrowser();
    } catch (err) {
      toast('打开文件浏览器失败', 'err');
    }
  });
}

// 「文件管理」标题行搜索框：按文件名/后缀实时过滤（逻辑参考文件浏览器 .fb-search）；不触发展开/收起
export function initFileSearch() {
  const input = document.getElementById('fl-search');
  if (!input) return;
  input.addEventListener('click', (e) => e.stopPropagation());
  input.addEventListener('mousedown', (e) => e.stopPropagation());
  input.addEventListener('input', () => {
    flQuery = input.value;
    flPage = 1;
    renderFileList();
  });
}

// 点击「文件管理」标题展开/收起
export function initFileManagerToggle() {
  const title = document.getElementById('fl-title');
  const box = document.getElementById('file-manager-list');
  title.addEventListener('click', () => {
    box.classList.toggle('collapsed');
    renderFileList();
  });
}

// 提取文件扩展名（大写），用于文件卡的图标区展示
function fileExt(name) {
  const m = /\.([A-Za-z0-9]+)$/.exec(name || '');
  return m ? m[1].toUpperCase() : 'FILE';
}

// 过滤：按文件名子串 或 文件后缀（含 . 或不含）匹配（与文件浏览器 .fb-search 逻辑一致）
function matches(f, q) {
  if (!q) return true;
  const qq = q.trim().toLowerCase();
  if (!qq) return true;
  const name = (f.name || '').toLowerCase();
  if (name.includes(qq)) return true;
  const m = /\.([A-Za-z0-9]+)$/.exec(f.name || '');
  const ext = m ? m[1].toLowerCase() : '';
  return ext === qq.replace(/^\./, '');
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, '&quot;');
}

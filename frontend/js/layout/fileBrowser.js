// 自定义文件浏览器弹窗：读取本地上传目录，列表展示，5 个/页分页、可排序、可按文件名/后缀搜索、支持批量删除
// 不打开系统资源管理器，改为应用内居中弹窗读取文件（最新在前，默认按修改时间降序）
import { openModal, closeModal, toast } from '../ui.js';
import { getSessionId } from '../store.js';
import { listUploads, deleteUploads, openLocalDir } from '../api.js';
import { renderFileList } from './filebar.js';

const PAGE_SIZE = 10;
let files = [];        // 当前目录文件（含 mtime，后端已按时间戳降序）
let page = 1;          // 当前页码
let sortKey = 'time';  // 排序字段：name / size / time
let sortDir = 'desc';  // 排序方向：asc / desc（默认时间降序，最新在前）
let query = '';        // 搜索关键字
let selected = new Set(); // 已勾选删除的文件名

function fileExt(name) {
  const m = /\.([A-Za-z0-9]+)$/.exec(name || '');
  return m ? m[1].toLowerCase() : '';
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(sec) {
  if (!sec) return '-';
  const d = new Date(sec * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, '&quot;');
}

// 过滤：按文件名子串 或 文件后缀（含 . 或不含）匹配
function matches(f, q) {
  if (!q) return true;
  const qq = q.trim().toLowerCase();
  if (!qq) return true;
  const name = (f.name || '').toLowerCase();
  if (name.includes(qq)) return true;
  const ext = fileExt(f.name);
  const qExt = qq.replace(/^\./, '');
  return ext === qExt;
}

// 排序后的视图列表（先过滤、再排序）
function view() {
  let list = files.filter((f) => matches(f, query));
  const sign = sortDir === 'asc' ? 1 : -1;
  list.sort((a, b) => {
    let r;
    if (sortKey === 'name') r = (a.name || '').localeCompare(b.name || '');
    else if (sortKey === 'size') r = (a.size || 0) - (b.size || 0);
    else r = (a.mtime || 0) - (b.mtime || 0);
    return r * sign;
  });
  return list;
}

function sortLabel() {
  return { name: '名称', size: '大小', time: '时间' }[sortKey] || '时间';
}

function toggleSort(key) {
  if (sortKey === key) {
    sortDir = sortDir === 'asc' ? 'desc' : 'asc';
  } else {
    sortKey = key;
    sortDir = 'desc';
  }
  page = 1;
  render();
}

function render() {
  const list = view();
  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (page > totalPages) page = totalPages;
  const start = (page - 1) * PAGE_SIZE;
  const pageFiles = list.slice(start, start + PAGE_SIZE);

  const arrow = (key) => {
    if (sortKey !== key) return '';
    return sortDir === 'asc' ? ' ↑' : ' ↓';
  };

  let rows = '';
  if (!total) {
    rows = '<div class="fb-empty">未找到文件</div>';
  } else {
    rows = pageFiles.map((f) => {
      const name = f.name || '';
      const checked = selected.has(name) ? ' checked' : '';
      return `<div class="fb-row${checked ? ' sel' : ''}" data-name="${escapeAttr(name)}">
        <label class="fb-check"><input type="checkbox" class="fb-sel" data-name="${escapeAttr(name)}"${checked}></label>
        <span class="fb-name" title="${escapeAttr(name)}">${escapeHtml(name)}</span>
        <span class="fb-ext">${escapeHtml(fileExt(name).toUpperCase() || 'FILE')}</span>
        <span class="fb-size">${formatSize(f.size)}</span>
        <span class="fb-time">${formatTime(f.mtime)}</span>
      </div>`;
    }).join('');
  }

  const pager = totalPages > 1
    ? `<div class="fb-pager">
        <button type="button" class="btn sm ghost" data-page="${page - 1}"${page <= 1 ? ' disabled' : ''}>上一页</button>
        <span>第 ${page} / ${totalPages} 页</span>
        <button type="button" class="btn sm ghost" data-page="${page + 1}"${page >= totalPages ? ' disabled' : ''}>下一页</button>
      </div>`
    : '';

  openModal(`
    <div class="modal-title">文件浏览器
      <span class="fb-hint">共 ${total} 个 · 最新在前</span>
      <span class="fb-count">已选 ${selected.size} 个</span>
    </div>
    <div class="fb-toolbar">
      <input type="text" class="modal-input fb-search" placeholder="按文件名或后缀搜索（如 txt / .md）" value="${escapeAttr(query)}">
      <div class="fb-sorts">
        <button type="button" class="btn sm ghost" data-sort="name">名称${arrow('name')}</button>
        <button type="button" class="btn sm ghost" data-sort="size">大小${arrow('size')}</button>
        <button type="button" class="btn sm ghost" data-sort="time">时间${arrow('time')}</button>
      </div>
      <button type="button" class="btn sm ghost" id="fb-close">关闭</button>
      <button type="button" class="btn sm ghost" id="fb-open-dir">打开本地目录</button>
      <button type="button" class="btn sm danger" id="fb-delete"${selected.size ? '' : ' disabled'}>删除选中（${selected.size}）</button>
    </div>
    <div class="fb-head">
      <span class="fb-check">选</span>
      <span class="fb-name">文件名</span>
      <span class="fb-ext">类型</span>
      <span class="fb-size">大小</span>
      <span class="fb-time">修改时间</span>
    </div>
    <div class="fb-list${totalPages > 1 ? ' has-pager' : ''}">${rows}</div>
    ${pager}
  `);

  // 加宽弹窗卡片（自定义文件浏览器样式）
  const card = document.querySelector('#modal .modal-card');
  if (card) card.classList.add('fb-card');
  // 搜索输入（防抖过滤）
  const search = document.querySelector('.fb-search');
  if (search) {
    search.focus();
    search.addEventListener('input', () => {
      query = search.value;
      page = 1;
      render();
    });
  }
  // 排序
  document.querySelectorAll('.fb-sorts [data-sort]').forEach((b) => {
    b.addEventListener('click', () => toggleSort(b.dataset.sort));
  });
  // 行点击切换勾选
  document.querySelectorAll('.fb-row').forEach((row) => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('.fb-sel')) return; // 交给 checkbox change
      const cb = row.querySelector('.fb-sel');
      if (cb) { cb.checked = !cb.checked; cb.dispatchEvent(new Event('change')); }
    });
  });
  document.querySelectorAll('.fb-sel').forEach((cb) => {
    cb.addEventListener('change', () => {
      if (cb.checked) selected.add(cb.dataset.name);
      else selected.delete(cb.dataset.name);
      render();
    });
  });
  // 分页
  document.querySelectorAll('.fb-pager button').forEach((b) => {
    b.addEventListener('click', () => { page = +b.dataset.page; render(); });
  });
  document.getElementById('fb-close').addEventListener('click', closeModal);
  document.getElementById('fb-delete').addEventListener('click', () => onDelete());
  document.getElementById('fb-open-dir').addEventListener('click', () => onOpenDir());
}

// 打开本地上传目录（系统文件管理器），便于用户核查实际落盘数据
async function onOpenDir() {
  const session = getSessionId();
  if (!session) { toast('请先上传文件', 'err'); return; }
  const res = await openLocalDir(session);
  if (res && res.success) toast('已在系统文件管理器中打开本地目录', 'ok');
  else toast('打开本地目录失败', 'err');
}

// 批量删除：二次确认后调后端删除，刷新弹窗并同步「文件管理」
async function onDelete() {
  const names = [...selected];
  if (!names.length) return;
  const ok = await confirmDelete(names.length);
  if (!ok) return;
  const res = await deleteUploads(getSessionId(), names);
  if (!res || !res.success) { toast('删除失败，请重试', 'err'); return; }
  const removed = new Set(res.removed || []);
  selected = new Set([...selected].filter((n) => !removed.has(n)));
  files = files.filter((f) => !removed.has(f.name));
  page = 1;
  toast(`已删除 ${removed.size} 个文件`, 'ok');
  render();
  renderFileList(); // 同步主界面「文件管理」
}

function confirmDelete(count) {
  return new Promise((resolve) => {
    openModal(`
      <div class="modal-title">批量删除</div>
      <p class="modal-desc">将从本地持久化目录删除选中的 ${count} 个文件，删除后刷新不再恢复。是否确认？</p>
      <div class="modal-actions">
        <button type="button" class="btn ghost" id="fbc-cancel">取消</button>
        <button type="button" class="btn danger" id="fbc-ok">确认删除</button>
      </div>
    `);
    document.getElementById('fbc-cancel').addEventListener('click', () => { closeModal(); resolve(false); });
    document.getElementById('fbc-ok').addEventListener('click', () => { closeModal(); resolve(true); });
  });
}

// 打开文件浏览器：重新拉取目录文件并居中弹窗展示
export async function openFileBrowser() {
  const session = getSessionId();
  if (!session) { toast('请先上传文件', 'err'); return; }
  files = [];
  selected = new Set();
  page = 1;
  sortKey = 'time';
  sortDir = 'desc';
  query = '';
  const res = await listUploads(session);
  if (res && res.success) files = res.files || [];
  render();
}

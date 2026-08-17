// 富格式文件预览：按扩展名懒加载对应渲染器
// md → marked · excel/csv → SheetJS · word → mammoth · 思维导图(mm/xmind) → jsmind
// 其余格式不处理，交回 rightpanel 走纯文本/图片渲染
import { getSessionId } from '../store.js';
import { getUploadContent } from '../api.js';

const EXT = {
  md: /\.(md|markdown)$/i,
  xlsx: /\.(xlsx|xls|csv)$/i,
  docx: /\.docx$/i,
  mm: /\.(mm|xmind)$/i,
};

// 是否为富格式（需专用渲染器处理）
export function isRichFormat(name) {
  return EXT.md.test(name) || EXT.xlsx.test(name) || EXT.docx.test(name) || EXT.mm.test(name);
}

// 读取原始字节：优先 File 对象字节（最快）；File 失效时回退到后端已持久化文件（/upload/content）
async function readBuffer(file) {
  if (file && typeof file.arrayBuffer === 'function') {
    try {
      const buf = await file.arrayBuffer();
      if (buf && buf.byteLength > 0) return buf;
    } catch (e) { /* File 对象失效（页面交互后），回退后端持久化 */ }
  }
  const resp = await getUploadContent(getSessionId(), file.name);
  if (resp && resp.ok) {
    const buf = await resp.arrayBuffer();
    if (buf && buf.byteLength > 0) return buf;
  }
  throw new Error('无法读取文件内容');
}

function bufToText(buf) {
  return new TextDecoder('utf-8').decode(buf);
}

function escapeHtml(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// 入口：命中富格式则渲染并返回 true，否则返回 false 交回默认渲染
export async function renderPreview(file, box) {
  const name = file.name || '';
  if (EXT.md.test(name)) return renderMarkdown(file, box);
  if (EXT.xlsx.test(name)) return renderExcel(file, box);
  if (EXT.docx.test(name)) return renderDocx(file, box);
  if (EXT.mm.test(name)) return renderMindMap(file, box);
  return false;
}

// Markdown：marked 渲染为 HTML（GFM + 换行）
async function renderMarkdown(file, box) {
  box.innerHTML = '<p class="file-empty">渲染中...</p>';
  try {
    const md = bufToText(await readBuffer(file));
    const { marked } = await import('marked');
    marked.setOptions({ gfm: true, breaks: true });
    box.innerHTML = `<div class="md-preview">${marked.parse(md)}</div>`;
  } catch (err) {
    box.innerHTML = '<p class="file-empty">Markdown 渲染失败</p>';
  }
  return true;
}

// Excel / CSV：SheetJS 逐工作表转 HTML 表格（无内容的 Sheet 默认不显示，首表始终展示）
async function renderExcel(file, box) {
  box.innerHTML = '<p class="file-empty">渲染中...</p>';
  try {
    const buf = await readBuffer(file);
    const XLSX = await import('xlsx');
    const wb = XLSX.read(buf, { type: 'array' });
    // 仅展示有内容的 Sheet：首表始终展示，其余 Sheet 无有效数据则跳过
    const sheets = wb.SheetNames
      .filter((sn, i) => i === 0 || sheetHasData(XLSX, wb.Sheets[sn]))
      .map((sn, i) => {
        const html = XLSX.utils.sheet_to_html(wb.Sheets[sn]);
        return `${i ? `<h4 class="xl-sheet-title">${escapeHtml(sn)}</h4>` : ''}${html}`;
      })
      .join('');
    box.innerHTML = `<div class="xl-preview">${sheets}</div>`;
  } catch (err) {
    box.innerHTML = '<p class="file-empty">Excel 渲染失败</p>';
  }
  return true;
}

// 判断 Sheet 是否含有效数据：任一单元格存在非空值即视为有内容（无 !ref 视为空）
function sheetHasData(XLSX, ws) {
  const ref = ws['!ref'];
  if (!ref) return false;
  const range = XLSX.utils.decode_range(ref);
  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (cell && cell.v !== undefined && cell.v !== null && String(cell.v) !== '') {
        return true;
      }
    }
  }
  return false;
}

// Word：mammoth 将 docx 转为 HTML
async function renderDocx(file, box) {
  box.innerHTML = '<p class="file-empty">渲染中...</p>';
  try {
    const buf = await readBuffer(file);
    const mammoth = await import('mammoth/mammoth.browser.js');
    const result = await mammoth.convertToHtml({ arrayBuffer: buf });
    box.innerHTML = `<div class="docx-preview">${result.value}</div>`;
  } catch (err) {
    box.innerHTML = '<p class="file-empty">Word 渲染失败</p>';
  }
  return true;
}

// 思维导图：jsmind 渲染 FreeMind(.mm)；.xmind 为 ZIP 容器，先转成 .mm 再渲染
async function renderMindMap(file, box) {
  box.innerHTML = '<p class="file-empty">渲染中...</p>';
  try {
    const buf = await readBuffer(file);
    let xml;
    if (/\.xmind$/i.test(file.name)) {
      xml = await xmindToMm(buf);
    } else {
      xml = bufToText(buf);
    }
    const mod = await import('jsmind');
    await import('jsmind/style/jsmind.css');
    const JM = mod.default || window.jsMind || mod.jsMind;
    if (!JM) throw new Error('jsMind 加载失败');
    // 思维导图默认折叠到一级主题（根 + 直接子主题可见，更深层收起）；顶部提供「展开/折叠/复位」控制
    box.innerHTML = `
      <div class="mm-box">
        <div class="mm-toolbar">
          <button type="button" class="mm-btn" data-mm="collapse">收起全部</button>
          <button type="button" class="mm-btn" data-mm="level1">一级</button>
          <button type="button" class="mm-btn" data-mm="expand">展开全部</button>
          <span class="mm-hint">拖拽画布可平移 · 双击复位</span>
        </div>
        <div id="jsmind-container" class="jsmind-container"></div>
      </div>`;
    const el = document.getElementById('jsmind-container');
    // jsmind 0.9.x API：new jsMind({container}).show({meta, format, data})
    const jm = new JM({ container: el, editable: false, theme: 'primary' });
    jm.show({ meta: { name: file.name, author: '', version: '0.2' }, format: 'freemind', data: xml });
    // 默认折叠到一级主题（根 + 直接子主题可见，更深层收起）；节点上的 +/− 可手动逐层展开
    jm.expand_to_depth(1);
    box.querySelectorAll('.mm-btn').forEach((b) => {
      b.addEventListener('click', () => {
        if (b.dataset.mm === 'collapse') {
          // 收起全部：只保留中心主题（根），直接子主题一并收起
          const root = jm.get_root();
          if (root && root.children) root.children.forEach((c) => jm.collapse_node(c));
        }
        else if (b.dataset.mm === 'level1') jm.expand_to_depth(1);
        else jm.expand_all();
      });
    });
    // 画布拖拽平移（无滚动条，靠拖拽导航）：拖动空白/连线区平移，双击复位
    initMindMapPan(el);
  } catch (err) {
    console.error('思维导图渲染失败', err);
    box.innerHTML = '<p class="file-empty">思维导图渲染失败</p>';
  }
  return true;
}

// 画布拖拽平移：拖动空白/连线区域时用 transform 平移 jsmind-inner（无滚动条，靠拖拽导航）；双击复位到原点
function initMindMapPan(el) {
  const inner = el.querySelector('.jsmind-inner');
  if (!inner) return;
  let dragging = false, startX = 0, startY = 0, tx = 0, ty = 0;
  el.addEventListener('mousedown', (e) => {
    // 不拦截节点及其展开标记的点击（点 jmnode/jmexpander 仍交给 jsmind 展开/折叠）
    if (e.target.closest('jmnode') || e.target.closest('jmexpander')) return;
    dragging = true;
    startX = e.clientX - tx; startY = e.clientY - ty;
    el.style.cursor = 'grabbing';
  });
  el.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    tx = e.clientX - startX; ty = e.clientY - startY;
    inner.style.transform = `translate(${tx}px, ${ty}px)`;
  });
  const stop = () => { dragging = false; el.style.cursor = ''; };
  el.addEventListener('mouseup', stop);
  el.addEventListener('mouseleave', stop);
  el.addEventListener('dblclick', () => {
    tx = 0; ty = 0;
    inner.style.transform = 'translate(0,0)';
  });
}

// .xmind(ZIP) → FreeMind .mm XML：支持 XMind 2020+(content.json) 与 XMind 8(content.xml)
async function xmindToMm(buf) {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(buf);
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const head = '<?xml version="1.0" encoding="UTF-8"?>\n<map version="1.0.1">\n';
  const tail = '</map>\n';
  let mm = '';
  if (zip.files['content.json']) {
    const sheets = JSON.parse(await zip.files['content.json'].async('text'));
    const root = sheets && sheets[0] && sheets[0].rootTopic;
    mm = jsonTopicToMm(root || {}, 1, esc);
  } else if (zip.files['content.xml']) {
    const xmlText = await zip.files['content.xml'].async('text');
    const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
    const sheet = doc.getElementsByTagName('sheet')[0] || doc;
    const root = sheet.getElementsByTagName('topic')[0];
    mm = xmlTopicToMm(root, 1, esc);
  } else {
    throw new Error('XMind 缺少内容');
  }
  return head + mm + tail;
}

// jsmind 需要唯一节点 ID（缺失会退化为 'undefined' 导致碰撞），生成时带上
function makeId(seq) {
  seq.n = (seq.n || 0) + 1;
  return `node-${seq.n}`;
}

// content.json 主题树 → <node>（子主题位于 children.attached）
function jsonTopicToMm(topic, depth, esc, seq = {}) {
  const pad = '  '.repeat(depth);
  let s = `${pad}<node ID="${makeId(seq)}" TEXT="${esc(topic.title)}">\n`;
  const children = (topic.children && topic.children.attached) || [];
  children.forEach((c) => { s += jsonTopicToMm(c, depth + 1, esc, seq); });
  s += `${pad}</node>\n`;
  return s;
}

// content.xml 主题 → <node>（子主题位于 children > topics > topic）
function xmlTopicToMm(topic, depth, esc, seq = {}) {
  if (!topic) return '';
  const pad = '  '.repeat(depth);
  const titleEl = topic.getElementsByTagName('title')[0];
  let s = `${pad}<node ID="${makeId(seq)}" TEXT="${esc(titleEl ? titleEl.textContent : '')}">\n`;
  const childrenEl = topic.getElementsByTagName('children')[0];
  if (childrenEl) {
    const topicsEl = childrenEl.getElementsByTagName('topics')[0];
    if (topicsEl) {
      const kids = topicsEl.getElementsByTagName('topic');
      for (let i = 0; i < kids.length; i++) s += xmlTopicToMm(kids[i], depth + 1, esc, seq);
    }
  }
  s += `${pad}</node>\n`;
  return s;
}

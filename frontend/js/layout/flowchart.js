// 业务流程图：Mermaid 渲染 / PNG/JPEG 下载 / 点击放大 + 拖拽浏览
import { toast } from '../ui.js';

let mermaidPromise = null;
let renderSeq = 0;

// 懒加载并初始化 Mermaid（首次用到才加载）
function mermaidReady() {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((m) => {
      m.default.initialize({ startOnLoad: false, securityLevel: 'loose', theme: 'default' });
      return m.default;
    });
  }
  return mermaidPromise;
}

// 渲染流程图到容器（懒渲染：仅调用时执行）
export async function renderFlowchart(containerEl, mermaidText, type) {
  if (!containerEl) return;
  if (!mermaidText || !mermaidText.trim()) {
    containerEl.innerHTML = '<p class="file-empty">未生成业务流程图</p>';
    return;
  }
  containerEl.innerHTML = '<p class="file-empty">流程图中...</p>';
  try {
    const mermaid = await mermaidReady();
    renderSeq += 1;
    const { svg } = await mermaid.render(`fc-${renderSeq}`, mermaidText);
    containerEl.innerHTML = svg;
    containerEl.classList.add('rendered');
    if (type) {
      const tag = document.createElement('span');
      tag.className = 'fc-type';
      tag.textContent = type;
      containerEl.insertBefore(tag, containerEl.firstChild);
    }
  } catch (e) {
    containerEl.innerHTML = `<p class="file-empty">流程图渲染失败：${(e && e.message) || e}</p>`;
  }
}

// 下载流程图 PNG / JPEG：渲染好的 SVG → canvas → 图片；canvas 光栅化失败时回退直接下载 SVG
export function downloadFlowchart(containerEl, format) {
  const svgEl = containerEl && containerEl.querySelector('svg');
  if (!svgEl) { toast('请先展开流程图再下载', 'err'); return; }
  const clone = svgEl.cloneNode(true);
  // 尺寸：以 viewBox 为准，兜底有效数值，避免 0/非有限导致 canvas 为空图
  const vb = svgEl.viewBox && svgEl.viewBox.baseVal;
  const w = finiteDim(vb && vb.width, 1200);
  const h = finiteDim(vb && vb.height, 900);
  // Mermaid 输出的 SVG 可能缺 xmlns / xmlns:xlink。
  // 箭头标记用 xlink:href="#arrowhead" 引用 defs，缺 xlink 命名空间时独立 SVG 作为图片加载会解析失败 → 不触发下载。
  if (!clone.getAttribute('xmlns')) clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  if (!clone.getAttribute('xmlns:xlink')) clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  clone.setAttribute('width', w);
  clone.setAttribute('height', h);
  const str = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(new Blob([str], { type: 'image/svg+xml;charset=utf-8' }));

  // 兜底：canvas 光栅化失败时，直接以 SVG 形式下载，确保用户总能拿到文件
  const downloadSvg = () => {
    const a = document.createElement('a');
    a.href = url;
    a.download = `业务流程图_${Date.now()}.svg`;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  };

  const img = new Image();
  // 优先 onload 光栅化（对 Mermaid SVG 兼容性最好）；decode() 仅在可用时作为增强
  let done = false;
  const fail = () => { if (!done) { done = true; toast('图片生成失败，已改为下载 SVG', 'ok'); downloadSvg(); } };
  const succeed = () => {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; // JPEG 无透明，垫白底
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    canvas.toBlob((b) => {
      if (!b) { fail(); return; }
      done = true;
      const blobUrl = URL.createObjectURL(b);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `业务流程图_${Date.now()}.${format === 'png' ? 'png' : 'jpg'}`;
      a.style.display = 'none';
      document.body.appendChild(a); // 部分浏览器需 anchor 挂入 DOM 才触发下载
      a.click();
      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(blobUrl); }, 100);
      URL.revokeObjectURL(url);
    }, format === 'png' ? 'image/png' : 'image/jpeg', 0.95);
  };
  img.onload = succeed;
  img.onerror = fail;
  // 先赋值 src 再视情况调用 decode() 提升稳定性
  img.src = url;
  if (img.decode && typeof img.decode === 'function') {
    img.decode().then(() => {}).catch(() => {}); // 不阻断 onload 路径
  }
}

// 取有效的有限正数尺寸，非法（0/NaN/Infinity/负数）时回退默认值
function finiteDim(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// 点击放大 + 拖拽浏览
export function openFlowchartLightbox(containerEl) {
  const svgEl = containerEl && containerEl.querySelector('svg');
  if (!svgEl) return;
  const box = document.getElementById('flowchart-lightbox');
  const stage = box.querySelector('.fc-stage');
  const content = box.querySelector('.fc-content');
  const clone = svgEl.cloneNode(true);
  const vb = svgEl.viewBox && svgEl.viewBox.baseVal;
  if (vb && vb.width && vb.height) { clone.setAttribute('width', vb.width); clone.setAttribute('height', vb.height); }
  content.innerHTML = '';
  content.appendChild(clone);
  let scale = 1;
  const baseW = (vb && vb.width) || 1200;
  const apply = () => { clone.style.width = `${baseW * scale}px`; clone.style.height = 'auto'; };
  apply();
  box._scale = (d) => { scale = Math.min(4, Math.max(0.3, scale + d)); apply(); };
  box.classList.remove('hidden');
  document.body.classList.add('fc-lb-open');
}

// 绑定放大灯箱的关闭 / 缩放 / 拖拽
export function initFlowchartLightbox() {
  const box = document.getElementById('flowchart-lightbox');
  if (!box) return;
  const stage = box.querySelector('.fc-stage');
  const close = () => { box.classList.add('hidden'); document.body.classList.remove('fc-lb-open'); };
  box.querySelector('.fc-close').addEventListener('click', close);
  box.querySelector('.fc-zoomin').addEventListener('click', () => box._scale && box._scale(0.25));
  box.querySelector('.fc-zoomout').addEventListener('click', () => box._scale && box._scale(-0.25));
  box.addEventListener('click', (e) => { if (e.target === box) close(); });
  // 拖拽平移：改变 stage 滚动位置
  let down = false, sx = 0, sy = 0, sl = 0, st = 0;
  stage.addEventListener('mousedown', (e) => {
    down = true; sx = e.clientX; sy = e.clientY; sl = stage.scrollLeft; st = stage.scrollTop;
    stage.classList.add('panning'); e.preventDefault();
  });
  window.addEventListener('mousemove', (e) => {
    if (!down) return;
    stage.scrollLeft = sl - (e.clientX - sx);
    stage.scrollTop = st - (e.clientY - sy);
  });
  window.addEventListener('mouseup', () => { down = false; stage.classList.remove('panning'); });
}

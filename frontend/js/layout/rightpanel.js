// 右侧：文件原内容预览
// - 上传的原始 File 对象（未解析）：文本类用 FileReader 读原文，图片生成缩略图
// - 分析返回的 files[]（后端解析后 content）：直接展示 content
// - 刷新后恢复的本地文件（restored）：从 /upload/content 读取展示
import { getSessionId } from '../store.js';
import { getUploadContent } from '../api.js';
import { isRichFormat, renderPreview } from './preview.js';
import { refreshOverflowHint } from './overflowHint.js';

export function initRightPanel() {
  // 全屏阅读当前预览内容
  document.getElementById('preview-full').addEventListener('click', openFullscreen);
  document.getElementById('fullscreen-close').addEventListener('click', closeFullscreen);
  // 移动端抽屉关闭
  document.getElementById('preview-close').addEventListener('click', () => {
    document.getElementById('right').classList.remove('open');
  });
  // 中间边缘标签：恢复中间展开（右侧预览缩回 320px 并排）
  document.getElementById('center-tab').addEventListener('click', () => {
    document.querySelector('.app-layout').classList.remove('preview-center');
  });
  // 窗口尺寸变化时重算「最大化」提示（内容溢出状态可能改变）
  window.addEventListener('resize', () => {
    refreshOverflowHint(document.getElementById('file-content'));
  });
}

function openFullscreen() {
  const content = document.getElementById('file-content');
  // 复制内容但不带入「最大化」提示条（全屏无高度截断，无需提示）
  const src = content.cloneNode(true);
  src.querySelector('.pv-more')?.remove();
  document.getElementById('fullscreen-title').textContent = document.getElementById('right-title').textContent;
  document.getElementById('fullscreen-content').innerHTML = src.innerHTML;
  document.getElementById('fullscreen').classList.remove('hidden');
}

function closeFullscreen() {
  document.getElementById('fullscreen').classList.add('hidden');
}

// 打开/关闭右侧预览抽屉（移动端为滑出面板，桌面为常驻栏）
export function openPreview(file) {
  const right = document.getElementById('right');
  const isMobile = window.matchMedia('(max-width: 1100px)').matches;
  if (file) {
    // 点击文件预览：恢复右侧面板显示（若此前默认隐藏过）
    const layout = document.querySelector('.app-layout');
    layout.classList.remove('preview-hidden');
    // 桌面：预览时中间自动收缩为边缘标签，右侧预览占满；移动端右侧为抽屉，不收缩中间
    if (!isMobile) layout.classList.add('preview-center');
    renderFileContent(file);
    if (isMobile) right.classList.add('open');
    return;
  }
  if (isMobile) right.classList.toggle('open');
}

// 在右侧面板渲染任意标题 + HTML（如用例评审明细），并展开右侧面板
export function renderInRight(title, html) {
  const right = document.getElementById('right');
  const layout = document.querySelector('.app-layout');
  layout.classList.remove('preview-hidden');
  const isMobile = window.matchMedia('(max-width: 1100px)').matches;
  if (!isMobile) layout.classList.add('preview-center');
  document.getElementById('right-title').textContent = title;
  document.getElementById('file-content').innerHTML = html;
  refreshOverflowHint(document.getElementById('file-content')); // 内容超出时提示「最大化查看」
  if (isMobile) right.classList.add('open');
}

export function renderFileContent(file) {
  const box = document.getElementById('file-content');
  document.getElementById('right').classList.add('pv-active'); // 预览文件时显示折叠/全屏等操作
  document.getElementById('right-title').textContent = file.name;

  if (file.restored) {
    // 刷新后恢复的本地文件：从 /upload/content 读取展示
    renderRestored(file, box);
    return;
  }
  if (file.category === 'image' || isImageName(file.name)) {
    box.innerHTML = renderImage(file);
    refreshOverflowHint(box);
    return;
  }
  // 富格式（md/excel/word/思维导图）：懒加载渲染器；命中则返回，未命中继续走文本
  if (isRichFormat(file.name)) {
    renderPreview(file, box).then(() => refreshOverflowHint(box));
    return;
  }
  if (file.content !== undefined) {
    // 后端解析结果（含 word/excel/xmind 解析文本）
    box.innerHTML = `<pre class="preview">${escapeHtml(file.content)}</pre>`;
    refreshOverflowHint(box);
    return;
  }
  // 原始 File 对象：文本类读原文
  readText(file).then((text) => {
    box.innerHTML = `<pre class="preview">${escapeHtml(text)}</pre>`;
    refreshOverflowHint(box);
  });
}

// 恢复的本地文件：文本读原文，图片以 blob 展示
async function renderRestored(file, box) {
  box.innerHTML = '<p class="file-empty">加载中...</p>';
  try {
    if (isRichFormat(file.name)) {
      // 富格式：交给 renderPreview 按扩展名渲染（内部从 /upload/content 读原始字节）
      renderPreview(file, box).then(() => refreshOverflowHint(box));
      return;
    }
    const resp = await getUploadContent(getSessionId(), file.name);
    if (isImageName(file.name)) {
      const blob = await resp.blob();
      box.innerHTML = `<div class="image-preview"><img src="${URL.createObjectURL(blob)}" alt="${escapeHtml(file.name)}"></div>`;
    } else {
      box.innerHTML = `<pre class="preview">${escapeHtml(await resp.text())}</pre>`;
    }
    refreshOverflowHint(box);
  } catch (err) {
    box.innerHTML = '<p class="file-empty">无法读取该文件</p>';
    refreshOverflowHint(box);
  }
}

function renderImage(file) {
  if (file.url) {
    return `<div class="image-preview"><img src="${file.url}" alt="${escapeHtml(file.name)}"></div>`;
  }
  if (file.objectUrl) {
    return `<div class="image-preview"><img src="${file.objectUrl}" alt="${escapeHtml(file.name)}"></div>`;
  }
  if (file.content) {
    return `<pre class="preview">${escapeHtml(file.content)}</pre>`;
  }
  return '<p class="file-empty">图片已上传（分析后右侧将展示 AI 识别描述）</p>';
}

function isImageName(name) {
  return /\.(png|jpe?g|gif|bmp|webp)$/i.test(name);
}

function readText(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsText(file);
  });
}

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

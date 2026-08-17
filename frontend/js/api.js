// 后端接口封装
import { API_BASE } from './store.js';
import { showLoadingToast } from './ui.js';

// 安全解析 JSON：后端返回非 JSON（如 500 HTML 错误页）或空响应时，给出可读错误而非「Unexpected end of JSON input」
async function safeJson(r) {
  const ct = r.headers.get('content-type') || '';
  if (!r.ok || !ct.includes('application/json')) {
    let detail = '';
    try { detail = await r.text(); } catch (e) { /* ignore */ }
    throw new Error(detail ? `请求失败（HTTP ${r.status}）：${detail}` : `请求失败（HTTP ${r.status}）`);
  }
  try {
    return await r.json();
  } catch (e) {
    throw new Error(`响应解析失败：${e && e.message ? e.message : e}`);
  }
}

async function postJson(url, payload, signal) {
  const r = await fetch(`${API_BASE}${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });
  return safeJson(r);
}

// 智能分析（multipart + FormData）；signal 用于支持「停止分析」
export function analyze(fd, signal) {
  return fetch(`${API_BASE}/analysis/`, { method: 'POST', body: fd, signal })
    .then((r) => safeJson(r));
}

// 上传即持久化到本地 data/uploads/{session}，返回存储路径
export function persistUpload(fd) {
  return fetch(`${API_BASE}/upload/`, { method: 'POST', body: fd })
    .then((r) => safeJson(r));
}

// 补充分析 / 测试数据：持久化为 txt 文件到本地，返回路径与文件名
export function saveTextInput(payload) {
  return postJson('/upload/text', payload);
}

// 列出该会话已持久化的上传文件（刷新后恢复文件管理）
export function listUploads(sessionId) {
  return fetch(`${API_BASE}/upload/list?session_id=${encodeURIComponent(sessionId)}`).then((r) => safeJson(r));
}

// 删除已持久化的上传文件（从磁盘移除）
export function deleteUploads(sessionId, filenames) {
  return postJson('/upload/delete', { session_id: sessionId, filenames });
}

// 在系统文件管理器中打开该会话的本地上传目录，便于用户核查实际落盘数据
export function openLocalDir(sessionId) {
  return postJson('/upload/open', { session_id: sessionId });
}

// 读取已持久化文件的原始响应（文本/图片，用于预览）
export function getUploadContent(sessionId, name) {
  return fetch(`${API_BASE}/upload/content?session_id=${encodeURIComponent(sessionId)}&name=${encodeURIComponent(name)}`);
}

export function generate(fd, signal) {
  return fetch(`${API_BASE}/testcase/generate`, { method: 'POST', body: fd, signal })
    .then((r) => safeJson(r));
}

// 请求停止分析（后端取消，立即中断）
export function stopAnalysis(sessionId) {
  return postJson('/analysis/stop', { session_id: sessionId });
}

// 请求停止用例生成（后端取消，立即中断）
export function stopGenerate(sessionId) {
  return postJson('/testcase/stop', { session_id: sessionId });
}

export function review(fd) {
  return fetch(`${API_BASE}/testcase/review`, { method: 'POST', body: fd })
    .then((r) => safeJson(r));
}

export function applyEdits(deleteIndices, edits) {
  return postJson('/testcase/edits', { delete_indices: deleteIndices, edits });
}

export function saveTestdata(name, data) {
  return postJson('/skill/testdata', { name, data });
}

// 加载本地已保存的 API Key（用于刷新后回填模型卡片）
export function loadApikeys() {
  return fetch(`${API_BASE}/skill/apikeys`).then((r) => safeJson(r));
}

// 删除 API Key：按值删除，值相同的其它模型 key 一并删除（清空缓存级联）
export function deleteApikeys(values) {
  return postJson('/skill/apikeys/delete', { values });
}

// 测试模型接口连通性（provider/model/url/api_key）
export function testConnection(payload) {
  return postJson('/skill/test-connection', payload);
}

// 预检可用模型：分析/生成前测试模型池，返回实际会选用的模型；全部失败时 ok=false
// signal 用于支持「停止」：预检阶段也可被中断（连通性测试不再需要）
export function precheckModels(payload, signal) {
  return postJson('/skill/precheck', payload, signal);
}

// 从提供商官方接口加载最新模型列表
export function fetchModels(provider, apiKey) {
  return postJson('/skill/models', { provider, api_key: apiKey });
}

// 导出并保存到用户选择的本地路径：
//  1) 先在用户点击手势内弹系统「另存为」对话框，让用户自定义保存路径与文件名（保证弹窗一定出现，杜绝静默默认保存）；
//  2) 再请求导出内容（后端生成内容 + AI 文件名）；
//  3) 写入用户所选路径；浏览器不支持保存弹窗时回退为默认下载。
// 非 2xx 或空内容时抛错，避免把错误页当「成功导出」的损坏文件写入。
// 参数：kind = 'cases'|'analysis'|'manual'；fmt = html/excel/word/xmind/txt/json。
// 返回 { status: 'saved'|'cancel'|'downloaded', name } 供调用方区分提示。
export async function saveExport(fd, url, kind, fmt) {
  const ext = fmt === 'excel' ? '.xlsx' : fmt === 'word' ? '.docx' : fmt === 'xmind' ? '.mm' : `.${fmt}`;
  const label = kind === 'analysis' ? '需求评审报告' : kind === 'manual' ? '操作手册' : '测试用例';
  const suggested = `${label}_${new Date().toISOString().slice(0, 10)}${ext}`;
  // 1) 弹出保存对话框（在用户手势内调用，确保一定出现）
  let handle = null;
  if (window.showSaveFilePicker) {
    try {
      handle = await window.showSaveFilePicker({ suggestedName: suggested });
    } catch (e) {
      if (e && e.name === 'AbortError') return { status: 'cancel', name: null }; // 用户取消保存，不执行导出
      handle = null; // 其它错误：回退为默认下载
    }
  }
  // 2) 请求导出内容
  showLoadingToast('正在导出，请稍候...');
  const r = await fetch(`${API_BASE}${url}`, { method: 'POST', body: fd });
  if (!r.ok) {
    let detail = '';
    try { detail = await r.text(); } catch (e) { /* ignore */ }
    throw new Error(`导出失败（HTTP ${r.status}）：${detail || '服务端错误'}`);
  }
  const blob = await r.blob();
  if (!blob || !blob.size) throw new Error('导出内容为空');
  // 优先使用后端 AI 生成的文件名（X-Filename 头，URL 编码）用于回退下载与提示；否则用本地规则命名
  const h = r.headers.get('X-Filename');
  const filename = h ? decodeURIComponent(h) : suggested;
  // 3) 写入用户所选路径；未走弹窗（浏览器不支持）则回退为默认下载
  if (handle) {
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return { status: 'saved', name: handle.name }; // 用户已选择保存路径并写入成功
  }
  const objUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objUrl;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(objUrl); }, 100);
  return { status: 'downloaded', name: filename };
}

// 浏览服务器目录（返回子目录列表与上级路径），供选择导出保存目录
export async function listDirs(path) {
  const url = `${API_BASE}/export/dirs` + (path ? `?path=${encodeURIComponent(path)}` : '');
  const r = await fetch(url);
  if (!r.ok) throw new Error('读取目录失败');
  return r.json();
}

// 导出到指定服务器目录：kind = 'cases'|'review'|'manual'；返回 { path, filename }
export async function saveExportToDir(fd) {
  const r = await fetch(`${API_BASE}/export/save`, { method: 'POST', body: fd });
  let data = {};
  try { data = await r.json(); } catch (e) { /* ignore */ }
  if (!r.ok) throw new Error((data && data.error) || `导出失败（HTTP ${r.status}）`);
  return data;
}

// 共享状态
export const API_BASE = '/api';

// 各提供商默认模型列表（清空缓存后恢复）
export const defaultModels = {
  deepseek: ['deepseek-v4-flash'],
  doubao: ['doubao-seed-2-1-pro-260628', 'doubao-seed-2-0-mini-260428'],
  qianwen: ['qwen3-vl-plus', 'qwen3-vl-flash', 'qwen3.6-plus', 'qwen3.6-max-preview'],
};
export const modelMap = {
  deepseek: [...defaultModels.deepseek], // 默认只显示当前模型，点击「刷新模型」拉取最新官方模型
  doubao: [...defaultModels.doubao],
  qianwen: [...defaultModels.qianwen],
};
export const providerNames = { deepseek: 'DeepSeek', doubao: '豆包', qianwen: '千问' };
export const baseUrls = {
  deepseek: 'https://api.deepseek.com',
  doubao: 'https://ark.cn-beijing.volces.com/api/v3',
  qianwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
};

const THEME_KEY = 'aicas-theme';
export function getTheme() { return localStorage.getItem(THEME_KEY) || 'light'; }
export function setTheme(theme) { localStorage.setItem(THEME_KEY, theme); }

// 每个模型的参数缓存（url/temperature/max_tokens/stream/reasoning/thinking），按模型隔离，互不覆盖
const PREFS_PREFIX = 'aicas-prefs-';
export function getModelPrefs(model) {
  try {
    const prefs = JSON.parse(localStorage.getItem(PREFS_PREFIX + model));
    return prefs && typeof prefs === 'object' ? prefs : {};
  } catch (e) {
    return {};
  }
}
export function setModelPrefs(model, prefs) {
  localStorage.setItem(PREFS_PREFIX + model, JSON.stringify(prefs));
}
// 清除某模型的参数缓存（清空缓存时连同 key 一并清掉）
export function clearModelPrefs(model) {
  localStorage.removeItem(PREFS_PREFIX + model);
}

// 刷新拉取到的官方模型列表：按提供商持久化到本地，下次直接读取，无需重复刷新
const MODELS_CACHE_PREFIX = 'aicas-models-';
export function getCachedModels(provider) {
  try {
    const list = JSON.parse(localStorage.getItem(MODELS_CACHE_PREFIX + provider));
    return Array.isArray(list) && list.length ? list : null;
  } catch (e) {
    return null;
  }
}
export function setCachedModels(provider, list) {
  localStorage.setItem(MODELS_CACHE_PREFIX + provider, JSON.stringify(list));
}
export function clearCachedModels(provider) {
  localStorage.removeItem(MODELS_CACHE_PREFIX + provider);
}

let uploadedFiles = [];
let cases = [];

export function getUploadedFiles() { return uploadedFiles; }
export function setUploadedFiles(list) { uploadedFiles = list; }

// 顶部「已上传」：仅本次上传、方便预览，刷新后清空（与持久化的文件管理分离）
let currentUpload = [];
export function getCurrentUpload() { return currentUpload; }
export function setCurrentUpload(list) { currentUpload = list; }
export function addCurrentUpload(files) { currentUpload = currentUpload.concat(files); }

// 文件管理勾选多选：作为「追加 AI 分析」的文件集合（按文件名去重）
let selectedNames = new Set();
export function getSelectedNames() { return new Set(selectedNames); }
export function setSelectedNames(names) { selectedNames = new Set(names); }
export function toggleSelectedName(name, on) {
  if (on) selectedNames.add(name);
  else selectedNames.delete(name);
}

export function getCases() { return cases; }
export function setCases(list) { cases = list; }

const SESSION_KEY = 'aicas-session';
export function getSessionId() {
  const el = document.getElementById('session_id');
  return (el && el.value) || localStorage.getItem(SESSION_KEY) || '';
}
export function setSessionId(id) {
  const el = document.getElementById('session_id');
  if (el) el.value = id || '';
  if (id) localStorage.setItem(SESSION_KEY, id);
}

// 确保存在会话ID：无则生成并持久化，便于停止等接口能定位到同一会话
export function ensureSessionId() {
  let id = getSessionId();
  if (!id) {
    id = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    setSessionId(id);
  }
  return id;
}

// 里程碑流水线：前一步完成才解锁下一步（配置→上传→分析→生成→导出）
export const PIPELINE = ['settings', 'upload', 'analysis', 'generate', 'export'];
export const MILESTONE_LABELS = {
  settings: '配置模型',
  upload: '上传文件',
  analysis: '需求分析',
  generate: '生成用例',
  export: '导出用例 / 操作手册',
};

const MS_KEY = 'aicas-milestones';
export function getMilestones() {
  try { return JSON.parse(localStorage.getItem(MS_KEY)) || {}; } catch (e) { return {}; }
}
export function setMilestoneDone(step) {
  const m = getMilestones();
  m[step] = true;
  localStorage.setItem(MS_KEY, JSON.stringify(m));
}
export function isMilestoneDone(step) { return !!getMilestones()[step]; }
// 某模块是否被里程碑锁定（需其前面所有步骤完成）；非流水线模块不锁定
export function isPipelineLocked(module) {
  const idx = PIPELINE.indexOf(module);
  if (idx < 0) return false;
  for (let i = 0; i < idx; i++) {
    if (!isMilestoneDone(PIPELINE[i])) return true;
  }
  return false;
}
// 返回锁定该模块的前置步骤名（用于提示）；未锁定返回 ''
export function lockedBy(module) {
  const idx = PIPELINE.indexOf(module);
  if (idx < 0) return '';
  for (let i = 0; i < idx; i++) {
    if (!isMilestoneDone(PIPELINE[i])) return PIPELINE[i];
  }
  return '';
}

// 收集当前表单的 AI 参数
export function formData() {
  const fd = new FormData();
  fd.append('provider', document.getElementById('provider').value);
  fd.append('model', document.getElementById('model').value);
  fd.append('api_key', document.getElementById('api_key').value);
  if (getSessionId()) fd.append('session_id', getSessionId());
  return fd;
}

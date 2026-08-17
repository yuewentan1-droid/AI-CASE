// 中间：三阶段卡片逻辑（模型配置 / 上传 / 分析+进度 / 生成·评审·编辑 / 导出）
import {
  formData, getUploadedFiles, setUploadedFiles, getCases, setCases,
  setSessionId, getSessionId, ensureSessionId, modelMap, providerNames, baseUrls, defaultModels,
  getCachedModels, setCachedModels, clearCachedModels,
  getModelPrefs, setModelPrefs, clearModelPrefs, setMilestoneDone, isMilestoneDone, getSelectedNames,
  getCurrentUpload, addCurrentUpload,
} from '../store.js';
import {
  analyze, generate, review, persistUpload, saveTextInput, saveExport, listDirs, saveExportToDir, loadApikeys, testConnection, fetchModels, precheckModels, stopAnalysis, stopGenerate as apiStopGenerate, deleteApikeys,
} from '../api.js';
import { toast, showModule, showProgress, hideProgress, accordionSection, bindAccordions, showErrorModal, promptNextStep, openModal, closeModal, downloadTextFile, setModuleShownHook, showLoadingToast } from '../ui.js';
import { renderFileBar, renderFileList, expandFileList } from './filebar.js';
import { showUploadDialog } from './uploadDialog.js';
import { refreshToolbar } from './toolbar.js';
import { renderInRight } from './rightpanel.js';
import { renderFlowchart, downloadFlowchart, openFlowchartLightbox, initFlowchartLightbox } from './flowchart.js';

export function initMain() {
  // 若上次刷新拉取过官方模型，直接用缓存，无需重复刷新
  Object.keys(modelMap).forEach((p) => {
    const cached = getCachedModels(p);
    if (cached) modelMap[p] = cached;
  });
  fillModels();
  renderModelCards();
  loadSavedApikeys(); // 刷新后回填本地已保存的 API Key
  document.getElementById('files').addEventListener('change', onFilesChange);
  document.getElementById('uc-action').addEventListener('click', () => document.getElementById('files').click());
  document.getElementById('testdata-file').addEventListener('change', onTestdataUpload);
  document.getElementById('uc-td').addEventListener('click', () => document.getElementById('testdata-file').click());
  // 补充分析 / 测试数据：点击输入时显示保存按钮，失焦隐藏；保存弹窗选择持久化或一次性引用
  bindSaveVisibility('user_input', 'save-user-input', onSaveUserInput);
  bindSaveVisibility('test_data', 'save-testdata', onSaveTestdata);
  document.getElementById('analyze-btn').addEventListener('click', onAnalyze);
  document.getElementById('analyze-re').addEventListener('click', onReAnalyze); // 重新分析（二次确认 + 对比上次）
  document.getElementById('analyze-stop').addEventListener('click', stopAnalyze); // 停止分析
  document.getElementById('generate-btn').addEventListener('click', () => {
    if (generating) confirmStopGenerate(); else onGenerate(); // 生成中点击即「停止生成」，需二次确认
  });
  document.getElementById('review-btn').addEventListener('click', onReview);
  initExportDropdowns();
  document.querySelectorAll('#analysis-export [data-ae]').forEach((b) => {
    b.addEventListener('click', () => onExportAnalysis(b.dataset.ae));
  });
  initFlowchartLightbox(); // 业务流程图放大灯箱（缩放/拖拽/关闭）
  updateGenerateButtons();
  updateCaseModuleUI(true); // 初始无用例：保留模板与按钮
  // 切换模块后再回「生成」时恢复右侧评审内容（未重新生成则保留上次评审）
  setModuleShownHook((name) => {
    if (name === 'generate' && lastReview && getCases().length) {
      renderReview(lastReview, lastUsedModels);
    }
  });
}

function fillModels() {
  const p = document.getElementById('provider').value;
  const sel = document.getElementById('model');
  sel.innerHTML = '';
  modelMap[p].forEach((m) => {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = m;
    sel.appendChild(opt);
  });
  sel.selectedIndex = -1; // 默认不选中任何模型
}

// 当前选中的模型（默认 null，即不选中任何模型）
let selectedModel = null;

const CODE_MODELS = { deepseek: 'deepseek-coder', doubao: 'doubao-seed-2-0-mini-260428', qianwen: 'qwen3-vl-flash' };
const TEXT_MODELS = { deepseek: 'deepseek-v4-flash', doubao: 'doubao-seed-2-1-pro-260628', qianwen: 'qwen3.6-plus' };
const VISION_MODELS = { doubao: 'doubao-seed-2-1-pro-260628', qianwen: 'qwen3-vl-plus' };
// 是否所有提供商都已填写 API Key（复刻后端判断，用于「预测+回填」的实时显示）
let allKeysFilled = false;

// 预测当前任务实际会用的模型；后端会先自动测试可用模型再选择，实际 used_models 会回填校准
// 全 Key 时后端随机使用可用模型，无法预先确定 → 统一显示「可用模型」
function predictModel(task) {
  const selProvider = document.getElementById('provider').value || 'deepseek';
  const selModel = document.getElementById('model').value;
  if (allKeysFilled) {
    if (task === 'code') {
      const m = CODE_MODELS[selProvider] || selModel;
      return { provider: selProvider, model: m, label: `${providerNames[selProvider] || selProvider} ${m}` };
    }
    return { provider: '', model: '', label: '可用模型' };
  }
  if (task === 'vision') {
    const p = VISION_MODELS[selProvider] ? selProvider : 'qianwen';
    const m = VISION_MODELS[p];
    return { provider: p, model: m, label: `${providerNames[p] || p} ${m}` };
  }
  if (task === 'code') {
    const m = CODE_MODELS[selProvider] || selModel;
    return { provider: selProvider, model: m, label: `${providerNames[selProvider] || selProvider} ${m}` };
  }
  const m = selModel || TEXT_MODELS[selProvider];
  return { provider: selProvider, model: m, label: `${providerNames[selProvider] || selProvider} ${m}` };
}

// 渲染「本次使用模型」：一行普通文本（非条状/盒子组件），含兜底后的实际模型
const MODEL_TASK_LABELS = { text: '文本理解', vision: '图片识别', code: '代码理解' };
function modelUsageHtml(used) {
  if (!used || !Object.keys(used).length) return '';
  const parts = Object.entries(used).map(([task, info]) =>
    `${MODEL_TASK_LABELS[task] || task}：<b>${info.provider} · ${info.model}</b>`);
  return `<div class="model-usage-line">本次使用模型：${parts.join('　')}</div>`;
}

// 从当前模型卡片构建「有 key 的模型池」（每个模型各自独立的 key），供后端随机兜底
function buildModelPool() {
  const pool = [];
  document.querySelectorAll('.model-card').forEach((card) => {
    const p = card.dataset.provider;
    const m = card.dataset.model;
    const k = card.querySelector('.mc-key').value.trim();
    if (p && m && k) pool.push({ provider: p, model: m, api_key: k });
  });
  return pool;
}
// 把模型池附到请求，并据此判定是否「全 Key」（用于实时显示预测模型；真实使用以后端 used_models 为准）
function attachModelPool(fd) {
  const pool = buildModelPool();
  allKeysFilled = ['deepseek', 'doubao', 'qianwen'].every((p) => pool.some((it) => it.provider === p));
  fd.append('models', JSON.stringify(pool));
}

// 各模型特色 SVG 图标与对应动画（chat/气泡、code/代码、vision/眼睛、coder/终端 等）
const modelIcons = {
  'deepseek-chat': { anim: 'anim-chat', svg: '<path d="M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-6l-4 4v-4H6a2 2 0 0 1-2-2z"/><path d="M8 9h8M8 12h5"/>' },
  'deepseek-v4-flash': { anim: 'anim-flash', svg: '<path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z"/>' },
  'deepseek-coder': { anim: 'anim-code', svg: '<path d="M8 8l-4 4 4 4M16 8l4 4-4 4M13 5l-2 14"/>' },
  'doubao-seed-2-1-pro-260628': { anim: 'anim-eye', svg: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="3"/>' },
  'doubao-seed-2-0-mini-260428': { anim: 'anim-data', svg: '<path d="M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4L12 3z"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/><path d="M6 20v-2M18 20v-2"/>' },
  'qwen3-vl-plus': { anim: 'anim-mag', svg: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/><path d="M8 11h6M11 8v6"/>' },
  'qwen3-vl-flash': { anim: 'anim-scan', svg: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M9 3h6l1.2 3H7.8z"/><circle cx="12" cy="12" r="3.4"/><path d="M4 14h16"/>' },
  'qwen3.6-plus': { anim: 'anim-orbit', svg: '<circle cx="12" cy="12" r="3"/><ellipse cx="12" cy="12" rx="9" ry="3.6"/><ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(-60 12 12)"/><circle cx="21" cy="12" r="1.3"/><circle cx="8.2" cy="4.8" r="1.3"/>' },
  'qwen3.6-max-preview': { anim: 'anim-apex', svg: '<path d="M3 20h18M5 17l4-7 3 4 3-6 4 9z"/><circle cx="16" cy="4" r="2.4"/><path d="M16 1.6v.6M16 6.2v.6M13.7 2.3l.5.4M17.8 5.3l.5.4M13.7 5.7l.5-.4M17.8 2.7l.5-.4"/>' },
};

// 各提供商官方 API Key 控制台（点击卡片上的 🔑 图标跳转去开通/获取）
const getKeyUrl = (p) => ({
  deepseek: 'https://platform.deepseek.com/usage',
  qianwen: 'https://bailian.console.aliyun.com/cn-beijing?tab=model#/api-key',
  doubao: 'https://console.volcengine.com/iam/keymanage',
}[p] || '');

// 加载本地已保存的 API Key，回填到各模型卡片的 Key 输入框（按模型名读取；相同模型共用同一 key；并同步到全局 api_key）
function loadSavedApikeys() {
  loadApikeys().then((res) => {
    const keys = (res && res.keys) || {};
    document.querySelectorAll('.model-card').forEach((card) => {
      const p = card.dataset.provider;
      const m = card.dataset.model;
      // 优先该模型自身的 key，回退到该提供商的 key（相同模型共用）
      const val = keys[m] != null ? keys[m] : keys[p];
      if (val == null) return;
      card.querySelector('.mc-key').value = val;
      if (document.getElementById('provider').value === p) {
        document.getElementById('api_key').value = val;
      }
    });
  });
}

// 模型卡片：一个模型一张卡，默认居中展示 SVG 图标（转动粒子动画），点选头部选中该模型
function renderModelCards() {
  const box = document.getElementById('model-cards');
  if (!box) return;
  let html = '';
  Object.keys(modelMap).forEach((p) => {
    modelMap[p].forEach((m) => {
      const active = (selectedModel && selectedModel.provider === p && selectedModel.model === m) ? ' active' : '';
      const icon = modelIcons[m] || modelIcons['deepseek-coder']; // 动态加载的模型用通用图标兜底
      // 仅 DeepSeek 提供「刷新模型」（官方 /models 可用且模型可调通）；豆包/千问为固定官方模型，无刷新，只留「清空缓存」
      const refreshBtn = (p === 'deepseek'
        ? '<button type="button" class="btn sm ghost mc-refresh" title="从官方加载最新模型并持久化">刷新模型</button>'
        : '')
        + '<button type="button" class="btn sm ghost mc-clear-cache" title="清空本地缓存，恢复默认模型">清空缓存</button>';
      // reasoning_effort 为 DeepSeek 专属参数，其余提供商不渲染
      const reasoningSelect = p === 'deepseek'
        ? `<select class="mc-reasoning" title="reasoning_effort 推理强度">
            <option value="high" selected>推理 high</option>
            <option value="medium">推理 medium</option>
            <option value="low">推理 low</option>
          </select>`
        : '';
      // enable_thinking 为千问专属参数（官方推荐 true），其余提供商不渲染
      const thinkingSelect = p === 'qianwen'
        ? `<select class="mc-thinking" title="enable_thinking 思考模式">
            <option value="true" selected>思考 true</option>
            <option value="false">思考 false</option>
          </select>`
        : '';
      // 性价比之王推荐徽标：仅对豆包 mini 与千问 flash 等轻量模型显示
      const isBudgetModel = (p === 'doubao' && m === 'doubao-seed-2-0-mini-260428')
        || (p === 'qianwen' && m === 'qwen3-vl-flash');
      const recBadge = isBudgetModel
        ? '<i class="mc-rec-badge" title="性价比之王：价格低，视觉识别够用，推荐日常使用">性价比之王</i>'
        : '';
      html += `<div class="model-card${active}" data-provider="${p}" data-model="${m}">
        <div class="mc-icon">
          <svg class="mc-core ${icon.anim}" viewBox="0 0 24 24" aria-hidden="true">${icon.svg}</svg>
          <i class="mc-particle p1"></i>
          <i class="mc-particle p2"></i>
          <i class="mc-particle p3"></i>
        </div>
        <div class="mc-head" title="点击选中该模型">
          <span class="mc-provider">${providerNames[p]}</span>
          <span class="mc-name">${m}${recBadge}</span>
        </div>
        <div class="mc-body">
          <input class="mc-url" value="${baseUrls[p]}" placeholder="接口地址（可自行填写）">
          <span class="mc-key-wrap">
            <input class="mc-key" type="password" placeholder="API Key（sk-...）">
            <button type="button" class="mc-eye" title="显示/隐藏 Key">👁</button>
          </span>
          ${getKeyUrl(p) ? `<a class="mc-key-hint" href="${getKeyUrl(p)}" target="_blank" rel="noopener" title="前往官方控制台获取/开通 API Key">🔑 获取 Key</a>` : ''}
          <span class="mc-param-wrap"><input class="mc-temperature" type="number" step="0.1" min="0" max="2" value="0.7" placeholder="temperature" title="temperature 0.7 为官方推荐默认（最合理）"><i class="mc-rec" title="官方推荐默认">推荐</i></span>
          <span class="mc-param-wrap"><input class="mc-max-tokens" type="number" min="1" value="4096" placeholder="max_tokens" title="max_tokens 4096 为官方推荐默认（最合理）"><i class="mc-rec" title="官方推荐默认">推荐</i></span>
          ${reasoningSelect}
          ${thinkingSelect}
          <select class="mc-stream" title="stream 是否流式">
            <option value="false" selected>stream false</option>
            <option value="true">stream true</option>
          </select>
        </div>
        <div class="mc-actions">
          <button type="button" class="btn sm mc-save">保存</button>
          <button type="button" class="btn sm ghost mc-curl" title="复制该模型的调用 curl 命令">复制 curl</button>
          <button type="button" class="btn sm ghost mc-test" title="用当前地址与 Key 测试是否连通">测试联通</button>
          ${refreshBtn}
          <span class="mc-result"></span>
        </div>
      </div>`;
    });
  });
  box.innerHTML = html;

  box.querySelectorAll('.model-card').forEach((card) => {
    const p = card.dataset.provider;
    const m = card.dataset.model;
    const urlInput = card.querySelector('.mc-url');
    const keyInput = card.querySelector('.mc-key');
    const tempInput = card.querySelector('.mc-temperature');
    const maxTokensInput = card.querySelector('.mc-max-tokens');
    const reasoningInput = card.querySelector('.mc-reasoning');
    const thinkingInput = card.querySelector('.mc-thinking');
    const streamInput = card.querySelector('.mc-stream');
    const resultEl = card.querySelector('.mc-result');
    const apiKey = document.getElementById('api_key');

    // 回填该模型已保存的参数（按模型隔离，互不覆盖）
    const prefs = getModelPrefs(m);
    if (prefs.url) urlInput.value = prefs.url;
    if (prefs.temperature) tempInput.value = prefs.temperature;
    if (prefs.maxTokens) maxTokensInput.value = prefs.maxTokens;
    if (prefs.stream) streamInput.value = prefs.stream;
    if (reasoningInput && prefs.reasoning) reasoningInput.value = prefs.reasoning;
    if (thinkingInput && prefs.thinking) thinkingInput.value = prefs.thinking;

    // 读取卡片当前参数
    const params = () => ({
      url: urlInput.value.trim().replace(/\/+$/, ''),
      key: keyInput.value.trim(),
      temperature: tempInput.value.trim(),
      maxTokens: maxTokensInput.value.trim(),
      reasoning: reasoningInput ? reasoningInput.value : 'high',
      thinking: thinkingInput ? thinkingInput.value : 'true',
      stream: streamInput.value,
    });
    // 保存该模型当前参数（不含 key，key 单独按模型存后端）
    const persistPrefs = () => {
      const { url, temperature, maxTokens, reasoning, thinking, stream } = params();
      setModelPrefs(m, { url, temperature, maxTokens, reasoning, thinking, stream });
    };
    [urlInput, tempInput, maxTokensInput, streamInput, reasoningInput, thinkingInput]
      .filter(Boolean)
      .forEach((el) => el.addEventListener('change', persistPrefs));

    // 点卡片头部选中该模型，并同步 formData 的 provider/model/key
    // 仅切换 .active 类，避免整体重渲染导致闪烁/跳动
    card.querySelector('.mc-head').addEventListener('click', () => {
      selectedModel = { provider: p, model: m };
      document.getElementById('provider').value = p;
      document.getElementById('model').value = m;
      apiKey.value = keyInput.value;
      box.querySelectorAll('.model-card').forEach((c) => c.classList.toggle('active', c === card));
    });

    // key 变化：若为当前选中模型，同步到全局 api_key
    keyInput.addEventListener('input', () => {
      if (document.getElementById('provider').value === p) apiKey.value = keyInput.value;
    });

    // 眼睛按钮：显示/隐藏 API Key
    const eyeBtn = card.querySelector('.mc-eye');
    if (eyeBtn) {
      eyeBtn.addEventListener('click', () => {
        const show = keyInput.type === 'password';
        keyInput.type = show ? 'text' : 'password';
        eyeBtn.textContent = show ? '🙈' : '👁';
      });
    }

    // 保存该模型的 API Key（按模型名存储，各模型独立，相同模型共用）
    card.querySelector('.mc-save').addEventListener('click', () => {
      const key = keyInput.value;
      if (!key) { toast('请填写 API Key', 'err'); return; }
      fetch('/api/skill/apikeys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // 每个模型各自独立保存 key（互不共用），分析/生成时随 models 池发给后端做随机兜底
        body: JSON.stringify({ [m]: key }),
      }).then((r) => r.json()).then((res) => {
        if (res.success) {
          toast(`${providerNames[p]} Key 已保存`, 'ok');
          setMilestoneDone('settings'); // 任一模型保存过 Key 即视为「配置模型」完成
          refreshToolbar();
          promptNextStep('配置模型', 'upload', '上传文件');
        } else {
          toast('保存失败', 'err');
        }
      });
    });

    // 复制该模型的调用 curl 命令（含全部自定义参数）
    card.querySelector('.mc-curl').addEventListener('click', () => {
      const { url, key, temperature, maxTokens, reasoning, thinking, stream } = params();
      const reasoningLine = p === 'deepseek' ? `,\n    "reasoning_effort": "${reasoning}"` : '';
      const thinkingLine = p === 'qianwen' ? `,\n    "enable_thinking": ${thinking}` : '';
      const curl = `curl ${url}/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${key}" \\
  -d '{
    "model": "${m}",
    "messages": [
      {"role":"system","content":"You are a helpful assistant."},
      {"role":"user","content":"请详细解释一下什么是区块链，以及它的核心原理。"}
    ],
    "stream": ${stream},
    "temperature": ${temperature || 0.7},
    "max_tokens": ${maxTokens || 4096}${reasoningLine}${thinkingLine}
  }'`;
      navigator.clipboard.writeText(curl).then(() => {
        toast(`${providerNames[p]} curl 已复制`, 'ok');
      }).catch(() => { toast('复制失败', 'err'); });
    });

    // 测试联通：用当前地址与 Key 发起一次请求，结果展示在卡片右侧
    card.querySelector('.mc-test').addEventListener('click', async () => {
      const { url, key, temperature, maxTokens, reasoning, thinking } = params();
      if (!url) { toast('请填写接口地址', 'err'); return; }
      if (!key) { toast('请填写 API Key', 'err'); return; }
      const btn = card.querySelector('.mc-test');
      resultEl.textContent = '';
      btn.disabled = true;
      btn.textContent = '测试中...';
      try {
        const res = await testConnection({
          provider: p, model: m, url, api_key: key,
          temperature: +temperature, max_tokens: +maxTokens,
          reasoning_effort: reasoning, enable_thinking: thinking === 'true',
        });
        if (res.success) {
          resultEl.textContent = `✓ 联通 ${res.latency}ms`;
          resultEl.className = 'mc-result ok';
          setMilestoneDone('settings'); // 任一模型测试联通成功即视为「配置模型」完成，解锁后续里程碑
          refreshToolbar();
          promptNextStep('配置模型', 'upload', '上传文件');
        } else {
          resultEl.textContent = '✗ 失败';
          resultEl.className = 'mc-result err';
          showErrorModal(`${providerNames[p]} ${m} 联通失败`, res.error || '未知错误');
        }
      } catch (err) {
        resultEl.textContent = '✗ 失败';
        resultEl.className = 'mc-result err';
        showErrorModal(`${providerNames[p]} ${m} 测试失败`, err && err.message ? err.message : err);
      } finally {
        btn.disabled = false;
        btn.textContent = '测试联通';
      }
    });

    // 清空缓存：清除本地持久化的模型列表 + 删除 API Key，恢复该提供商默认模型（二次确认，提醒需重新输入）
    const clearCacheBtn = card.querySelector('.mc-clear-cache');
    if (clearCacheBtn) {
      clearCacheBtn.addEventListener('click', () => {
        openModal(`
          <div class="modal-title">清空缓存</div>
          <p class="modal-desc">将清除本地持久化的模型列表，并删除 ${providerNames[p]} 的 API Key（与其它模型共用同一 key 时一并删除），恢复默认模型。清空后如需加载最新官方模型，需重新输入 API Key 并点击「刷新模型」。是否确认清空？</p>
          <div class="modal-actions">
            <button type="button" class="btn ghost" id="dlg-cancel">取消</button>
            <button type="button" class="btn danger" id="dlg-clear">确认清空</button>
          </div>
        `);
        document.getElementById('dlg-cancel').addEventListener('click', () => closeModal());
        document.getElementById('dlg-clear').addEventListener('click', async () => {
          closeModal();
          // 收集该提供商各卡片当前填写的 key 值（含未保存的），供后端按值级联删除（共用同一 key 的其它模型一并删除）
          const values = new Set();
          box.querySelectorAll(`.model-card[data-provider="${p}"] .mc-key`).forEach((el) => {
            const v = el.value.trim();
            if (v) values.add(v);
          });
          let removed = {};
          try {
            const res = await deleteApikeys([...values]);
            removed = (res && res.removed) || {};
          } catch (err) { /* 删除接口异常不阻断本地清缓存 */ }
          const removedNames = Object.keys(removed);
          clearCachedModels(p);
          removedNames.forEach((m) => clearModelPrefs(m)); // 被删 key 的模型参数缓存一并清除
          modelMap[p] = [...defaultModels[p]];
          fillModels();
          renderModelCards();
          loadSavedApikeys(); // 重建后回填剩余已保存 Key，已删除的不会回填
          toast(removedNames.length ? `已清空缓存并删除 ${removedNames.length} 个模型 Key` : '已清空缓存，恢复默认模型', 'ok');
        });
      });
    }

    // 刷新模型：从提供商官方接口加载最新模型并重建卡片
    const refreshBtn = card.querySelector('.mc-refresh');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', async () => {
        const key = keyInput.value.trim();
        if (!key) { toast('请填写 API Key 后再刷新', 'err'); return; }
        const btn = refreshBtn;
        btn.disabled = true;
        btn.textContent = '加载中...';
        try {
          const res = await fetchModels(p, key);
          if (!res.success) { showErrorModal('刷新模型失败', res.error || '未知错误'); return; }
          if (!res.models || !res.models.length) { toast('未获取到模型', 'err'); return; }
          modelMap[p] = res.models;
          setCachedModels(p, res.models); // 持久化，下次直接读取
          fillModels();
          renderModelCards();
          loadSavedApikeys(); // 重建后回填已保存的 Key
          toast(`已加载 ${res.models.length} 个官方模型`, 'ok');
        } catch (err) {
          showErrorModal('刷新模型失败', err && err.message ? err.message : err);
        } finally {
          btn.disabled = false;
          btn.textContent = '刷新模型';
        }
      });
    }
  });
}

async function onFilesChange(e) {
  const list = Array.from(e.target.files);
  e.target.value = ''; // 允许重复选择同一文件
  if (!list.length) return;
  const adopted = await applyUpload(list);
  if (adopted.length) {
    showUploadDialog(adopted);
    setMilestoneDone('upload'); // 已采纳文件即视为「上传文件」完成
  } else {
    toast('未添加任何文件（已跳过同名文件）', 'err');
  }
  refreshToolbar();
}

// 把本次新上传的文件并入顶部「已上传」（按文件名去重）
function addFreshToCurrent(fresh) {
  const names = new Set(getCurrentUpload().map((f) => f.name));
  addCurrentUpload(fresh.filter((f) => !names.has(f.name)));
}

// 处理一批新增上传：检测与既有文件同名并弹窗询问是否覆盖，返回实际采纳的文件列表（供展示/持久化）
async function applyUpload(files) {
  if (!files.length) return [];
  // 同一批选择内按名称去重（重复选同名文件时保留最后选中）
  const selected = [];
  for (const f of files) {
    const i = selected.findIndex((x) => x.name === f.name);
    if (i >= 0) selected[i] = f; else selected.push(f);
  }
  const existing = getUploadedFiles();
  const existingNames = new Set(existing.map((f) => f.name));
  const conflicts = selected.filter((f) => existingNames.has(f.name));
  const noConflict = selected.filter((f) => !existingNames.has(f.name));

  let overwriteNames = new Set();
  if (conflicts.length) {
    const ok = await confirmOverwrite(conflicts.map((f) => f.name));
    if (ok) overwriteNames = new Set(conflicts.map((f) => f.name));
  }

  // 合并：确认覆盖则用新文件替换同名旧项（保持位置），未确认则跳过这些同名文件
  let merged = existing.slice();
  if (overwriteNames.size) {
    merged = merged.map((old) =>
      overwriteNames.has(old.name) ? selected.find((f) => f.name === old.name) || old : old
    );
  }
  merged = merged.concat(noConflict);
  // 名称去重防御：同名仅保留一个
  const seen = new Set();
  const uniq = merged.filter((f) => (!seen.has(f.name) && (seen.add(f.name), true)));
  // 给条目附加时间戳（最新在前排序用）：File 用 lastModified，其余用当前时间
  uniq.forEach((f) => { if (f._ts == null) f._ts = f.lastModified || Date.now(); });
  setUploadedFiles(uniq);

  // 顶部「已上传」仅并入本次实际采纳的文件（覆盖项 + 无冲突项）
  const adopted = noConflict.concat(conflicts.filter((f) => overwriteNames.has(f.name)));
  addFreshToCurrent(adopted);

  renderFileBar();
  expandFileList(); // 上传后展开文件管理，让刚上传的文件可见
  renderFileList();
  if (adopted.length) persistUploadFiles(adopted); // 覆盖项会覆盖磁盘同名文件，未采纳的同名文件不持久化
  return adopted;
}

// 同名文件确认弹窗：true=覆盖，false=跳过
function confirmOverwrite(names) {
  return new Promise((resolve) => {
    openModal(`
      <div class="modal-title">同名文件</div>
      <div class="modal-body">以下文件与已上传文件重名：</div>
      <ul class="modal-file-list">${names.map((n) => `<li>${escapeHtml(n)}</li>`).join('')}</ul>
      <p class="modal-desc">选择「覆盖」将用新文件替换同名文件；「跳过」则忽略这些同名文件。</p>
      <div class="modal-actions">
        <button type="button" class="btn ghost" id="dlg-skip">跳过</button>
        <button type="button" class="btn" id="dlg-overwrite">覆盖</button>
      </div>
    `);
    document.getElementById('dlg-skip').addEventListener('click', () => { closeModal(); resolve(false); });
    document.getElementById('dlg-overwrite').addEventListener('click', () => { closeModal(); resolve(true); });
  });
}

function escapeHtml(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, '&quot;');
}
// 持久化文件默认名：补充分析/测试数据 + 当日日期，如「补充分析_20260815」
function defaultFileName(kind) {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${kind}_${y}${m}${day}`;
}
// 清理用户输入的文件名：去 .txt 后缀、去路径分隔符与不安全字符，保证后端落盘安全
function safeFileName(name) {
  let n = String(name || '').trim().replace(/\.txt$/i, '');
  n = n.replace(/[\\/:*?"<>|]/g, '_').replace(/^[.\s]+/, '');
  return n || '';
}

async function persistUploadFiles(files) {
  const fd = new FormData();
  files.forEach((f) => fd.append('files', f));
  // 带上既有会话，使多次上传累积到同一持久化目录（避免每次上传都新建 session 导致刷新只显示最后一批）
  if (getSessionId()) fd.append('session_id', getSessionId());
  try {
    const res = await persistUpload(fd);
    if (res && res.session_id) setSessionId(res.session_id);
    const el = document.getElementById('upload-path');
    if (res && res.path) {
      el.textContent = `已保存至本地：${res.path}`;
      el.classList.remove('hidden');
    } else if (res && res.error) {
      toast(res.error, 'err');
    }
  } catch (err) {
    toast('文件持久化失败', 'err');
  }
}

// 上传的测试数据：与其它上传文件一致，加入文件管理，点击可在右侧预览；不写入测试数据输入面板
async function onTestdataUpload(e) {
  const list = Array.from(e.target.files);
  e.target.value = '';
  if (!list.length) return;
  const adopted = await applyUpload(list);
  if (adopted.length) setMilestoneDone('upload'); // 上传了测试数据文件同样视为完成「上传文件」
  refreshToolbar();
}

// 保存按钮：点击输入时显示，失焦隐藏（留 150ms 让点击事件可触发）
function bindSaveVisibility(textareaId, btnId, handler) {
  const ta = document.getElementById(textareaId);
  const actions = ta.closest('.input-panel').querySelector('.panel-actions');
  ta.addEventListener('focus', () => actions.classList.remove('hidden'));
  ta.addEventListener('blur', () => setTimeout(() => actions.classList.add('hidden'), 150));
  document.getElementById(btnId).addEventListener('click', handler);
}

// 保存补充分析 / 测试数据：点击保存即命名并持久化到本地（不提供「仅本次引用」，保证落盘）
function onSaveUserInput() {
  persistInputToLocal('补充分析', document.getElementById('user_input').value);
}
function onSaveTestdata() {
  persistInputToLocal('测试数据', document.getElementById('test_data').value);
}

// 点击保存：直接命名并持久化为 txt 文件到本地，加入「文件管理」
function persistInputToLocal(kind, content) {
  if (!content.trim()) { toast('内容为空，无需保存', 'err'); return; }
  openModal(`
    <div class="modal-title">保存${kind}</div>
    <p class="modal-desc">将${kind}内容保存为 txt 文件到本地并加入「文件管理」，供后续 AI 综合分析阅读。为文件命名：</p>
    <input type="text" class="modal-input" id="dlg-name" value="${escapeAttr(defaultFileName(kind))}" placeholder="输入文件名">
    <div class="modal-actions">
      <button type="button" class="btn ghost" id="dlg-cancel">取消</button>
      <button type="button" class="btn" id="dlg-save">保存到本地</button>
    </div>
  `);
  const input = document.getElementById('dlg-name');
  document.getElementById('dlg-cancel').addEventListener('click', closeModal);
  document.getElementById('dlg-save').addEventListener('click', () => persistNamed(kind, content, input.value));
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') document.getElementById('dlg-save').click(); });
  input.focus();
}

// 按用户命名持久化保存补充分析/测试数据为 txt 文件
async function persistNamed(kind, content, rawName) {
  const name = safeFileName(rawName);
  closeModal();
  if (!name) { toast('文件名无效，未保存', 'err'); return; }
  // 用户手势内立即弹出系统「另存为」让用户选择保存路径（浏览器支持时），后端持久化同时进行
  const saveLocal = downloadTextFile(`${name}.txt`, content);
  const res = await saveTextInput({ session_id: getSessionId(), filename: name, content });
  if (res && res.success) {
      if (res.session_id) setSessionId(res.session_id);
      // 并入文件管理列表（持久化 txt，内容可直接预览）
      setUploadedFiles(getUploadedFiles().concat([{
        name: res.filename, size: content.length, content, persisted: true, path: res.path, _ts: Date.now(),
      }]));
      renderFileBar();
      expandFileList(); // 持久化保存后展开文件管理，让刚保存的文件可见
      renderFileList();
      const el = document.getElementById('upload-path');
      el.textContent = `已保存至本地：${res.path}`;
      el.classList.remove('hidden');
      await saveLocal; // 等待用户在「另存为」中选择路径并完成写入
      toast(`${kind}已保存到本地`, 'ok');
    } else {
      toast('保存失败', 'err');
    }
}

// 分析/生成用到的文件：仅勾选「追加分析」的文件参与（全局），未勾选的不参与；
// 自定义输入（user_input/test_data）始终直接参与，不在这里处理
function analysisFiles() {
  const files = getUploadedFiles().filter((f) => !f.persisted);
  const sel = getSelectedNames();
  return files.filter((f) => sel.has(f.name));
}

// 当前分析请求的 AbortController（用于「停止分析」）
let analyzeAbort = null;
// 正在模型连通性测试（precheckModels）阶段：该阶段无法直接中断请求
let modelTesting = false;
// 模型测试期间用户点了「停止分析」：待测试结束后再真正停止，避免无反应
let pendingAnalyzeStop = false;
// 上次分析结果（用于「重新分析」时展示对比差异）
let lastAnalysis = null;
// 上次分析覆盖的文件名（用于「重新评审是否必要」判断）
let lastCoveredFiles = [];

// 分析相关界面元素
function analyzeUI() {
  return {
    cta: document.getElementById('analyze-cta'),
    ctrl: document.getElementById('analyze-ctrl'),
    re: document.getElementById('analyze-re'),
    note: document.getElementById('analyze-re-note'),
    status: document.getElementById('upload-status'),
  };
}

function stopAnalyze() {
  // 正在模型连通性测试（无法立即中断请求）：提示用户等待测试结束，届时再停止，避免点了没反应
  if (modelTesting) {
    pendingAnalyzeStop = true;
    toast('正在测试模型连通性，请稍候，模型测试结束后将停止分析', 'ok');
    return;
  }
  // 二次确认后再停止，避免误触中断需求分析
  confirmAction('停止分析', '停止后本次需求分析将中断，需要重新分析。确定要停止吗？', '停止分析', () => {
    if (analyzeAbort) analyzeAbort.abort();
    stopAnalysis(ensureSessionId()).catch(() => {});
  });
}

// ---- 用例生成：门控 / 停止 / 二次确认 ----
let generateAbort = null;   // 生成 AbortController（支持「停止生成」）
let generating = false;     // 是否正在生成用例
let lastReview = null;      // 最近一次评审结果（判定「重新生成」是否需换回按钮用）
let lastUsedModels = null;  // 最近一次评审使用的模型（切换模块回来时恢复评审展示用）

// 统一二次确认弹窗：确认后执行回调
function confirmAction(title, desc, okLabel, onOk) {
  openModal(`
    <div class="modal-title">${title}</div>
    <p class="modal-desc">${desc}</p>
    <div class="modal-actions">
      <button type="button" class="btn ghost" id="cfm-cancel">取消</button>
      <button type="button" class="btn danger" id="cfm-ok">${okLabel}</button>
    </div>
  `);
  document.getElementById('cfm-cancel').addEventListener('click', () => closeModal());
  document.getElementById('cfm-ok').addEventListener('click', () => { closeModal(); onOk && onOk(); });
}

// 生成模块按钮门控：
// - 生成按钮随状态切换文案：空闲「AI生成用例」→ 生成中「停止生成」→ 成功后「重新生成」（除非评审 >95 分则不换回）
// - 生成中 → 评审/保存隐藏或置灰；需求分析未完成 或 无用例 → 评审/保存置灰
// - 评审按钮：AI 评审随生成自动在后台执行；≥85 分通过则【完全不展示】该按钮，
//   仅当评分低于评分规则（<85 分 / 不合格）才展示「重新评审」按钮
function needsReReview() {
  if (!lastReview) return false;
  const s = lastReview.overall_score;
  if (s != null) return s < 85; // 评分规则：<85 分 = 不合格 = 必须重新评审
  return lastReview.needs_regeneration === 'must';
}

function updateGenerateButtons() {
  const analysisDone = isMilestoneDone('analysis');
  const hasCases = getCases().length > 0;
  const g = document.getElementById('generate-btn');
  const r = document.getElementById('review-btn');
  if (generating) {
    g.disabled = false; // 生成中可点击以「停止生成」
    g.textContent = '停止生成';
  } else {
    g.disabled = false;
    g.textContent = hasCases && !(lastReview && lastReview.overall_score > 95) ? '重新生成' : 'AI生成用例';
  }
  // 评审按钮：仅在需要重新评审时展示「重新评审」，否则直接隐藏（通过时后台已自动评审，无需展示）
  const needReview = needsReReview();
  r.textContent = '重新评审';
  r.classList.toggle('hidden', !needReview || generating);
  r.disabled = !analysisDone || generating || !hasCases;
}

// 停止生成：二次确认后中断前端请求 + 通知后端取消（后端在阶段间检查并中断）
function confirmStopGenerate() {
  confirmAction('停止生成', '停止后本次生成的用例将被丢弃，需要重新生成。确定要停止吗？', '停止生成', () => {
    if (generateAbort) generateAbort.abort();
    apiStopGenerate(ensureSessionId()).catch(() => {});
  });
}

async function onAnalyze() {
  // 硬性条件：未上传/勾选「追加分析」文件，且无补充输入时，不能开始分析，提示先去上传
  const userText = document.getElementById('user_input').value.trim();
  const testText = document.getElementById('test_data').value.trim();
  if (!analysisFiles().length && !userText && !testText) {
    // 硬性条件未满足：弹窗引导「去上传文件」或「留在本页」
    openModal(`
      <div class="modal-title">暂无可分析内容</div>
      <p class="modal-desc">请先在「上传文件」模块上传文件，或勾选「追加分析」、补充输入后再开始需求分析。</p>
      <div class="modal-actions">
        <button type="button" class="btn ghost" id="dlg-stay">留在本页</button>
        <button type="button" class="btn" id="dlg-go">去上传文件</button>
      </div>
    `);
    document.getElementById('dlg-stay').addEventListener('click', () => closeModal());
    document.getElementById('dlg-go').addEventListener('click', () => { closeModal(); showModule('upload'); });
    return;
  }
  const { cta, ctrl, re, note, status } = analyzeUI();
  // 点击开始：收起启动大按钮，展示「分析中 + 停止」
  cta.classList.add('hidden');
  ctrl.classList.remove('hidden');
  re.classList.add('hidden');
  note.classList.add('hidden');

  ensureSessionId(); // 保证本次分析使用稳定会话ID，便于「停止」定位到同一会话
  const fd = formData();
  attachModelPool(fd);
  fd.append('user_input', document.getElementById('user_input').value);
  fd.append('test_data', document.getElementById('test_data').value);
  const use = analysisFiles();
  fd.append('filenames', use.map((f) => f.name).join(','));
  // 仅追加浏览器原生的 File 对象；后端解析过的文件已在本地持久化，按文件名恢复即可
  use.filter((f) => f instanceof File).forEach((f) => fd.append('files', f));

  // 预检：先自动测试可用模型，展示实际会选用的模型名；全部不可用则弹窗提示去模型管理填正确 Key
  const hasImage = use.some((f) => f.name && /\.(png|jpe?g|gif|bmp|webp)$/i.test(f.name));
  status.className = 'loading';
  status.textContent = 'AI 分析中，请稍后... 正在测试可用模型...';
  let textModel, visionModel;
  modelTesting = true;   // 进入模型连通性测试阶段
  pendingAnalyzeStop = false;
  try {
    const picked = await precheckModels({
      provider: document.getElementById('provider').value,
      model: document.getElementById('model').value,
      models: buildModelPool(),
      has_image: hasImage,
    });
    if (picked && picked.ok) {
      const t = picked.picked.text || {};
      textModel = t.provider ? { provider: t.provider, model: t.model, label: `${providerNames[t.provider] || t.provider} ${t.model}` } : predictModel('text');
      if (hasImage) {
        const v = picked.picked.vision || {};
        visionModel = v.provider ? { provider: v.provider, model: v.model, label: `${providerNames[v.provider] || v.provider} ${v.model}` } : predictModel('vision');
      }
    } else {
      // 无可用模型：终止分析并弹窗，提示用户去模型管理填写正确的 API Key
      ctrl.classList.add('hidden');
      cta.classList.remove('hidden');
      status.className = '';
      status.textContent = '';
      showErrorModal('没有可用模型', (picked && picked.error) || '请到模型管理填写正确的 API Key 后再分析');
      return;
    }
  } catch (err) {
    // 预检接口异常：退化为按规则预测，不阻断分析
    textModel = predictModel('text');
    visionModel = hasImage ? predictModel('vision') : null;
  } finally {
    modelTesting = false; // 模型连通性测试结束
  }
  // 模型测试期间用户点了「停止分析」：不再发起分析，按已停止恢复界面
  if (pendingAnalyzeStop) {
    pendingAnalyzeStop = false;
    ctrl.classList.add('hidden');
    cta.classList.remove('hidden');
    status.className = '';
    status.textContent = '';
    toast('已停止分析', 'ok');
    return;
  }
  // 分阶段状态：展示「正在用什么模型做什么」，含文本理解（按文档）与图片识别阶段
  const docNames = use.map((f) => f.name).filter(Boolean);
  const phases = [];
  docNames.forEach((d) => phases.push(`正在使用 ${textModel.label} 做文本理解 · 解析文档：${d}`));
  if (visionModel) phases.push(`正在使用 ${visionModel.label} 进行图片识别`);
  let stage = 0;
  const stageText = () => phases.length
    ? `AI 分析中，请稍后... ${phases[stage % phases.length]}`
    : `AI 分析中，请稍后... 正在使用 ${textModel.label} 做文本理解`;
  status.textContent = stageText();
  const timer = setInterval(() => {
    if (phases.length) { stage += 1; status.textContent = stageText(); }
  }, 1200);

  analyzeAbort = new AbortController();
  try {
    const res = await analyze(fd, analyzeAbort.signal);
    setSessionId(res.session_id);
    const prev = lastAnalysis;   // 重跑时对比上次，用于展示差异
    lastAnalysis = res.analysis;
    renderAnalysis(res.analysis, prev, res.analysis.used_models);
    // 保留全部已上传文件（含未勾选追加分析的），仅用后端解析结果更新匹配项（含 content 可预览）
    const analyzed = res.analysis.files || [];
    const byName = new Map(analyzed.map((f) => [f.name, f]));
    const merged = getUploadedFiles().map((f) => byName.get(f.name) || f);
    analyzed.forEach((f) => { if (!merged.some((x) => x.name === f.name)) merged.push(f); });
    setUploadedFiles(merged);
    document.getElementById('files').value = '';
    renderFileBar();
    expandFileList(); // 分析合并文件后展开文件管理，让文件可见
    renderFileList();
    // 完成：收起「分析中」控制条；按输入覆盖情况，展示「不建议重新分析」说明或橙色重新分析按钮
    ctrl.classList.add('hidden');
    const covered = (res.analysis.files || []).map((f) => f.name);
    lastCoveredFiles = covered; // 供「重新评审是否必要」判断（参考重新分析）
    renderReAnalyzeDecision(re, note, use, covered);
    status.className = '';
    status.textContent = '';
    showModule('analysis'); // 结果留在分析模块展示
    setMilestoneDone('analysis'); // 智能分析成功即完成
    refreshToolbar();
    updateGenerateButtons(); // 需求分析完成，解锁生成模块按钮
    promptNextStep('需求分析', 'generate', '生成用例');
  } catch (err) {
    const aborted = err && err.name === 'AbortError';
    ctrl.classList.add('hidden');
    status.className = '';
    status.textContent = '';
    if (aborted) {
      toast('已停止分析', 'ok');
    } else {
      showErrorModal('分析失败', err && err.message ? err.message : err);
    }
    // 失败 / 停止：恢复启动大按钮，可重新发起
    cta.classList.remove('hidden');
  } finally {
    clearInterval(timer);
    analyzeAbort = null;
  }
}

// 上次分析摘要（供重新分析二次确认弹窗展示）
function lastSummaryText() {
  if (!lastAnalysis) return '';
  const risks = (lastAnalysis.risks || []).length;
  const imp = (lastAnalysis.impact_areas || []).length;
  return `上次分析共识别 ${risks} 个风险点、${imp} 个影响面。`;
}

// 重新分析：二次确认 + 展示上次分析摘要，确认后再发起
function onReAnalyze() {
  openModal(`
    <div class="modal-title">重新分析</div>
    <div class="modal-desc">将基于当前内容再次评审。${lastSummaryText()}分析可能耗时较长，是否继续？</div>
    <div class="modal-actions">
      <button type="button" class="btn ghost" id="re-cancel">取消</button>
      <button type="button" class="btn" id="re-ok">确认重新分析</button>
    </div>
  `);
  document.getElementById('re-cancel').addEventListener('click', () => closeModal());
  document.getElementById('re-ok').addEventListener('click', () => { closeModal(); onAnalyze(); });
}

// 对比上次分析：展示风险点 / 影响面的数量与新增项差异
function analysisDiffHtml(prev, cur) {
  const prevRisks = (prev && prev.risks) || [];
  const curRisks = (cur && cur.risks) || [];
  const prevImp = (prev && prev.impact_areas) || [];
  const curImp = (cur && cur.impact_areas) || [];
  const prevRiskTitles = new Set(prevRisks.map((r) => r.title));
  const newRisks = curRisks.filter((r) => !prevRiskTitles.has(r.title));
  const prevImpNames = new Set(prevImp.map((a) => a.module));
  const newImps = curImp.filter((a) => !prevImpNames.has(a.module));

  const chips = [];
  if (curRisks.length !== prevRisks.length) chips.push(`风险点 ${prevRisks.length} → ${curRisks.length} 个`);
  if (curImp.length !== prevImp.length) chips.push(`影响面 ${prevImp.length} → ${curImp.length} 个`);
  if (newRisks.length) chips.push(`新增风险 ${newRisks.length} 项`);
  if (newImps.length) chips.push(`新增影响 ${newImps.length} 项`);
  if (!chips.length) chips.push('与上次分析结论一致');

  let html = `<div class="an-diff"><span class="an-diff-title">对比上次分析</span>${chips.map((c) => `<span class="an-diff-chip">${c}</span>`).join('')}`;
  const detailNames = [...newRisks.map((r) => r.title), ...newImps.map((a) => a.module)];
  if (detailNames.length) html += `<span class="an-diff-detail">${detailNames.join('；')}</span>`;
  html += '</div>';
  return html;
}

// AI 重新分析策略：依据「用户输入是否被本次分析全覆盖」给出建议
// use：参与分析的勾选文件；covered：后端实际解析到的文件名
function renderReAnalyzeDecision(re, note, use, covered) {
  const coveredNames = new Set(covered);
  const missing = use.filter((f) => f.name && !coveredNames.has(f.name));
  if (!missing.length) {
    // 全覆盖：不展示重新分析按钮，底部说明「为何不建议重新分析」
    re.classList.add('hidden');
    note.classList.remove('hidden');
    const total = use.length;
    note.textContent = total
      ? `本次分析已覆盖参与评审的全部 ${total} 个输入文件，未遗漏任何输入。重复分析不会引入新的依据，结论将与本次一致，重新分析仅耗时并消耗调用额度，故不建议。`
      : '本次分析已完整纳入你的补充分析与测试数据，未遗漏任何输入。重复分析不会引入新的依据，结论将与本次一致，重新分析仅耗时并消耗调用额度，故不建议。';
    return;
  }
  // 覆盖不全：展示重新分析按钮，并说明缺失输入
  note.classList.add('hidden');
  re.classList.remove('hidden');
  re.querySelector('.acta-sub').textContent = `以下输入未纳入本次分析：${missing.map((f) => f.name).join('、')}，请重新分析`;
}

function renderAnalysis(analysis, prev, usedModels) {
  const box = document.getElementById('analysis-result');
  box.classList.remove('hidden');
  // 有上次分析时，在结果顶部展示对比差异；再展示本次实际使用模型
  let html = (prev ? analysisDiffHtml(prev, analysis) : '') + modelUsageHtml(usedModels);

  // 全选/全不选：控制下方所有「生成依据」勾选点
  html += '<div class="ap-toolbar"><label class="ap-all"><input type="checkbox" id="ap-all" checked> 全选（勾选点将作为 AI 用例生成依据）</label></div>';

  // 风险点
  let riskHtml = '';
  if (analysis.risks && analysis.risks.length) {
    analysis.risks.forEach((r, i) => {
      const cls = r.level === '高' ? 'high' : r.level === '中' ? 'mid' : 'low';
      riskHtml += `<div class="risk-item"><label class="ap-pick"><input type="checkbox" class="ap-sel" data-sec="risks" data-idx="${i}" checked></label><span class="badge ${cls}">${r.level}</span><div><b>${r.title}</b><p>${r.desc || ''}</p></div></div>`;
    });
  } else {
    riskHtml = '<p class="empty">未识别到风险点</p>';
  }
  html += accordionSection('风险点', riskHtml, `<span class="acc-count">${analysis.risks ? analysis.risks.length : 0}</span>`);

  // 影响面
  let impactHtml = '';
  if (analysis.impact_areas && analysis.impact_areas.length) {
    analysis.impact_areas.forEach((a, i) => {
      const cls = a.level === '高' ? 'high' : a.level === '中' ? 'mid' : 'low';
      impactHtml += `<div class="impact-item"><label class="ap-pick"><input type="checkbox" class="ap-sel" data-sec="impact_areas" data-idx="${i}" checked></label><span class="badge ${cls}">${a.level}</span><div><b>${a.module}</b><p>${a.reason || ''}</p></div></div>`;
    });
  } else {
    impactHtml = '<p class="empty">未识别到影响面</p>';
  }
  html += accordionSection('影响面', impactHtml, `<span class="acc-count">${analysis.impact_areas ? analysis.impact_areas.length : 0}</span>`);

  // 新增功能
  const newF = (analysis.new_features && analysis.new_features.length)
    ? `<div class="feature-list">${analysis.new_features.map((f, i) => `<label class="ap-pick feature"><input type="checkbox" class="ap-sel" data-sec="new_features" data-idx="${i}" checked><span>${f}</span></label>`).join('')}</div>`
    : '<p class="empty">无</p>';
  html += accordionSection('新增功能', newF);

  // 既有功能
  const exF = (analysis.existing_features && analysis.existing_features.length)
    ? `<div class="feature-list">${analysis.existing_features.map((f, i) => `<label class="ap-pick feature"><input type="checkbox" class="ap-sel" data-sec="existing_features" data-idx="${i}" checked><span>${f}</span></label>`).join('')}</div>`
    : '<p class="empty">无</p>';
  html += accordionSection('既有功能', exF);

  // 报告摘要
  const s = analysis.summary || {};
  let sumHtml = '<p class="empty">无</p>';
  if (s.overview || s.recommendation) {
    sumHtml = '<div class="summary-block">';
    if (s.overview) sumHtml += `<p><span class="label">概述：</span>${s.overview}</p>`;
    if (s.recommendation) sumHtml += `<p><span class="label">建议：</span>${s.recommendation}</p>`;
    if (s.focus_areas && s.focus_areas.length) sumHtml += `<p><span class="label">重点区域：</span>${s.focus_areas.join('、')}</p>`;
    sumHtml += '<label class="ap-pick summary"><input type="checkbox" class="ap-sel" data-sec="summary" data-idx="0" checked><span>纳入摘要作为生成依据</span></label>';
    sumHtml += '</div>';
  }
  html += accordionSection('报告摘要', sumHtml);

  // 业务流程图：随分析生成，默认折叠；首次展开才渲染 Mermaid
  const hasFlow = analysis.flowchart && analysis.flowchart.trim();
  const fcType = analysis.flowchart_type || '简单';
  const flowHtml = hasFlow
    ? `<div class="fc-wrap" data-fc-ctx="${encodeURIComponent(analysis.flowchart)}" data-fc-type="${fcType}">
         <div class="fc-actions">
           <span class="fc-type-tag">${fcType}流程图</span>
           <button type="button" class="btn ghost" data-fc-dl="png">下载 PNG</button>
           <button type="button" class="btn ghost" data-fc-dl="jpeg">下载 JPEG</button>
           <button type="button" class="btn ghost" data-fc-open>点击放大</button>
         </div>
         <div class="fc-container"><p class="file-empty">展开后渲染流程图</p></div>
       </div>`
    : '<p class="file-empty">未生成业务流程图</p>';
  html += accordionSection('业务流程图', flowHtml, hasFlow ? `<span class="acc-count">${fcType}</span>` : '');

  box.innerHTML = html;
  bindAccordions(box);
  bindFlowchart(box);
  bindSelectAll(box);
  // 需求评审内容可导出（分析点 + 评审点）
  document.getElementById('analysis-export').classList.remove('hidden');
}

// 收集需求评审中用户勾选的节点：{ section: [idx,...] }，summary 为布尔
// 无评审结果（无勾选点）时返回空字符串，后端按全量分析生成
function collectCheckedPoints() {
  const box = document.getElementById('analysis-result');
  const sels = box ? box.querySelectorAll('.ap-sel') : [];
  if (!sels.length) return '';
  const map = {};
  sels.forEach((cb) => {
    const sec = cb.dataset.sec;
    if (sec === 'summary') return; // summary 单独处理
    (map[sec] = map[sec] || []).push(parseInt(cb.dataset.idx, 10));
  });
  const sumCb = box.querySelector('.ap-sel[data-sec="summary"]');
  map.summary = sumCb ? sumCb.checked : false;
  // 去重并保序
  Object.keys(map).forEach((k) => { if (Array.isArray(map[k])) map[k] = [...new Set(map[k])]; });
  return JSON.stringify(map);
}

// 全选/全不选：同步所有「生成依据」勾选点状态
function bindSelectAll(box) {
  const all = box.querySelector('#ap-all');
  if (!all) return;
  const sync = () => {
    const sels = box.querySelectorAll('.ap-sel');
    const allOn = [...sels].every((cb) => cb.checked);
    all.checked = sels.length ? allOn : false;
    all.indeterminate = !allOn && [...sels].some((cb) => cb.checked);
  };
  all.addEventListener('change', () => {
    box.querySelectorAll('.ap-sel').forEach((cb) => { cb.checked = all.checked; });
  });
  box.querySelectorAll('.ap-sel').forEach((cb) => cb.addEventListener('change', sync));
  sync();
}

// 导出需求评审内容（分析点 + 评审点）到指定格式：弹出服务器目录选择对话框
function onExportAnalysis(fmt) {
  openSaveDirDialog('review', fmt);
}

// 业务流程图：首次展开时渲染 Mermaid；绑定下载/放大
function bindFlowchart(root) {
  const acc = root.querySelector('.accordion-head .accordion-title');
  const flowWraps = root.querySelectorAll('.fc-wrap');
  if (!flowWraps.length) return;
  // 懒渲染：首次展开才执行 mermaid.render
  flowWraps.forEach((wrap) => {
    const container = wrap.querySelector('.fc-container');
    const ctx = decodeURIComponent(wrap.dataset.fcCtx || '');
    const type = wrap.dataset.fcType || '简单';
    let rendered = false;
    const maybeRender = () => {
      if (!rendered && wrap.closest('.accordion').classList.contains('open')) {
        rendered = true;
        renderFlowchart(container, ctx, type);
      }
    };
    wrap.closest('.accordion').querySelector('.accordion-head').addEventListener('click', maybeRender);
    // 下载按钮
    wrap.querySelectorAll('[data-fc-dl]').forEach((btn) => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); downloadFlowchart(container, btn.dataset.fcDl); });
    });
    // 点击放大
    const openBtn = wrap.querySelector('[data-fc-open]');
    if (openBtn) openBtn.addEventListener('click', (e) => { e.stopPropagation(); openFlowchartLightbox(container); });
  });
}

async function onGenerate() {
  // 1) 先检查是否上传文件：未上传则引导去上传
  if (!getUploadedFiles().length) {
    openModal(`
      <div class="modal-title">请先上传文件</div>
      <p class="modal-desc">生成用例需要先上传需求文档 / 设计稿等文件作为依据。请先选择文件上传，再生成用例。</p>
      <div class="modal-actions">
        <button type="button" class="btn ghost" id="gup-cancel">取消</button>
        <button type="button" class="btn" id="gup-upload">去上传文件</button>
      </div>
    `);
    document.getElementById('gup-cancel').addEventListener('click', () => closeModal());
    document.getElementById('gup-upload').addEventListener('click', () => {
      closeModal();
      const f = document.getElementById('files');
      if (f) f.click();
    });
    return;
  }
  // 2) 已上传但尚未需求评审：建议先去评审（评审后可生成更全面用例），也可继续直接生成
  //    以当前会话实际分析结果（lastAnalysis）为准，而非持久化的 milestone（刷新后会残留）
  if (!lastAnalysis) {
    openModal(`
      <div class="modal-title">建议先进行需求评审</div>
      <p class="modal-desc">已上传文件但尚未进行需求评审。建议先评审，AI 将根据评审结果生成更全面的用例；也可以继续直接生成。</p>
      <div class="modal-actions">
        <button type="button" class="btn ghost" id="grv-generate">继续生成</button>
        <button type="button" class="btn" id="grv-review">前往需求评审</button>
      </div>
    `);
    document.getElementById('grv-generate').addEventListener('click', () => { closeModal(); doGenerate(); });
    document.getElementById('grv-review').addEventListener('click', () => { closeModal(); showModule('analysis'); });
    return;
  }
  // 3) 已评审：重新生成需二次确认（避免误覆盖）
  if (getCases().length) {
    confirmAction('AI生成用例', '当前已有用例，重新生成将覆盖现有结果。是否继续？', '重新生成', () => doGenerate());
    return;
  }
  doGenerate();
}

async function doGenerate() {
  if (generating) return;
  ensureSessionId(); // 保证本次生成使用稳定会话ID，便于「停止」定位到同一会话
  const fd = formData();
  attachModelPool(fd);
  fd.append('template', document.getElementById('template').value);
  // 携带当前上传文件与所有输入，确保生成基于实际上传与分析结果（用勾选的追加分析文件）
  fd.append('user_input', document.getElementById('user_input').value);
  fd.append('test_data', document.getElementById('test_data').value);
  const use = analysisFiles();
  fd.append('filenames', use.map((f) => f.name).join(','));
  use.filter((f) => f instanceof File).forEach((f) => fd.append('files', f));
  // 需求评审勾选点：仅以用户勾选的节点作为 AI 用例生成依据
  fd.append('checked_points', collectCheckedPoints());

  // 点击后立即展示顶部进度条，不等预检/模型测试；AbortController 提前创建，
  // 使「停止生成」从预检（连通性测试）阶段起即可中断全部流程
  showProgress(2, '正在使用可用模型生成用例...');
  generating = true;
  updateGenerateButtons();
  generateAbort = new AbortController();
  const signal = generateAbort.signal;

  let genModel = null;
  let pct = 2;
  const timer = setInterval(() => {
    if (pct < 90) { pct += 6; showProgress(pct, `正在使用 ${genModel || '可用模型'} 生成用例...`); }
  }, 300);

  try {
    // 预检：先自动测试可用模型；全部不可用则弹窗提示去模型管理填正确 Key，终止生成
    let picked = null;
    try {
      picked = await precheckModels({
        provider: document.getElementById('provider').value,
        model: document.getElementById('model').value,
        models: buildModelPool(),
        has_image: false,
      }, signal);
    } catch (err) {
      if (err && err.name === 'AbortError') throw err; // 用户已停止：直接结束，不再预检/生成
      genModel = predictModel('text').label; // 预检接口异常时退化预测，不阻断生成
    }
    if (picked && picked.ok && picked.picked.text) {
      const t = picked.picked.text;
      genModel = `${providerNames[t.provider] || t.provider} ${t.model}`;
    } else if (picked && !picked.ok) {
      generating = false;
      updateGenerateButtons();
      hideProgress();
      showErrorModal('没有可用模型', (picked && picked.error) || '请到模型管理填写正确的 API Key 后再生成');
      return;
    }

    const res = await generate(fd, signal);
    setCases(res.cases || []);
    lastReview = res.review || null;          // 记录评审，供「重新生成/保持」按钮判定
    showModule('generate'); // 用例结果不渲染页面列表，仅展示摘要（条数）
    renderCases(getCases());
    setMilestoneDone('generate'); // 用例生成成功即完成，解锁导出
    refreshToolbar();
    updateGenerateButtons();  // 成功后切换「重新生成」（评审 >95 分则保持「AI生成用例」）
    lastUsedModels = res.used_models;
    renderReview(res.review, res.used_models); // 评审明细在右侧面板（先切模块再打开右侧，避免被收起）
    renderReviewDecision(); // 生成+评审结束：按输入覆盖情况展示「无需重新评审」说明
    promptExportGuide(getCases().length); // 生成成功引导去导出（选择/创建文件夹保存）
  } catch (err) {
    const aborted = err && err.name === 'AbortError';
    if (aborted) toast('已停止生成', 'ok');
    else showErrorModal('生成用例失败', err && err.message ? err.message : err);
  } finally {
    clearInterval(timer);
    generating = false;
    generateAbort = null;
    updateGenerateButtons();
    showProgress(100);
    setTimeout(hideProgress, 400);
  }
}

async function onReview() {
  // AI自动评审需等生成用例结束：无用例时提示先生成
  if (generating) { toast('请先等待用例生成结束', 'err'); return; }
  if (!getCases().length) { toast('请先生成用例', 'err'); return; }
  // 若所有输入已被覆盖，无需重新评审，给出原因（参考需求分析的「无需重新分析」）
  const missing = analysisFiles().filter((f) => f.name && !lastCoveredFiles.includes(f.name));
  if (!missing.length && lastCoveredFiles.length) {
    const note = document.getElementById('gen-re-note');
    note.classList.remove('hidden');
    note.textContent = lastCoveredFiles.length
      ? `本次评审已覆盖全部 ${lastCoveredFiles.length} 个输入文件，未遗漏任何输入。重复评审不会引入新的依据，结论将与本次一致，仅耗时并消耗调用额度，故无需重新评审。`
      : '本次评审已完整纳入你的补充分析与测试数据，未遗漏任何输入。重复评审不会引入新的依据，结论将与本次一致，故无需重新评审。';
    return;
  }
  // 已生成过用例，重复评审需二次确认
  confirmAction('AI自动评审', '对当前用例执行 AI 评审，将覆盖现有评审结果。是否继续？', '开始评审', () => doReview());
}

async function doReview() {
  document.getElementById('gen-re-note').classList.add('hidden');
  const fd = formData();
  attachModelPool(fd);
  const res = await review(fd);
  lastReview = res.review || null;
  updateGenerateButtons(); // 评审后按最新分数刷新「重新生成/保持」文案
  lastUsedModels = res.used_models;
  renderReview(res.review, res.used_models);
  renderReviewDecision();
}

// 评审结束决策：若全部输入已被覆盖，展示「无需重新评审」原因（参考重新分析实现）
function renderReviewDecision() {
  const note = document.getElementById('gen-re-note');
  const missing = analysisFiles().filter((f) => f.name && !lastCoveredFiles.includes(f.name));
  if (!missing.length && lastCoveredFiles.length) {
    note.classList.remove('hidden');
    note.textContent = `本次评审已覆盖全部 ${lastCoveredFiles.length} 个输入文件，未遗漏任何输入。重复评审不会引入新的依据，结论将与本次一致，仅耗时并消耗调用额度，故无需重新评审。`;
  }
}

// 文本归一化为单行：折叠所有空白（含换行）为单个空格并去首尾
function oneLine(s) {
  return String(s ?? '').replace(/\s+/g, ' ').trim();
}

// 截断长文本：默认最多保留 100 字，超出用「…」结尾；配合 title 属性 hover 显示全部
function clampText(s, max = 100) {
  const t = String(s ?? '');
  return t.length > max ? t.slice(0, max) + '…' : t;
}

function renderReview(review, usedModels) {
  if (!review) return;
  const issues = review.issues || [];
  const score = review.overall_score;
  // 概括一句话：折叠换行 + 限 100 字，单行显示（hover 看全文）；后面的分点（issues）保持原样
  const comment = clampText(oneLine(review.comment));
  // 统计总评审点 + 高/中/低数量
  let high = 0, mid = 0, low = 0;
  issues.forEach((i) => {
    const lv = String(i.level || '').trim();
    if (lv === '高') high++; else if (lv === '中') mid++; else if (lv === '低') low++;
  });
  let html = modelUsageHtml(usedModels);
  // 汇总条：总评审点 + 高/中/低
  html += `<div class="rv-summary"><span class="rv-total">总评审点 ${issues.length}</span>
    <span class="rv-count high">高${high}</span><span class="rv-count mid">中${mid}</span><span class="rv-count low">低${low}</span></div>`;
  // 评审决策条：依据结论档位展示是否需要重新生成用例
  const decision = reviewDecision(review);
  if (decision) html += decision;
  // AI 评审：分数徽标 + 概括一句话（单行，非盒子/组件框）
  if (score != null) {
    html += `<div class="review-score"><span class="score-num">${score}</span><b>AI 评审</b><span class="rv-comment" title="${escapeAttr(review.comment || '')}">${comment || ''}</span></div>`;
  } else if (comment) {
    html += `<p><b>评审意见：</b><span class="rv-comment" title="${escapeAttr(review.comment || '')}">${comment}</span></p>`;
  }
  // 每个评审点分开展示（带严重度徽标）——保持原样；用可展开/收起的折叠块承载，展开态每次重渲染时重新绑定
  if (issues.length) {
    const listHtml = '<div class="rv-list">' + issues.map((i, idx) => {
      const lv = ['高', '中', '低'].includes(String(i.level || '').trim()) ? String(i.level).trim() : '';
      const badge = lv
        ? `<span class="badge ${lv === '高' ? 'high' : lv === '中' ? 'mid' : 'low'}">${lv}</span>`
        : '';
      return `<div class="issue-item"><span class="idx">评审点 ${idx + 1}</span>${badge}<span class="idx">用例 ${i.case_index}</span><div>${i.problem}<br><span class="label">建议：</span><span class="rv-comment" title="${escapeAttr(i.suggestion || '')}">${clampText(i.suggestion)}</span></div></div>`;
    }).join('') + '</div>';
    html += accordionSection(`评审明细（${issues.length}）`, listHtml, `<span class="acc-count">${issues.length}</span>`);
  }
  if (!issues.length && !comment && score == null) html += '<p class="empty">暂无评审意见</p>';
  // 评审明细展示在右侧面板；重新渲染后绑定折叠，保证可反复展开/收起
  renderInRight('用例评审', html);
  bindAccordions(document.getElementById('file-content'));
}

// 评审决策条：按 95/85 档位给出「无需/建议/必须重新生成」与覆盖统计
function reviewDecision(review) {
  const needs = String(review.needs_regeneration || '');
  const conclusion = review.conclusion || '';
  const map = {
    none: { cls: 'ok', text: '无需重新生成用例' },
    suggest: { cls: 'mid', text: '建议重新生成用例，补充未覆盖检查点' },
    must: { cls: 'bad', text: '必须重新生成用例，覆盖未覆盖清单内容' },
  };
  const m = map[needs];
  if (!m) return '';
  const cov = review.coverage || {};
  let covHtml = '';
  if (cov.percent != null || cov.total != null) {
    covHtml = `<span class="rv-cov">覆盖 ${cov.covered ?? '-'}/${cov.total ?? '-'}（${cov.percent ?? '-'}%）</span>`;
  }
  return `<div class="rv-decision ${m.cls}"><b>${conclusion || '评审结论'}</b><span>${m.text}</span>${covHtml}</div>`;
}

// 用例不在页面展示表格列表：仅渲染摘要行；模板与按钮始终可见
function updateCaseModuleUI() {
  const gen = document.getElementById('mod-generate');
  if (!gen) return;
  const tpl = gen.querySelector('.input-panel');
  const btns = gen.querySelector('#gen-btns');
  if (tpl) tpl.classList.remove('hidden');
  if (btns) btns.classList.remove('hidden');
}

// 用例列表只渲染一行摘要（条数），不渲染表格，避免页面堆叠用例数据
function renderCases(list) {
  const box = document.getElementById('case-list');
  updateCaseModuleUI(); // 始终显示模板与按钮
  if (!list.length) {
    box.innerHTML = '<p class="empty">暂无用例，点击「生成用例」</p>';
    return;
  }
  box.innerHTML = `<p class="case-count">已生成 ${list.length} 条用例，未在页面展示。可前往「导出」选择格式，指定保存文件夹后导出。</p>`;
}

// 生成成功弹窗 = 引导去导出（选择/创建文件夹保存）
function promptExportGuide(count) {
  openModal(`
    <div class="modal-title"><span class="ok-icon">✓</span>用例已生成（${count} 条）</div>
    <div class="modal-body">用例生成成功。前往「导出」模块，选择所需格式，导出时即可创建或选择文件夹，文件将保存到对应路径。</div>
    <div class="modal-actions">
      <button type="button" class="btn ghost" id="gs-stay">留在本页</button>
      <button type="button" class="btn" id="gs-export">前往导出 →</button>
    </div>
  `);
  document.getElementById('gs-stay').addEventListener('click', () => closeModal());
  document.getElementById('gs-export').addEventListener('click', () => { closeModal(); showModule('export'); });
}

// 导出格式映射：用例 / 操作手册 各自的可用格式
const EXPORT_FORMATS = {
  cases: [
    { f: 'html', t: 'HTML' },
    { f: 'excel', t: 'Excel' },
    { f: 'word', t: 'Word' },
    { f: 'xmind', t: 'XMind(.mm)' },
    { f: 'txt', t: 'TXT' },
    { f: 'json', t: 'JSON' },
  ],
  manual: [
    { f: 'word', t: 'Word' },
    { f: 'html', t: 'HTML' },
  ],
};

// 初始化导出模块：填充两个按钮各自的格式下拉，并绑定 hover 展开/收起（动画弹出）
function initExportDropdowns() {
  document.querySelectorAll('.exp-drop').forEach((drop) => {
    const btns = drop.querySelector('.export-fmt-btns');
    const type = btns.dataset.expType;
    if (!type) return;
    btns.innerHTML = EXPORT_FORMATS[type].map((x) =>
      `<button type="button" class="btn sm ghost" data-fmt="${x.f}">${x.t}</button>`).join('');
    btns.querySelectorAll('[data-fmt]').forEach((b) => {
      b.addEventListener('click', () => doExport(type, b.dataset.fmt));
    });
  });
  document.querySelectorAll('.exp-item').forEach((item) => {
    item.addEventListener('mouseenter', () => openExportDrop(item));
    item.addEventListener('mouseleave', () => closeExportDrop(item));
  });
}

// 展开格式下拉：移除隐藏并重新触发入场动画
function openExportDrop(item) {
  const drop = item.querySelector('.exp-drop');
  if (!drop) return;
  drop.classList.remove('hidden');
  drop.classList.remove('show');
  void drop.offsetWidth; // 重排以重启动画
  drop.classList.add('show');
}

// 收起格式下拉
function closeExportDrop(item) {
  const drop = item.querySelector('.exp-drop');
  if (!drop) return;
  drop.classList.remove('show');
  drop.classList.add('hidden');
}

// 实际导出；无已生成用例时先提示跳转生成或用例导出，否则弹出服务器目录选择对话框
function doExport(type, fmt) {
  if (!getCases().length) {
    const kind = type === 'manual' ? '操作手册' : '用例';
    openModal(`
      <div class="modal-title">暂无可导出的${kind}</div>
      <p class="modal-desc">当前还没有生成测试用例。请先「生成用例」，再回来导出${kind}。</p>
      <div class="modal-actions">
        <button type="button" class="btn ghost" id="exp-stay-no-case">留在本页</button>
        <button type="button" class="btn" id="exp-go-gen">去生成用例</button>
      </div>
    `);
    document.getElementById('exp-stay-no-case').addEventListener('click', closeModal);
    document.getElementById('exp-go-gen').addEventListener('click', () => {
      closeModal();
      showModule('generate');
    });
    return;
  }
  openSaveDirDialog(type, fmt);
}

// ---- 保存到服务器目录弹窗 ----
const _SD_URLS = { review: '/export/analysis', cases: '/export/cases', manual: '/export/manual' };
const _SD_KINDS = { review: 'analysis', cases: 'cases', manual: 'manual' };
let _sd = { cur: '', type: '', fmt: '' };

function _sdLabel(type) {
  return type === 'review' ? '需求评审' : type === 'manual' ? '操作手册' : '测试用例';
}

function _sdSuggestedName(type, fmt) {
  const ext = fmt === 'excel' ? '.xlsx' : fmt === 'word' ? '.docx' : fmt === 'xmind' ? '.mm' : `.${fmt}`;
  const label = type === 'review' ? '需求评审报告' : type === 'manual' ? '操作手册' : '测试用例';
  return `${label}_${new Date().toISOString().slice(0, 10)}${ext}`;
}

async function _sdLoad(path) {
  const listEl = document.getElementById('sd-list');
  const curEl = document.getElementById('sd-cur');
  if (!listEl || !curEl) return;
  try {
    const d = await listDirs(path);
    _sd.cur = d.current;
    curEl.textContent = d.current;
    if (!d.dirs.length) listEl.innerHTML = '<div class="fb-empty">（空目录）</div>';
    else listEl.innerHTML = d.dirs.map((x) =>
      `<div class="sd-item" data-dir="${escapeAttr(x)}">📁 ${escapeHtml(x)}</div>`).join('');
    listEl.querySelectorAll('.sd-item').forEach((it) =>
      it.addEventListener('click', () => _sdLoad(`${_sd.cur}/${it.dataset.dir}`)));
    const up = document.getElementById('sd-up');
    if (up) {
      const hasParent = d.parent && d.parent !== d.current;
      up.disabled = !hasParent;
      up.onclick = () => { if (hasParent) _sdLoad(d.parent); };
    }
  } catch (e) {
    toast((e && e.message) || '读取目录失败', 'err');
  }
}

async function _sdSave() {
  const fd = formData();
  fd.append('format', _sd.fmt);
  fd.append('kind', _sd.type);
  fd.append('dir', _sd.cur);
  fd.append('filename', (document.getElementById('sd-name').value || '').trim());
  attachModelPool(fd);
  showLoadingToast('正在保存，请稍候...');
  try {
    const res = await saveExportToDir(fd);
    closeModal();
    toast(`已保存到：${res.path}`, 'ok');
  } catch (err) {
    toast((err && err.message) || '保存失败，请重试', 'err');
  }
}

// 打开“选择服务器目录”对话框：浏览/选择目录 + 确认文件名后保存到服务器
function openSaveDirDialog(type, fmt) {
  _sd = { cur: '', type, fmt };
  openModal(`
    <div class="modal-title">保存${_sdLabel(type)}到服务器目录</div>
    <div class="sd-path">当前目录：<b id="sd-cur">…</b></div>
    <div class="sd-tools">
      <button type="button" class="btn sm ghost" id="sd-up">⬆ 上一级</button>
      <button type="button" class="btn sm ghost" id="sd-root">回到根目录</button>
    </div>
    <div class="sd-list" id="sd-list"></div>
    <label class="sd-label">文件名</label>
    <input type="text" class="modal-input" id="sd-name" value="${escapeAttr(_sdSuggestedName(type, fmt))}">
    <div class="modal-actions">
      <button type="button" class="btn ghost" id="sd-cancel">取消</button>
      <button type="button" class="btn ghost" id="sd-download">下载到本地</button>
      <button type="button" class="btn" id="sd-save">保存到该目录</button>
    </div>
  `);
  const card = document.querySelector('#modal .modal-card');
  if (card) card.classList.add('fb-card');
  _sdLoad('');
  document.getElementById('sd-cancel').addEventListener('click', closeModal);
  document.getElementById('sd-root').addEventListener('click', () => _sdLoad(''));
  document.getElementById('sd-save').addEventListener('click', _sdSave);
  document.getElementById('sd-download').addEventListener('click', () => {
    closeModal();
    const fd = formData();
    fd.append('format', fmt);
    attachModelPool(fd);
    saveExport(fd, _SD_URLS[type], _SD_KINDS[type], fmt)
      .then((res) => {
        if (res.status === 'saved') toast(`已保存为：${res.name}`, 'ok');
        else if (res.status === 'downloaded') toast('导出成功（已保存到默认下载目录）', 'ok');
      })
      .catch((err) => toast((err && err.message) || '导出失败，请重试', 'err'));
  });
}

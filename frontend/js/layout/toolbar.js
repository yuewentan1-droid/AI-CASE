// 左侧里程碑工具栏：按流水线（配置→上传→分析→生成→导出）逐步解锁，前一步未完成置灰不可点
// hover 到已解锁按钮即展示对应模块；点击后"钉住"该模块，后续 hover 不再自动跳走（theme 为动作，仍仅点击触发）
import { showModule, toast } from '../ui.js';
import { getTheme, setTheme, isPipelineLocked, lockedBy, PIPELINE, MILESTONE_LABELS } from '../store.js';

let pinned = false; // 点击任意模块后为 true，hover 不再自动切换

export function initToolbar() {
  applyTheme(getTheme());
  refreshToolbar();
  const bar = document.getElementById('toolbar');
  // hover：仅未钉住且已解锁的模块才自动预览切换
  bar.addEventListener('mouseover', (e) => {
    if (pinned) return;
    const btn = e.target.closest('.tbtn[data-module]');
    if (btn && !isPipelineLocked(btn.dataset.module)) showModule(btn.dataset.module);
  });
  bar.addEventListener('click', (e) => {
    const btn = e.target.closest('.tbtn');
    if (!btn) return;
    if (btn.dataset.action === 'theme') {
      const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      return;
    }
    if (btn.dataset.module) {
      if (isPipelineLocked(btn.dataset.module)) {
        toast(`请先完成「${MILESTONE_LABELS[lockedBy(btn.dataset.module)]}」`, 'err');
        return;
      }
      pinned = true; // 点击后停留在该模块，hover 不再跳走
      showModule(btn.dataset.module);
    }
  });
}

// 首页「开始生成用例」：滑出左侧工具栏并进入首个输入步骤
export function initHomeStart() {
  const btn = document.getElementById('btn-start');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const layout = document.querySelector('.app-layout');
    layout.classList.remove('home-hidden'); // 移除首页隐藏态，工具栏滑出
    // 进入流水线首个未解锁步骤（新会话未配置模型则落到「配置模型」，已配置则到「上传文件」）
    const target = PIPELINE.find((m) => !isPipelineLocked(m)) || 'upload';
    showModule(target);
  });
}

// 刷新里程碑状态：锁定步骤置灰 + 更新 hover 提示
export function refreshToolbar() {
  document.querySelectorAll('.tbtn[data-module]').forEach((btn) => {
    const m = btn.dataset.module;
    if (!PIPELINE.includes(m)) return;
    const locked = isPipelineLocked(m);
    btn.classList.toggle('locked', locked);
    btn.title = locked ? `请先完成「${MILESTONE_LABELS[lockedBy(m)]}」` : MILESTONE_LABELS[m];
  });
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  setTheme(theme);
}

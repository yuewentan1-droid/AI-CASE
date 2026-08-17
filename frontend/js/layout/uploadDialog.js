// 上传完成弹窗：提示用户"先查看文件"或"去分析步骤"（只跳步骤，不自动跑）
import { openModal, closeModal, showModule } from '../ui.js';

export function showUploadDialog(files) {
  const names = files.map((f) => f.name || '文件').slice(0, 50);
  if (files.length > 50) names.push(`… 共 ${files.length} 个文件`);
  const list = names.map((n) => `<li>${escapeHtml(n)}</li>`).join('');

  openModal(`
    <div class="modal-title"><span class="ok-icon">✓</span>已上传 ${files.length} 个文件</div>
    <ul class="modal-file-list">${list}</ul>
    <div class="modal-actions">
      <button type="button" class="btn ghost" id="dlg-stay">先查看文件</button>
      <button type="button" class="btn" id="dlg-analyze">去需求分析 →</button>
    </div>
  `);

  document.getElementById('dlg-stay').addEventListener('click', closeModal);
  document.getElementById('dlg-analyze').addEventListener('click', () => {
    closeModal();
    showModule('analysis');
    const btn = document.getElementById('analyze-btn');
    btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
    btn.classList.add('pulse');
    setTimeout(() => btn.classList.remove('pulse'), 1600);
  });
}

function escapeHtml(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

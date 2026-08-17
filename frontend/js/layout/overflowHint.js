// 内容超出查看窗口时的底部提示：内容较多时提醒点击「最大化查看」
// 供 rightpanel 与 preview 共用；通过触发右上角全屏按钮复用已有全屏逻辑
// 检测放在下一帧执行，确保布局已稳定；同时检查纵向与横向溢出
export function refreshOverflowHint(box) {
  if (!box) return;
  requestAnimationFrame(() => {
    const overflows =
      box.scrollHeight > box.clientHeight + 1 ||
      box.scrollWidth > box.clientWidth + 1;
    const existing = box.querySelector('.pv-more');
    if (!overflows) {
      if (existing) existing.remove();
      return;
    }
    if (existing) return;
    const bar = document.createElement('div');
    bar.className = 'pv-more';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pv-more-btn';
    btn.textContent = '… 内容较多，点击最大化查看 ⛶';
    btn.addEventListener('click', () => {
      const full = document.getElementById('preview-full');
      if (full) full.click(); // 复用全屏阅读
    });
    bar.appendChild(btn);
    box.appendChild(bar);
  });
}

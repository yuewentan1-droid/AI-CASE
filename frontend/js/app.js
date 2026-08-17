// 前端入口：初始化各区域模块
import { showModule } from './ui.js';
import { initToolbar, initHomeStart, refreshToolbar } from './layout/toolbar.js';
import { initMain } from './layout/main.js';
import { renderFileBar, renderFileList, restoreUploadedFiles, initFileManagerToggle, initOpenDir, initFileSearch } from './layout/filebar.js';
import { initRightPanel } from './layout/rightpanel.js';

initToolbar();
initHomeStart();
initMain();
initRightPanel();
initFileManagerToggle();
initOpenDir();
initFileSearch();
renderFileBar();
renderFileList();
restoreUploadedFiles(); // 刷新后恢复本地持久化的上传文件
refreshToolbar();
showModule('home'); // 默认首页，无工具栏选中、不展示右侧文件内容
const appLayout = document.querySelector('.app-layout');
appLayout.classList.add('preview-hidden');
appLayout.classList.add('home-hidden'); // 首页不展示左侧工具栏，点击「开始生成用例」后滑出

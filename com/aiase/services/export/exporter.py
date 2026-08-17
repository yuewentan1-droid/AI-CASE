"""导出引擎调度 - 支持多格式导出"""
import os

from com.aiase.config.settings import Config
from com.aiase.services.export.html_exporter import HTMLExporter
from com.aiase.services.export.txt_exporter import TxtExporter
from com.aiase.services.export.json_exporter import JsonExporter
from com.aiase.services.export.excel_exporter import ExcelExporter
from com.aiase.services.export.word_exporter import WordExporter
from com.aiase.services.export.xmind_exporter import XMindExporter
from com.aiase.services.export.manual_generator import ManualGenerator
from com.aiase.services.export.analysis_exporter import AnalysisExporter
from com.aiase.services.export.field_aligner import align_cases

_EXPORTERS = {
    'html': HTMLExporter,
    'txt': TxtExporter,
    'json': JsonExporter,
    'excel': ExcelExporter,
    'word': WordExporter,
    'xmind': XMindExporter,
}

_EXT = {'html': '.html', 'txt': '.txt', 'json': '.json', 'excel': '.xlsx', 'word': '.docx', 'xmind': '.mm'}


class ExportEngine:
    """导出引擎：支持 html/txt/json/excel/word/xmind 及操作手册"""

    def __init__(self):
        self.manual = ManualGenerator()

    def export(self, cases, template, format_type, session_id, analysis=None, ai=None):
        """导出用例到指定格式，返回文件路径"""
        cls = _EXPORTERS[format_type]
        out_dir = os.path.join(Config.TEMP_PATH, session_id)
        os.makedirs(out_dir, exist_ok=True)
        path = os.path.join(out_dir, f'testcases_{session_id}{_EXT[format_type]}')
        # 导出前对齐「测试步骤/测试结果」序号，保证一一对应
        align_cases(cases, template)
        if format_type == 'xmind':
            return cls().export(cases, template, path, analysis=analysis, ai=ai)
        return cls().export(cases, template, path)

    def export_analysis(self, analysis, review, format_type, session_id):
        """导出需求评审内容（分析内容点 + 用例评审点）到指定格式，返回文件路径"""
        ext = {'html': '.html', 'excel': '.xlsx', 'word': '.docx', 'xmind': '.mm'}[format_type]
        out_dir = os.path.join(Config.TEMP_PATH, session_id)
        os.makedirs(out_dir, exist_ok=True)
        path = os.path.join(out_dir, f'analysis_{session_id}{ext}')
        return AnalysisExporter().export(analysis, review, format_type, path)

    def export_manual(self, cases, analysis, format_type, session_id, ai=None):
        """导出操作手册，format_type 支持 word/html；ai 存在时生成增强内容（结合需求上下文/优先级/图文表格）"""
        out_dir = os.path.join(Config.TEMP_PATH, session_id)
        os.makedirs(out_dir, exist_ok=True)
        content = self.manual.generate(cases, analysis, '测试用例操作手册', ai=ai)
        ext = '.docx' if format_type == 'word' else '.html'
        path = os.path.join(out_dir, f'manual_{session_id}{ext}')
        if format_type == 'word':
            return self.manual.export_word(content, path)
        return self.manual.export_html(content, path)

    def formats(self):
        return list(_EXPORTERS.keys())

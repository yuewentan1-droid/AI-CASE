"""核心流程编排器 - 三阶段：分析 -> 用例生成 -> 导出"""
from com.aiase.config.settings import Config
from com.aiase.utils import job_control
from com.aiase.manager.state_manager import StateManager
from com.aiase.manager.context_builder import ContextBuilder
from com.aiase.services.ai.model_factory import ModelFactory
from com.aiase.services.ai.multimodal_processor import MultimodalProcessor
from com.aiase.services.analysis.report_builder import ReportBuilder
from com.aiase.services.analysis.flowchart_generator import FlowchartGenerator
from com.aiase.services.testcase.skill_processor import SkillProcessor
from com.aiase.services.testcase.template_manager import TemplateManager
from com.aiase.services.testcase.case_generator import CaseGenerator
from com.aiase.services.testcase.reviewer import Reviewer
from com.aiase.services.testcase.filter_editor import FilterEditor
from com.aiase.services.export.exporter import ExportEngine
from com.aiase.services.export.filename_generator import FilenameGenerator


class TestCaseOrchestrator:
    """测试用例生成编排器"""

    def __init__(self):
        self.state = StateManager()
        self.skills = SkillProcessor()
        self.templates = TemplateManager()
        self.filter_editor = FilterEditor()
        self.export_engine = ExportEngine()

    def _processor(self, session_id, provider, model=None, api_key=None, models=None):
        return MultimodalProcessor(provider=provider, model=model, api_key=api_key,
                                   models=models, session_id=session_id)

    def process_phase1_analysis(self, session_id, file_paths, user_input='', test_data='',
                                provider='deepseek', model=None, api_key=None, analysis_skill=None,
                                models=None):
        """阶段一：智能分析（多模态识别 + 风险/影响/摘要/优先级）"""
        ai = self._processor(session_id, provider, model, api_key, models)
        ctx = ContextBuilder(ai)
        parsed_data = ctx.build(file_paths, user_input, test_data)
        job_control.check_cancel(session_id)  # 上下文解析后：若已停止则中断
        builder = ReportBuilder(ai)
        analysis = builder.build(parsed_data)
        analysis['context'] = parsed_data
        analysis['files'] = ctx.files
        analysis['used_models'] = ai.used_models  # 实际使用的模型（含兜底），供前端展示
        job_control.check_cancel(session_id)  # 报告分析后：若已停止则中断，不再生成流程图
        # 业务流程图：依据需求上下文生成（随分析一起，失败不阻断）
        flow = FlowchartGenerator(ai).generate(parsed_data)
        analysis['flowchart'] = flow.get('mermaid', '')
        analysis['flowchart_type'] = flow.get('type', '简单')
        job_control.check_cancel(session_id)  # 保存前：若已停止则丢弃结果
        self.state.save_analysis(session_id, analysis)
        return analysis

    def process_phase2_strategy(self, session_id, custom_template=None, user_skills=None,
                                provider='deepseek', model=None, api_key=None,
                                file_paths=None, user_input='', test_data='', models=None,
                                checked_points=None):
        """阶段二：测试策略与用例生成 + AI自动评审"""
        analysis = self.state.get_analysis(session_id) or {}
        # 携带了当前文件/输入时，用其刷新上下文，确保生成基于实际上传与分析
        if file_paths or user_input or test_data:
            ai = self._processor(session_id, provider, model, api_key, models)
            ctx = ContextBuilder(ai)
            analysis['context'] = ctx.build(file_paths or [], user_input, test_data)
            analysis['files'] = ctx.files
        job_control.check_cancel(session_id)  # 上下文刷新后：若已停止则中断
        # 按用户勾选的需求评审节点过滤，仅以勾选点为生成依据
        analysis = self._apply_selection(analysis, checked_points)
        template = self.templates.resolve(custom_template)
        # 用例生成采用生成Skill（testcase-generator），无则回退到 design Skill
        generator_skill = self.skills.get_generator_skill(user_skills) or self.skills.get_design_skill(user_skills)
        review_skill = self.skills.get_review_skill(user_skills)
        ai = self._processor(session_id, provider, model, api_key, models)
        generator = CaseGenerator(ai, self.skills)
        cases = generator.generate(analysis, template, generator_skill)
        job_control.check_cancel(session_id)  # 生成后：若已停止则不再评审/保存
        reviewer = Reviewer(ai, review_skill)
        # 评审结合需求分析全部点 + 用户原始输入（文件/设计图/补充/测试数据）判断覆盖
        review = reviewer.review(cases, analysis=analysis, context=analysis.get('context'))
        job_control.check_cancel(session_id)  # 保存前：若已停止则丢弃结果
        self.state.set(session_id, 'template', template)
        self.state.set(session_id, 'review', review)
        self.state.save_cases(session_id, cases)
        return {'cases': cases, 'review': review, 'template': template, 'used_models': ai.used_models}

    @staticmethod
    def _apply_selection(analysis, checked_points):
        """按用户勾选点过滤分析结果；未提供勾选（或勾选为空）时保留全量"""
        if not checked_points:
            return analysis
        if not isinstance(checked_points, dict):
            return analysis
        filtered = dict(analysis)
        for sec, sel in checked_points.items():
            if sec == 'summary':
                # 摘要为布尔：勾选保留摘要，否则清空
                filtered['summary'] = analysis.get('summary') if sel else {}
                continue
            items = analysis.get(sec) or []
            if not isinstance(sel, list):
                continue
            filtered[sec] = [items[i] for i in sel
                             if isinstance(i, int) and 0 <= i < len(items)]
        return filtered

    def review_cases(self, session_id, provider='deepseek', model=None, api_key=None, models=None):
        """对当前用例执行AI评审（结合需求分析点与用户原始输入）"""
        cases = self.state.get_cases(session_id)
        analysis = self.state.get_analysis(session_id) or {}
        review_skill = self.skills.get_review_skill()
        ai = self._processor(session_id, provider, model, api_key, models)
        review = Reviewer(ai, review_skill).review(cases, analysis=analysis, context=analysis.get('context'))
        self.state.set(session_id, 'review', review)
        return {'cases': cases, 'review': review, 'used_models': ai.used_models}

    def apply_edits(self, session_id, delete_indices=None, edits=None):
        """应用用户的删除与编辑操作"""
        cases = self.state.get_cases(session_id)
        if delete_indices:
            cases = self.filter_editor.delete(cases, delete_indices)
        if edits:
            for edit in edits:
                cases = self.filter_editor.edit(cases, edit['index'], edit.get('updates', {}))
        self.state.save_cases(session_id, cases)
        return cases

    def process_phase3_export(self, session_id, format_type, provider='deepseek',
                              model=None, api_key=None, models=None):
        """阶段三：导出用例（xmind 时结合 PRD 上下文用 AI 生成精炼标题）"""
        cases = self.state.get_cases(session_id)
        template = self.state.get(session_id, 'template')
        analysis = self.state.get_analysis(session_id) or {}
        ai = self._processor(session_id, provider, model, api_key, models)
        return self.export_engine.export(cases, template, format_type, session_id,
                                         analysis=analysis, ai=ai)

    def export_analysis(self, session_id, format_type):
        """导出需求评审内容（分析点 + 评审点）"""
        analysis = self.state.get_analysis(session_id)
        review = self.state.get(session_id, 'review')
        return self.export_engine.export_analysis(analysis, review, format_type, session_id)

    def export_manual(self, session_id, format_type, provider='deepseek', model=None, api_key=None,
                      models=None):
        """导出操作手册（word/html）；结合需求上下文用 AI 生成增强内容"""
        cases = self.state.get_cases(session_id)
        analysis = self.state.get_analysis(session_id)
        ai = self._processor(session_id, provider, model, api_key, models)
        return self.export_engine.export_manual(cases, analysis, format_type, session_id, ai=ai)

    def generate_filename(self, session_id, kind, provider='deepseek', model=None, api_key=None,
                          models=None):
        """AI 结合需求文档生成导出文件名（5-15 字），供导出响应返回给前端"""
        analysis = self.state.get_analysis(session_id) or {}
        ai = self._processor(session_id, provider, model, api_key, models)
        return FilenameGenerator(ai).generate(analysis, kind)

    def clear(self, session_id):
        self.state.clear(session_id)

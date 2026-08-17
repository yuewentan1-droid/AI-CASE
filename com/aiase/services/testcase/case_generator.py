"""用例生成器 - 基于分析结果与生成Skill（testcase-generator）生成测试用例"""
import json

from com.aiase.utils.format_converters import split_code_block, parse_json


class CaseGenerator:

    def __init__(self, ai_processor, skill_processor):
        self.ai = ai_processor
        self.skills = skill_processor

    def _build_prompt(self, analysis, template, skill):
        """生成Skill提供设计方法论与输入要求，但强制输出JSON数组以适配用例表格UI"""
        fields = template.get('fields', [])
        skill_prompt = ''
        if skill:
            skill_prompt = skill.get('prompt', '') or ''
        step_field = next((f for f in fields if '步骤' in f or 'step' in f.lower()), '测试步骤')
        result_field = next((f for f in fields if '结果' in f), '测试结果')
        return f'''{skill_prompt or '你是资深测试工程师，基于测试分析结果生成测试用例。'}

【输出要求】（最高优先级，覆盖上方所有输出格式描述）
基于上述需求与设计方法论，生成完整、高覆盖的测试用例。
必须输出【严格的JSON数组】，不要其他任何文字、不要markdown、不要代码块包裹。
数组每个元素是一个用例对象，对象字段必须严格为：{fields}
- 每个字段的值为字符串；
- 步骤/数据类字段用换行符分隔多条；
- 覆盖新增功能、异常流程、边界值、业务规则组合；
- 需求追溯字段标注对应需求点；
- 「{step_field}」与「{result_field}」的行数必须严格一致、一一对应：第 N 行步骤对应第 N 行结果（步骤1↔结果1、步骤2↔结果2…），不允许只写步骤、只写结果或行数不一致；
- 「{result_field}」直接写对应那条步骤的测试结果（该步骤应达成的验证结果），严禁出现「预期」「预期结果」「期望」等字眼。

【分析结果】
{json.dumps(analysis, ensure_ascii=False, default=str)}'''

    def generate(self, analysis, template, skill):
        """生成用例，返回用例列表"""
        prompt = self._build_prompt(analysis, template, skill)
        resp = self.ai.text(prompt, '请根据上述要求生成测试用例。')
        # 优先严格JSON数组解析，失败再拆多个代码块
        try:
            data = parse_json(resp)
            if isinstance(data, list):
                return data
        except (ValueError, TypeError):
            pass
        blocks = split_code_block(resp)
        if blocks:
            return blocks
        return []

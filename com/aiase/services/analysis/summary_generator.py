"""报告摘要生成"""
from com.aiase.utils.format_converters import parse_json


class SummaryGenerator:

    PROMPT = """你是资深测试专家。基于以下风险点、影响面、新增功能信息，生成测试报告摘要。
输出严格的JSON，不要其他文字，格式：
{
  "overview": "整体测试范围概述",
  "key_risks": "关键风险点说明",
  "recommendation": "测试策略建议",
  "focus_areas": ["重点测试区域1"]
}"""

    def __init__(self, ai_processor):
        self.ai = ai_processor

    def generate(self, risks, impact, prioritized):
        content = f"""
风险点：{risks}
影响面：{impact.get('impact_areas', [])}
新增功能：{impact.get('new_features', [])}
既有功能：{impact.get('existing_features', [])}
优先级排序：{prioritized}
"""
        resp = self.ai.text(self.PROMPT, content)
        return parse_json(resp)

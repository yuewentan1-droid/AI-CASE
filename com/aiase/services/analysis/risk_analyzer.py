"""风险预测分析"""
from com.aiase.utils.format_converters import parse_json


class RiskAnalyzer:

    PROMPT = """你是资深测试专家。基于以下需求/设计/测试资料，进行风险预测分析。
输出严格的JSON，不要其他文字，格式：
{
  "risks": [
    {"title": "风险标题", "level": "高/中/低", "desc": "风险描述", "advice": "应对建议"}
  ]
}"""

    def __init__(self, ai_processor):
        self.ai = ai_processor

    def analyze(self, parsed_data):
        content = f'需求与测试资料如下：\n{parsed_data}'
        resp = self.ai.text(self.PROMPT, content)
        data = parse_json(resp)
        return data.get('risks', [])

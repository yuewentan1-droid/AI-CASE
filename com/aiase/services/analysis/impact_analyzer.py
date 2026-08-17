"""影响面分析"""
from com.aiase.utils.format_converters import parse_json


class ImpactAnalyzer:

    PROMPT = """你是资深测试专家。基于以下需求/设计/测试资料，进行影响面分析。
需要区分本次新增功能与既有受影响功能。
输出严格的JSON，不要其他文字，格式：
{
  "impact_areas": [
    {"module": "影响模块", "level": "高/中/低", "reason": "影响原因"}
  ],
  "new_features": ["新增功能1", "新增功能2"],
  "existing_features": ["受影响既有功能1"]
}"""

    def __init__(self, ai_processor):
        self.ai = ai_processor

    def analyze(self, parsed_data):
        content = f'需求与测试资料如下：\n{parsed_data}'
        resp = self.ai.text(self.PROMPT, content)
        data = parse_json(resp)
        return {
            'impact_areas': data.get('impact_areas', []),
            'new_features': data.get('new_features', []),
            'existing_features': data.get('existing_features', []),
        }

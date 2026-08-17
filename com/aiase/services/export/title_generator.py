"""AI 依据 PRD 上下文为用例生成精炼测试标题

导出 .mm 等格式时，用 AI 结合需求文档上下文把每条用例的「测试标题」重写得
更贴合 PRD；AI 不可用/失败时回退到用例已有的「测试标题」，保证导出不被阻断。
"""
import json

from com.aiase.utils.format_converters import parse_json


class TitleGenerator:
    """基于需求上下文为用例列表生成精炼测试标题（按原顺序返回）"""

    def __init__(self, ai):
        self.ai = ai

    def _seed(self, analysis):
        """提取 PRD 上下文种子：优先完整 context，次取报告概述"""
        a = analysis or {}
        seed = a.get('context') or ''
        if not seed or not str(seed).strip():
            seed = (a.get('summary') or {}).get('overview', '')
        return str(seed).strip()[:1200]

    def _fallback(self, cases):
        """回退：直接使用各用例已有的测试标题"""
        return [str(c.get('测试标题', '') or '') for c in cases]

    def generate(self, cases, analysis):
        """返回与 cases 顺序一致的测试标题列表；失败时回退原文"""
        fallback = self._fallback(cases)
        seed = self._seed(analysis)
        if not seed:
            return fallback
        items = []
        for i, c in enumerate(cases, 1):
            items.append({'index': i,
                          'module': c.get('主模块', ''),
                          'sub': c.get('子模块1', ''),
                          'step': str(c.get('测试步骤', '') or '')[:200],
                          'result': str(c.get('测试结果', '') or '')[:200]})
        system_prompt = ('你是资深测试工程师。根据需求文档上下文，为每条测试用例提炼一个'
                         '简短、贴切、能概括该用例验证点的中文测试标题。')
        user_content = (f'需求上下文：{seed}\n\n'
                        f'用例列表（JSON）：{json.dumps(items, ensure_ascii=False)}\n\n'
                        f'请为每条用例按相同顺序给出一个精炼的测试标题，'
                        f'只输出【JSON数组】，元素为字符串，不要其它文字。')
        try:
            res = self.ai.text(system_prompt, user_content)
            data = parse_json(res)
            if isinstance(data, list):
                titles = [str(t or '').strip() for t in data]
                return [t or f for t, f in zip(titles, fallback)]
        except (ValueError, TypeError):
            pass
        return fallback

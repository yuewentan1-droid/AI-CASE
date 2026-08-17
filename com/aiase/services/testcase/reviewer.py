"""用例评审器 - AI自动评审用例质量（基于评审Skill + 需求分析 + 用户原始输入）"""
import json

from com.aiase.utils.format_converters import parse_json


class Reviewer:
    """依据评审Skill（testcase-review.md）核对用例对需求检查点的覆盖度并给出分数与结论"""

    # 兜底提示词：未加载到评审Skill时使用（与 skill 输出结构一致）
    FALLBACK_PROMPT = """你是资深测试评审专家。依据用户原始输入与需求分析结果，逐项核对测试用例的覆盖度并评分。
覆盖度 = 已覆盖检查点数 ÷ 总检查点数 × 100；综合得分 = 覆盖度（有明显缺陷的用例每个扣 2~5 分）。
结论档位：≥95分 优秀/无需重新生成(none)；85~94分 良好/建议重新生成(suggest)；<85分 不合格/必须重新生成(must)。
仅输出一个 JSON 对象（用 ```json 代码块包裹），格式：
{"overall_score":88,"comment":"总体意见","conclusion":"良好","needs_regeneration":"suggest",
 "coverage":{"total":20,"covered":18,"percent":90,"uncovered":[{"content":"未覆盖检查点","source":"PRD"}]},
 "issues":[{"case_index":0,"level":"高|中|低","problem":"问题","suggestion":"建议"}]}"""

    def __init__(self, ai_processor, skill_prompt=None):
        self.ai = ai_processor
        self.skill_prompt = skill_prompt

    def review(self, cases, analysis=None, context=None):
        """评审用例；analysis 为需求分析结果，context 为用户原始输入（文件/图片/补充/测试数据）"""
        skill = (self.skill_prompt or '').strip() or self.FALLBACK_PROMPT
        analysis_str = json.dumps(analysis or {}, ensure_ascii=False, default=str)
        cases_str = json.dumps(cases, ensure_ascii=False, default=str)
        content = (
            f'【需求分析结果】\n{analysis_str}\n\n'
            f'【用户原始输入】\n{context or "(无补充输入)"}\n\n'
            f'【测试用例】\n{cases_str}'
        )
        resp = self.ai.text(skill, content)
        data = parse_json(resp)
        if not isinstance(data, dict):
            data = {}
        score = self._to_score(data.get('overall_score'))
        conclusion, needs = self._decision(score)
        coverage = data.get('coverage') or {}
        review = {
            'issues': data.get('issues', []) if isinstance(data.get('issues'), list) else [],
            'overall_score': score,
            'comment': data.get('comment', ''),
            'conclusion': conclusion,
            'needs_regeneration': needs,
            'coverage': {
                'total': coverage.get('total'),
                'covered': coverage.get('covered'),
                'percent': coverage.get('percent'),
                'uncovered': coverage.get('uncovered', []) if isinstance(coverage.get('uncovered'), list) else [],
            },
        }
        return review

    def _to_score(self, value):
        """统一得分到 0~100 整数，解析失败回退 0"""
        try:
            return int(round(float(value)))
        except (TypeError, ValueError):
            return 0

    def _decision(self, score):
        """按 95/85 档位确定性判定结论与是否需要重新生成"""
        if score >= 95:
            return '优秀', 'none'
        if score >= 85:
            return '良好', 'suggest'
        return '不合格', 'must'

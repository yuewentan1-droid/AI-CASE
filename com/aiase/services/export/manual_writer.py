"""AI 增强操作手册 - 结合需求文档上下文生成通俗易懂、图文并茂的手册内容

- 结合 PRD/设计稿/所有用户输入（analysis['context']）；
- 为用例补充「优先级」（已有则保留，缺失则由 AI 判定，失败兜底为「中」）；
- 生成通俗易懂的整体概述、各模块使用说明与术语表；
- 携带业务流程图（mermaid），供 HTML 渲染「图文并茂」。

AI 不可用时不阻断：各生成项均有兜底，回退到原有概述/默认值。
"""
import re

from com.aiase.entity.template import resolve_fields

_PRIO = ('高', '中', '低')
_PRIO_ALIAS = {'高': '高', '中': '中', '低': '低', 'high': '高', 'medium': '中', 'low': '低', 'P0': '高', 'P1': '高', 'P2': '中', 'P3': '低'}


def _norm_prio(v):
    """把任意优先级表示规整为 高/中/低 之一；无法识别返回 None"""
    if not v:
        return None
    s = str(v).strip()
    if s in _PRIO:
        return s
    low = s.lower()
    if low in _PRIO_ALIAS:
        return _PRIO_ALIAS[low]
    if '高' in s or '紧急' in s or '严重' in s:
        return '高'
    if '低' in s or '轻微' in s:
        return '低'
    return '中'


class ManualWriter:
    """基于 AI 生成增强的操作手册结构化内容"""

    def __init__(self, ai):
        self.ai = ai

    @staticmethod
    def _ask(ai, system_prompt, user_content, fallback):
        try:
            res = ai.text(system_prompt, user_content)
            return (res or '').strip()
        except Exception:
            return fallback

    def ensure_priority(self, cases, context):
        """为缺优先级的用例补充优先级（AI 判定），失败兜底为「中」"""
        fields = resolve_fields(None)
        has_prio = '优先级' in fields
        needs = [c for c in cases
                 if has_prio and not (c.get('优先级') or '').strip()]
        # 若模板本就无「优先级」字段，也给每个用例补上（用户要求结合优先级）
        for c in cases:
            if not (c.get('优先级') or '').strip():
                if c not in needs:
                    needs.append(c)
        if not needs:
            return cases
        brief = '\n'.join(
            f"{i}. {c.get('测试标题', '')}" for i, c in enumerate(needs, 1))[:1500]
        seed = (context or '')[:600]
        prompt = (f'需求上下文：{seed}\n\n待判定优先级的用例：\n{brief}\n\n'
                  '请逐条给出优先级（高/中/低），每行格式：序号：高|中|低。只输出判定行，不要解释。')
        res = self._ask(self.ai, '你是用例优先级评定专家。', prompt, '')
        mapping = {}
        for line in (res or '').splitlines():
            m = re.match(r'^\s*(\d+)\s*[:：]?\s*(高|中|低)\s*$', line.strip())
            if m:
                mapping[int(m.group(1))] = m.group(2)
        for i, c in enumerate(needs, 1):
            c['优先级'] = mapping.get(i, '中')
        return cases

    def _rewrite_overview(self, context, overview):
        sys = '你是产品文档撰写专家。请用通俗易懂的语言改写操作手册的概述。'
        user = (f'需求上下文：{context[:1500]}\n\n原始概述：{overview or "无"}\n\n'
                '请用 3-5 句话，向非技术用户通俗解释这是什么系统、能做什么、怎么用。')
        return self._ask(self.ai, sys, user, overview)

    def _glossary(self, context):
        sys = '你是产品文档撰写专家。请提炼本系统最重要的业务术语并通俗解释。'
        user = (f'需求上下文：{context[:1500]}\n\n'
                '请列出 5-8 个关键术语，每行一个，格式：术语：通俗解释。只输出术语行。')
        res = self._ask(self.ai, sys, user, '')
        items = []
        for line in (res or '').splitlines():
            if '：' in line or ':' in line:
                term, _, desc = line.partition('：') if '：' in line else line.partition(':')
                term, desc = term.strip(), desc.strip()
                if term:
                    items.append({'term': term, 'desc': desc or term})
        return items

    def _module_intros(self, modules, context):
        """为各模块生成通俗易懂的使用说明"""
        brief = '\n'.join(f'{i}. {name}：{len(cs)} 条用例' for i, (name, cs) in enumerate(modules, 1))
        seed = (context or '')[:1500]
        sys = '你是产品文档撰写专家。请为系统各功能模块写通俗易懂的使用说明。'
        user = (f'需求上下文：{seed}\n\n模块列表：\n{brief}\n\n'
                '请为每个模块写一段说明，说明该模块是干什么的、用户怎么操作。'
                '每段格式：模块名：说明。用「；」分隔不同模块。只输出说明段。')
        res = self._ask(self.ai, sys, user, '')
        intro = {}
        if res:
            for seg in res.split('；'):
                for sep in ('：', ':'):
                    if sep in seg:
                        name, _, desc = seg.partition(sep)
                        name = name.strip()
                        if name:
                            intro[name] = desc.strip()
                        break
        return intro

    def build(self, cases, analysis, title):
        """组装增强后的手册结构化内容"""
        context = (analysis or {}).get('context') or ''
        overview = (analysis or {}).get('summary', {}).get('overview', '')
        cases = self.ensure_priority(cases, context)
        mods = {}
        for c in cases:
            mods.setdefault(c.get('主模块', '其他'), []).append(c)
        modules = list(mods.items())
        intros = self._module_intros(modules, context)
        return {
            'title': title,
            'overview': self._rewrite_overview(context, overview),
            'glossary': self._glossary(context),
            'flowchart': (analysis or {}).get('flowchart', ''),
            'sections': [
                {'name': name, 'intro': intros.get(name, ''), 'cases': cs}
                for name, cs in modules
            ],
        }

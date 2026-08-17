""".mm 思维导图导出（FreeMind格式）

每个用例为一个用例节点：标题 + 按序号一一配对的步骤/结果。
「测试步骤」与「测试结果」经 align_cases 对齐为等长、同序号的行，导出时步骤 N 下
直接挂对应序号的结果 N（缺失的结果用占位符补齐），保证步骤↔结果一一对应。
导出时若提供 AI，则依据 PRD 上下文为用例重新生成精炼的测试标题。
"""
import xml.sax.saxutils as sax

from com.aiase.entity.template import resolve_fields
from com.aiase.services.export.base_exporter import BaseExporter
from com.aiase.services.export.title_generator import TitleGenerator


def _esc(text):
    return sax.escape(str(text or ''))


def _split_rows(value):
    """按换行拆分为行，保留空位置（不丢弃），以便与另一字段按序号配对"""
    return [ln.strip() for ln in str(value or '').split('\n')]


def _case_node(title, steps_val, results_val):
    """用例节点：标题下按序号挂 步骤N → 结果N 的配对子节点（步骤结果本就一一对应）"""
    steps = _split_rows(steps_val)
    results = _split_rows(results_val)
    n = max(len(steps), len(results))
    out = [f'<node TEXT="{_esc(title)}">']
    for i in range(n):
        step = steps[i] if i < len(steps) and steps[i] else f'步骤{i + 1}'
        out.append(f'<node TEXT="{_esc(step)}">')
        if i < len(results) and results[i]:
            out.append(f'<node TEXT="{_esc(results[i])}"/>')
        out.append('</node>')
    out.append('</node>')
    return '\n'.join(out)


class XMindExporter(BaseExporter):

    def export(self, cases, template, path, analysis=None, ai=None):
        fields = resolve_fields(template)
        # 按 主模块/子模块1/子模块2 分层，用例为叶子（标题 + 独立步骤/结果子节点）
        mod_field = fields[0]
        sub1 = fields[1] if len(fields) > 1 else None
        sub2 = fields[2] if len(fields) > 2 else None

        # 有 AI 时依据 PRD 上下文为用例生成精炼标题；无 AI 沿用原「测试标题」
        titles = TitleGenerator(ai).generate(cases, analysis) if ai is not None \
            else [str(c.get('测试标题', '') or '') for c in cases]

        tree = {}
        for i, c in enumerate(cases):
            mod = c.get(mod_field, '未分类')
            s1 = c.get(sub1, '') if sub1 else ''
            s2 = c.get(sub2, '') if sub2 else ''
            tree.setdefault(mod, {}).setdefault(s1, {}).setdefault(s2, []).append((c, titles[i]))

        out = ['<?xml version="1.0" encoding="UTF-8"?>', '<map version="1.0.1">']
        for mod, s1s in tree.items():
            out.append(f'<node TEXT="{_esc(mod)}">')
            for s1, s2s in s1s.items():
                if s1:
                    out.append(f'<node TEXT="{_esc(s1)}">')
                for s2, items in s2s.items():
                    if s2:
                        out.append(f'<node TEXT="{_esc(s2)}">')
                    for c, title in items:
                        out.append(_case_node(title, c.get('测试步骤', ''),
                                              c.get('测试结果', '')))
                    if s2:
                        out.append('</node>')
                if s1:
                    out.append('</node>')
            out.append('</node>')
        out.append('</map>')
        with open(path, 'w', encoding='utf-8') as f:
            f.write('\n'.join(out))
        return path

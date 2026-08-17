"""导出前字段对齐 - 保证「测试步骤」与「测试结果」序号一一对应

AI 生成的步骤/结果字段内部用换行分隔多条，可能出现行数不一致或未编号，
导致导出的用例中步骤与结果无法对应。此模块在导出前统一拆分、重新编号并对齐行数，
使每一条步骤都有唯一序号的结果与之对应。
"""
import re

from com.aiase.entity.template import resolve_fields

_STEP_FIELD = '测试步骤'
_RESULT_FIELD = '测试结果'
_NUM_PREFIX = re.compile(r'^\s*\d+[.、．)）·\-]\s*')


def _split(value):
    """按换行拆分为非空行"""
    return [ln.strip() for ln in _String(value).splitlines() if ln.strip()]


def _renumber(lines):
    """去掉原有行首序号后重新编号，保证序号连续唯一"""
    cleaned = [_NUM_PREFIX.sub('', ln).strip() for ln in lines]
    return [f'{i + 1}. {ln}' if ln else '' for i, ln in enumerate(cleaned)]


def _String(v):
    return v if isinstance(v, str) else str(v or '')


def align_cases(cases, template):
    """对齐每个用例的步骤/结果字段，返回处理后的用例列表（原地修改）"""
    fields = resolve_fields(template)
    if not isinstance(fields, (list, tuple)):
        return cases
    has_step = _STEP_FIELD in fields
    has_result = _RESULT_FIELD in fields
    if not has_step and not has_result:
        return cases
    for c in cases:
        if not isinstance(c, dict):
            continue
        steps = _split(c.get(_STEP_FIELD, '')) if has_step else []
        results = _split(c.get(_RESULT_FIELD, '')) if has_result else []
        n = max(len(steps), len(results))
        if not n:
            continue
        # 行数对齐：不足补空，保证每行步骤都有对应序号的结果
        steps = (steps + [''] * n)[:n]
        results = (results + [''] * n)[:n]
        if has_step:
            c[_STEP_FIELD] = '\n'.join(_renumber(steps))
        if has_result:
            c[_RESULT_FIELD] = '\n'.join(_renumber(results))
    return cases

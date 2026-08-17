"""数据验证工具"""
from com.aiase.config.settings import Config


def is_supported_file(filename):
    return Config.classify_file(filename) != 'unknown'


def validate_apikey(keys):
    """校验API Key表单数据，仅保留非空"""
    return {k: v.strip() for k, v in keys.items() if v and v.strip()}


def validate_cases(cases):
    """校验用例数据，确保为列表且包含标题字段"""
    if not isinstance(cases, list):
        return []
    result = []
    for c in cases:
        if not isinstance(c, dict):
            continue
        if not c.get('测试标题') and not c.get('title'):
            continue
        result.append(c)
    return result

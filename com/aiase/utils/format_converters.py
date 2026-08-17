"""格式转换工具"""
import json


def to_json(obj, indent=2):
    return json.dumps(obj, ensure_ascii=False, indent=indent)


def parse_json(text):
    """从AI输出文本中解析JSON，兼容包裹代码块的情况"""
    text = text.strip()
    if text.startswith('```'):
        text = text.strip('`')
        if text.startswith('json'):
            text = text[4:].strip()
    return json.loads(text)


def split_code_block(text):
    """拆分AI返回的多个JSON代码块"""
    import re
    blocks = re.findall(r'```json\s*(.*?)```', text, re.S)
    if not blocks:
        blocks = re.findall(r'\{.*?\}', text, re.S)
    result = []
    for b in blocks:
        try:
            result.append(json.loads(b.strip()))
        except json.JSONDecodeError:
            continue
    return result

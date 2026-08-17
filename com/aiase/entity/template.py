"""实体层 - 用例模板数据形状"""
from dataclasses import dataclass, field

DEFAULT_FIELDS = ['主模块', '子模块1', '子模块2', '测试标题', '测试步骤', '测试结果']


def resolve_fields(template):
    """从模板解析字段名列表"""
    if isinstance(template, dict):
        return template.get('fields') or DEFAULT_FIELDS
    if isinstance(template, list):
        return template
    return DEFAULT_FIELDS


@dataclass
class Template:
    name: str
    fields: list = field(default_factory=lambda: list(DEFAULT_FIELDS))

"""模板管理器 - 支持系统内置与用户自定义用例模板"""
from com.aiase.config.settings import Config
from com.aiase.entity.template import resolve_fields


class TemplateManager:
    """用例模板管理：内置模板优先，支持用户自定义字段"""

    def __init__(self):
        self.builtin = Config.DEFAULT_TEMPLATE

    def resolve(self, custom_template=None):
        """获取最终模板：用户自定义覆盖内置"""
        if custom_template:
            if isinstance(custom_template, str):
                # 支持逗号分隔字段定义
                return {'name': '自定义模板', 'fields': [f.strip() for f in custom_template.split(',') if f.strip()]}
            if isinstance(custom_template, list):
                return {'name': '自定义模板', 'fields': custom_template}
            if isinstance(custom_template, dict) and custom_template.get('fields'):
                return custom_template
        return self.builtin

    def fields(self, template=None):
        return resolve_fields(template)

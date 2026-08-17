"""TXT导出"""
from com.aiase.entity.template import resolve_fields
from com.aiase.services.export.base_exporter import BaseExporter


class TxtExporter(BaseExporter):

    def export(self, cases, template, path):
        fields = resolve_fields(template)
        lines = [f'测试用例列表 (共{len(cases)}条)', '=' * 40]
        for i, c in enumerate(cases, 1):
            lines.append(f'\n[用例{i}]')
            for f in fields:
                lines.append(f'{f}: {c.get(f, "")}')
        with open(path, 'w', encoding='utf-8') as f:
            f.write('\n'.join(lines))
        return path

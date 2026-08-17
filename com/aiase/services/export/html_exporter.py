"""HTML导出"""
import html as html_mod

from com.aiase.entity.template import resolve_fields
from com.aiase.services.export.base_exporter import BaseExporter


def _cell(value):
    """转义后把换行转成 <br>，保证步骤/结果逐行显示，一一对应"""
    text = str(value if value is not None else '')
    return html_mod.escape(text).replace('\n', '<br>')


class HTMLExporter(BaseExporter):

    def export(self, cases, template, path):
        fields = resolve_fields(template)
        rows = []
        for c in cases:
            tds = ''.join(f'<td>{_cell(c.get(f))}</td>' for f in fields)
            rows.append(f'<tr>{tds}</tr>')
        thead = ''.join(f'<th>{f}</th>' for f in fields)
        html = f'''<!DOCTYPE html>
<html lang="zh"><head><meta charset="utf-8"><title>测试用例</title>
<style>
body{{font-family:Microsoft YaHei;margin:20px;}}
table{{border-collapse:collapse;width:100%;}}
th,td{{border:1px solid #ccc;padding:8px;text-align:left;font-size:14px;}}
th{{background:#f0f0f0;}}
</style></head>
<body><h2>测试用例列表 ({len(cases)}条)</h2>
<table><thead><tr>{thead}</tr></thead><tbody>{''.join(rows)}</tbody></table>
</body></html>'''
        with open(path, 'w', encoding='utf-8') as f:
            f.write(html)
        return path

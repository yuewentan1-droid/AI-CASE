"""JSON导出"""
import json

from com.aiase.services.export.base_exporter import BaseExporter


class JsonExporter(BaseExporter):

    def export(self, cases, template, path):
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(cases, f, ensure_ascii=False, indent=2)
        return path

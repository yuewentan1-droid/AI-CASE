""".mm 思维导图处理（FreeMind XML格式）；.xmind 先转换为 .mm 再解析"""
import os
import xml.etree.ElementTree as ET

from com.aiase.services.input.base_handler import BaseHandler
from com.aiase.services.input.xmind_converter import xmind_to_mm
from com.aiase.utils.file_utils import read_text_file


class XMindHandler(BaseHandler):
    """解析 FreeMind .mm 文件，按节点层级输出为缩进文本；.xmind 先转 .mm"""

    def _walk(self, node, depth, lines):
        text = node.get('TEXT', '')
        if text:
            lines.append('  ' * depth + '- ' + text)
        for child in node.findall('node'):
            self._walk(child, depth + 1, lines)

    def parse(self, file_path):
        if os.path.splitext(file_path)[1].lower() == '.xmind':
            # .xmind 为 ZIP 容器，先按 Skill 规则转成 FreeMind .mm XML，再按节点层级解析
            content = xmind_to_mm(file_path)
        else:
            content = read_text_file(file_path)
        root = ET.fromstring(content)
        lines = []
        for node in root.findall('node'):
            self._walk(node, 0, lines)
        return '\n'.join(lines)

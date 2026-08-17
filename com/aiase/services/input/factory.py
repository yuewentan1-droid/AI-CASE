"""处理器工厂 - 根据文件类型自动分发"""
import os

from com.aiase.config.settings import Config
from com.aiase.services.input.text_handler import TextHandler, WordHandler
from com.aiase.services.input.excel_handler import ExcelHandler
from com.aiase.services.input.xmind_handler import XMindHandler
from com.aiase.services.input.json_handler import JsonHandler
from com.aiase.services.input.image_handler import ImageHandler
from com.aiase.services.input.code_handler import CodeHandler


def get_handler(file_path):
    ext = os.path.splitext(file_path)[1].lower()
    category = Config.classify_file(file_path)
    if category == 'image':
        return ImageHandler()
    if category == 'document':
        return WordHandler()
    if category == 'spreadsheet':
        return ExcelHandler()
    if category == 'mindmap':
        return XMindHandler()
    if category == 'json':
        return JsonHandler()
    if category == 'code':
        return CodeHandler()
    if category == 'text':
        return TextHandler()
    raise ValueError(f'不支持的文件类型: {ext}')


def parse_file(file_path):
    """解析单个文件，返回 (category, content)"""
    category = Config.classify_file(file_path)
    handler = get_handler(file_path)
    content = handler.parse(file_path)
    return category, content

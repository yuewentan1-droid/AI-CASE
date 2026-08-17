"""json处理"""
import json

from com.aiase.services.input.base_handler import BaseHandler
from com.aiase.utils.file_utils import read_text_file


class JsonHandler(BaseHandler):
    """处理 .json 文件，格式化输出"""

    def parse(self, file_path):
        data = json.loads(read_text_file(file_path))
        return json.dumps(data, ensure_ascii=False, indent=2)

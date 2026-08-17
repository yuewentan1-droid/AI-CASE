"""代码文件处理"""
import os

from com.aiase.services.input.base_handler import BaseHandler
from com.aiase.utils.file_utils import read_text_file


class CodeHandler(BaseHandler):
    """读取代码文件，附文件名与扩展名信息"""

    def parse(self, file_path):
        code = read_text_file(file_path)
        fname = os.path.basename(file_path)
        ext = os.path.splitext(fname)[1].lstrip('.')
        return f'## 文件: {fname} (语言: {ext})\n```{ext}\n{code}\n```'

"""图片处理（多模态）"""
import base64
import os

from com.aiase.services.input.base_handler import BaseHandler


class ImageHandler(BaseHandler):
    """读取图片并转为base64，供视觉模型识别"""

    def parse(self, file_path):
        with open(file_path, 'rb') as f:
            return base64.b64encode(f.read()).decode('utf-8')

    @staticmethod
    def to_data_url(file_path):
        ext = os.path.splitext(file_path)[1].lower().lstrip('.')
        mime = {
            'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
            'gif': 'image/gif', 'bmp': 'image/bmp', 'webp': 'image/webp',
        }.get(ext, 'image/png')
        data = ImageHandler().parse(file_path)
        return f'data:{mime};base64,{data}'

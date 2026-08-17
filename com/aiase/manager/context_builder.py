"""上下文构建器 - 汇总多模态输入为统一文本，供AI分析"""
import os

from com.aiase.config.settings import Config
from com.aiase.utils.file_utils import truncate
from com.aiase.services.input.image_handler import ImageHandler
from com.aiase.services.input.factory import parse_file


class ContextBuilder:
    """将用户输入的文档/图片/代码等构建为结构化上下文"""

    def __init__(self, ai_processor):
        self.ai = ai_processor

    def build_text(self, file_paths, user_input='', test_data=''):
        """构建纯文本上下文（文档/代码部分），并收集每文件解析内容到 self.files"""
        parts = []
        if user_input.strip():
            parts.append(f'【用户自定义输入】\n{user_input}')
        if test_data.strip():
            parts.append(f'【测试数据】\n{test_data}')
        for fp in file_paths:
            category = Config.classify_file(fp)
            if category == 'image':
                continue  # 图片走视觉识别
            _, content = parse_file(fp)
            self.files.append({'name': os.path.basename(fp), 'category': category, 'content': content})
            parts.append(f'【文件:{os.path.basename(fp)}】\n{content}')
        return '\n\n'.join(parts)

    def build_with_images(self, file_paths, user_input='', test_data=''):
        """构建包含视觉识别的完整上下文"""
        text_ctx = self.build_text(file_paths, user_input, test_data)
        vision_parts = []
        for fp in file_paths:
            if Config.classify_file(fp) == 'image':
                data_url = ImageHandler.to_data_url(fp)
                desc = self.ai.vision(
                    '你是视觉识别专家，请详细描述图片中的文字、界面元素与业务逻辑。',
                    data_url,
                    '请识别该图片内容并输出结构化描述。',
                )
                self.files.append({'name': os.path.basename(fp), 'category': 'image', 'content': desc})
                vision_parts.append(f'【图片:{os.path.basename(fp)}】\n{desc}')
        full = text_ctx
        if vision_parts:
            full += '\n\n' + '\n\n'.join(vision_parts)
        return truncate(full)

    def build(self, file_paths, user_input='', test_data=''):
        """统一构建上下文"""
        self.files = []
        return self.build_with_images(file_paths, user_input, test_data)

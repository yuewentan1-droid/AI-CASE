"""千问官方API（阿里云百炼 DashScope）"""
from com.aiase.services.ai.base_ai_service import BaseAIService
from com.aiase.config.settings import Config


class QianwenService(BaseAIService):
    """千问 视觉/编程模型"""

    provider = 'qianwen'

    def text(self, system_prompt, user_content, cancel_check=None):
        messages = [
            {'role': 'system', 'content': system_prompt},
            {'role': 'user', 'content': user_content},
        ]
        return self.chat(messages, cancel_check=cancel_check)

    def vision(self, system_prompt, image_data_url, user_content, cancel_check=None):
        self.model = Config.VISION_MODELS['qianwen']
        messages = [
            {'role': 'system', 'content': system_prompt},
            {
                'role': 'user',
                'content': [
                    {'type': 'image_url', 'image_url': {'url': image_data_url}},
                    {'type': 'text', 'text': user_content},
                ],
            },
        ]
        return self.chat(messages, cancel_check=cancel_check)

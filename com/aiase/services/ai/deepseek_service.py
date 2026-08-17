"""DeepSeek官方API"""
from com.aiase.services.ai.base_ai_service import BaseAIService


class DeepSeekService(BaseAIService):
    """DeepSeek 文本/编程模型"""

    provider = 'deepseek'

    def text(self, system_prompt, user_content, cancel_check=None):
        messages = [
            {'role': 'system', 'content': system_prompt},
            {'role': 'user', 'content': user_content},
        ]
        return self.chat(messages, cancel_check=cancel_check)

    def vision(self, system_prompt, image_data_url, user_content, cancel_check=None):
        # DeepSeek 无视觉模型，返回空（由多模态处理器跳过）
        return None

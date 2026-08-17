"""AI服务基类"""
from abc import ABC, abstractmethod

from com.aiase.config.settings import Config
from com.aiase.storage.factory import resolve_apikey
from com.aiase.utils import job_control


class BaseAIService(ABC):
    """AI服务基类，基于OpenAI SDK兼容接口，支持文本/视觉/编程模型"""

    provider = ''

    def __init__(self, api_key=None, model=None):
        from openai import OpenAI
        self.api_key = api_key or resolve_apikey(self.provider)
        self.base_url = Config.AI_MODELS[self.provider]['base_url']
        self.model = model or Config.TEXT_MODEL_DEFAULT
        self.client = OpenAI(api_key=self.api_key, base_url=self.base_url)

    def chat(self, messages, temperature=0.4, cancel_check=None):
        """通用对话调用。

        cancel_check 为可选的可调用对象（返回 True 表示已请求取消）：
        传入时以流式拉取并在每个分块前检测，一旦取消立即中断并抛出 CancelledError，
        用于「停止生成/停止分析」真正中止后端仍在进行的 AI 调用；不传则保持原有非流式行为。
        """
        if cancel_check is None:
            resp = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=temperature,
            )
            return resp.choices[0].message.content
        parts = []
        stream = self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=temperature,
            stream=True,
        )
        for chunk in stream:
            if cancel_check():
                raise job_control.CancelledError('任务已取消')
            choices = getattr(chunk, 'choices', None)
            if choices:
                text = getattr(choices[0].delta, 'content', None)
                if text:
                    parts.append(text)
        return ''.join(parts)

    @abstractmethod
    def text(self, system_prompt, user_content):
        """文本任务"""
        pass

    @abstractmethod
    def vision(self, system_prompt, image_data_url, user_content):
        """视觉识别任务"""
        pass

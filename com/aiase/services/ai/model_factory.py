"""模型工厂 - 支持切换提供商与模型"""
from com.aiase.config.settings import Config
from com.aiase.services.ai.deepseek_service import DeepSeekService
from com.aiase.services.ai.doubao_service import DoubaoService
from com.aiase.services.ai.qianwen_service import QianwenService

_SERVICES = {
    'deepseek': DeepSeekService,
    'doubao': DoubaoService,
    'qianwen': QianwenService,
}


class ModelFactory:

    @staticmethod
    def providers():
        """可用提供商列表"""
        return list(Config.AI_MODELS.keys())

    @staticmethod
    def models_of(provider):
        """某提供商可用模型列表"""
        return Config.AI_MODELS[provider]['models']

    @staticmethod
    def create(provider, model=None, api_key=None):
        """创建AI服务实例，api_key为None时自动从配置/环境读取"""
        cls = _SERVICES[provider]
        service = cls(api_key=api_key, model=model)
        return service

    @staticmethod
    def get_vision_providers():
        """支持视觉的提供商（DeepSeek无视觉）"""
        return list(Config.VISION_MODELS.keys())

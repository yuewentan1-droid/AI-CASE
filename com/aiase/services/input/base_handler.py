"""输入处理器基类"""
from abc import ABC, abstractmethod


class BaseHandler(ABC):
    """输入处理器基类，所有处理器实现 parse 方法返回结构化文本"""

    @abstractmethod
    def parse(self, file_path):
        """解析文件为结构化文本内容"""
        pass

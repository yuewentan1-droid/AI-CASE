"""导出基类"""
from abc import ABC, abstractmethod


class BaseExporter(ABC):

    @abstractmethod
    def export(self, cases, template):
        """将用例导出为文件，返回文件路径"""
        pass

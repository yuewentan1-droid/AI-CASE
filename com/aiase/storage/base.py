"""存储抽象基类 - 为后续接入 MySQL 等数据库预留统一接口"""
from abc import ABC, abstractmethod


class BaseStorage(ABC):
    """持久化存储统一契约：Skill、测试数据、API Key"""

    @abstractmethod
    def save_skill(self, name, skill_data):
        """保存用户Skill"""

    @abstractmethod
    def list_skills(self):
        """列出用户Skill名称"""

    @abstractmethod
    def save_testdata(self, name, data):
        """保存测试数据"""

    @abstractmethod
    def list_testdata(self):
        """列出测试数据文件"""

    @abstractmethod
    def save_apikeys(self, keys):
        """保存API Key"""

    @abstractmethod
    def load_apikeys(self):
        """加载API Key"""

    @abstractmethod
    def resolve_apikey(self, provider):
        """解析指定提供商API Key：优先用户保存，其次环境变量"""

    @abstractmethod
    def delete_apikeys(self, values):
        """删除与给定任一值相同的API Key（级联：其它模型共用同一 key 时一并删除）
        返回被删除的 {模型名: key值} 映射"""

    @abstractmethod
    def upload_dir(self, session_id):
        """会话上传目录绝对路径"""

    @abstractmethod
    def save_uploads(self, session_id, files):
        """保存上传文件列表，返回绝对路径列表"""

    @abstractmethod
    def save_upload_text(self, session_id, filename, content):
        """保存上传文本，返回绝对路径"""

    @abstractmethod
    def list_uploads(self, session_id):
        """列出会话上传文件，返回 [{name, size, mtime, path}]"""

    @abstractmethod
    def delete_uploads(self, session_id, names):
        """删除会话上传文件，返回实际删除的 name 列表"""

    @abstractmethod
    def resolve_upload_path(self, session_id, name):
        """拼接会话上传目录下的绝对路径（供内容读取 / 打开目录）"""

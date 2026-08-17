"""MySQL 存储实现 - 扩展入口（占位骨架）

后续接入步骤：
1. 引入 SQLAlchemy / mysql-connector 建立连接池，字段映射见 Config.DB_CONFIG；
2. 将 BaseStorage 各抽象方法实现为对应 SQL 持久化；
3. 将 Config.DB_CONFIG['backend'] 设为 'mysql'，
   由 factory.create_storage() 自动切换到本实现，无需改动业务层。
"""
from com.aiase.storage.base import BaseStorage


class MySQLStorage(BaseStorage):
    """MySQL 持久化实现（待接入，先提供统一接口占位）"""

    def __init__(self, db_config):
        self.db_config = db_config

    def save_skill(self, name, skill_data):
        raise NotImplementedError

    def list_skills(self):
        raise NotImplementedError

    def save_testdata(self, name, data):
        raise NotImplementedError

    def list_testdata(self):
        raise NotImplementedError

    def save_apikeys(self, keys):
        raise NotImplementedError

    def load_apikeys(self):
        raise NotImplementedError

    def resolve_apikey(self, provider):
        raise NotImplementedError

    def delete_apikeys(self, values):
        raise NotImplementedError

    def upload_dir(self, session_id):
        raise NotImplementedError

    def save_uploads(self, session_id, files):
        raise NotImplementedError

    def save_upload_text(self, session_id, filename, content):
        raise NotImplementedError

    def list_uploads(self, session_id):
        raise NotImplementedError

    def delete_uploads(self, session_id, names):
        raise NotImplementedError

    def resolve_upload_path(self, session_id, name):
        raise NotImplementedError

"""存储工厂 - 按配置选择存储后端，MySQL 为预留扩展"""
from com.aiase.config.settings import Config


def create_storage():
    """根据 Config.DB_CONFIG['backend'] 选择存储实现"""
    backend = Config.DB_CONFIG.get('backend', 'local')
    if backend == 'mysql':
        from com.aiase.storage.mysql_storage import MySQLStorage
        return MySQLStorage(Config.DB_CONFIG)
    from com.aiase.storage.local_storage import LocalStorage
    return LocalStorage()


def resolve_apikey(provider):
    """解析API Key：优先用户保存的，其次环境变量"""
    return create_storage().resolve_apikey(provider)

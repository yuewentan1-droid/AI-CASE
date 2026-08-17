"""会话状态管理 - 用例与分析结果仅临时存储在内存"""
from com.aiase.storage.session_storage import SessionStorage


class StateManager:
    """管理单个会话在三个阶段中的临时状态"""

    def __init__(self):
        self.store = SessionStorage()

    def set(self, session_id, key, value):
        self.store.set(session_id, key, value)

    def get(self, session_id, key, default=None):
        return self.store.get(session_id, key, default)

    def save_analysis(self, session_id, analysis):
        self.set(session_id, 'analysis', analysis)

    def get_analysis(self, session_id):
        return self.get(session_id, 'analysis', {})

    def save_cases(self, session_id, cases):
        self.set(session_id, 'cases', cases)

    def get_cases(self, session_id):
        return self.get(session_id, 'cases', [])

    def clear(self, session_id):
        self.store.clear(session_id)

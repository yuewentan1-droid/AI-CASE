"""会话临时存储 - 用例与分析结果仅存活于内存，不落盘"""
import time
import threading


class SessionStorage:
    """内存会话存储，用例不保存到磁盘。

    会话数据放在类级共享存储上（单进程 Flask 应用）：
    三阶段分别由新创建的 Orchestrator 处理，若每个实例各自持有独立 dict，
    则「分析」保存的 results 在「生成」「导出」时读不到，导致导出内容为空。
    用类级共享，使同一进程内跨请求都能读到同一会话状态。
    """

    # 类级共享：所有 SessionStorage 实例共用同一份会话数据与锁
    _data = {}
    _lock = threading.Lock()

    def __init__(self, ttl=3600):
        self._ttl = ttl

    def set(self, session_id, key, value):
        with self._lock:
            self._data.setdefault(session_id, {})[key] = {'value': value, 'ts': time.time()}

    def get(self, session_id, key, default=None):
        with self._lock:
            entry = self._data.get(session_id, {}).get(key)
            if entry is None:
                return default
            if time.time() - entry['ts'] > self._ttl:
                self._data.get(session_id, {}).pop(key, None)
                return default
            return entry['value']

    def clear(self, session_id):
        with self._lock:
            self._data.pop(session_id, None)

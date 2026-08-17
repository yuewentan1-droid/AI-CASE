"""任务取消控制 - 支持按会话标记/查询取消，供停止分析/生成使用"""
import threading


class CancelledError(Exception):
    """任务被用户取消"""


_lock = threading.Lock()
_cancel = {}  # session_id -> bool（True 表示已请求取消）


def register(session_id):
    """开始任务时注册（重置取消标记）"""
    with _lock:
        _cancel[session_id] = False


def request_cancel(session_id):
    """请求取消该会话任务"""
    with _lock:
        _cancel[session_id] = True


def is_cancelled(session_id):
    """是否已请求取消"""
    with _lock:
        return _cancel.get(session_id, False)


def check_cancel(session_id):
    """若已请求取消则抛出 CancelledError，供阶段间检查"""
    if is_cancelled(session_id):
        raise CancelledError('任务已取消')


def clear(session_id):
    """任务结束清理"""
    with _lock:
        _cancel.pop(session_id, None)

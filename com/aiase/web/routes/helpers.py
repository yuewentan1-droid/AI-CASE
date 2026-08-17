"""路由辅助 - 从请求中提取AI参数、会话与保存上传文件"""
import json
import os

from flask import request

from com.aiase.storage.factory import create_storage
from com.aiase.utils.file_utils import gen_session_id


def upload_dir(session_id):
    """持久化上传目录：data/uploads/{session}"""
    return create_storage().upload_dir(session_id)


def save_upload_files(files, session_id):
    """持久化保存上传文件（图片与其它格式）到 data/uploads/{session}，返回文件绝对路径列表"""
    return create_storage().save_uploads(session_id, files)


def restore_files(session_id, filenames_str):
    """根据持久化目录与文件名恢复已上传文件路径"""
    if not filenames_str:
        return []
    storage = create_storage()
    paths = []
    for name in filenames_str.split(','):
        name = name.strip()
        if name:
            p = storage.resolve_upload_path(session_id, name)
            if os.path.exists(p):
                paths.append(p)
    return paths


def ai_params(form):
    """从表单提取 provider/model/api_key，及前端传来的模型池（每个模型各自独立 key，用于随机兜底）"""
    models = form.get('models') or '[]'
    try:
        models = json.loads(models)
    except (ValueError, TypeError):
        models = []
    return {
        'provider': form.get('provider', 'deepseek'),
        'model': form.get('model') or None,
        'api_key': form.get('api_key') or None,
        'models': models,
    }


def get_session():
    """获取或创建会话ID（兼容 form/query/JSON 三种传参，确保「停止」能定位到同一会话）"""
    session_id = request.form.get('session_id') or request.args.get('session_id')
    if not session_id:
        data = request.get_json(silent=True) or {}
        session_id = data.get('session_id') or ''
    if not session_id:
        session_id = gen_session_id()
    return session_id

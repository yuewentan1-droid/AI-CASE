"""文件上传路由 - 上传即持久化到本地 data/uploads/{session}，便于后续 AI 综合分析"""
import mimetypes
import io
import os
import subprocess
import sys

from flask import Blueprint, request, jsonify, send_file, abort

from com.aiase.storage.factory import create_storage
from com.aiase.utils.file_utils import gen_session_id
from com.aiase.utils.validators import is_supported_file
from com.aiase.web.routes.helpers import get_session, save_upload_files, upload_dir

bp = Blueprint('upload', __name__, url_prefix='/api/upload')


@bp.route('/', methods=['POST'])
def upload_files():
    session_id = get_session()
    files = request.files.getlist('files')
    supported = [f for f in files if is_supported_file(f.filename)]
    unsupported = [f.filename for f in files if not is_supported_file(f.filename)]
    saved = [os.path.basename(p) for p in save_upload_files(supported, session_id)]
    return jsonify({
        'session_id': session_id,
        'saved': saved,
        'unsupported': unsupported,
        'count': len(saved),
        'path': upload_dir(session_id),
    })


@bp.route('/text', methods=['POST'])
def save_text():
    """补充分析 / 测试数据：持久化为 txt 文件到 data/uploads/{session}，返回路径与文件名"""
    data = request.get_json() or {}
    session_id = data.get('session_id') or gen_session_id()
    filename = data.get('filename') or 'input'
    content = data.get('content', '')
    path = create_storage().save_upload_text(session_id, filename, content)
    return jsonify({'success': True, 'session_id': session_id, 'path': path,
                    'filename': os.path.basename(path)})


@bp.route('/list', methods=['GET'])
def list_uploads():
    """列出该会话已持久化的上传文件（供前端刷新后恢复文件管理展示），按修改时间降序（最新在前）"""
    session_id = request.args.get('session_id')
    if not session_id:
        return jsonify({'success': False, 'files': []})
    return jsonify({'success': True, 'files': create_storage().list_uploads(session_id)})


@bp.route('/delete', methods=['POST'])
def delete_files():
    """删除指定会话下的上传文件（从磁盘移除，前端刷新后不再恢复）"""
    data = request.get_json() or {}
    session_id = data.get('session_id')
    names = data.get('filenames') or []
    if not session_id:
        return jsonify({'success': False, 'removed': []})
    removed = create_storage().delete_uploads(session_id, names)
    return jsonify({'success': True, 'removed': removed})


@bp.route('/open', methods=['POST'])
def open_local_dir():
    """在系统文件管理器中打开该会话的本地上传目录，便于用户核查实际落盘数据"""
    data = request.get_json() or {}
    session_id = data.get('session_id')
    if not session_id:
        return jsonify({'success': False, 'error': '缺少 session_id'})
    d = create_storage().upload_dir(session_id)
    if not os.path.isdir(d):
        os.makedirs(d, exist_ok=True)
    if sys.platform == 'win32':
        os.startfile(d)
    elif sys.platform == 'darwin':
        subprocess.Popen(['open', d])
    else:
        subprocess.Popen(['xdg-open', d])
    return jsonify({'success': True, 'path': d})


@bp.route('/content', methods=['GET'])
def upload_content():
    """读取已持久化文件的内容（文本返回原文，图片返回图片），供预览"""
    session_id = request.args.get('session_id')
    name = os.path.basename(request.args.get('name') or '')
    if not session_id or not name:
        abort(404)
    path = create_storage().resolve_upload_path(session_id, name)
    if not os.path.isfile(path):
        abort(404)
    # 读入内存再返回，避免 send_file 在 Windows 上残留文件句柄，导致随后的 /delete 无法移除文件
    with open(path, 'rb') as fp:
        data = io.BytesIO(fp.read())
    return send_file(data, mimetype=mimetypes.guess_type(path)[0] or 'application/octet-stream')

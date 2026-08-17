"""导出路由 - 阶段三"""
import json
import os
import re
import shutil
import urllib.parse

from flask import Blueprint, request, send_file, jsonify

from com.aiase.config.settings import Config
from com.aiase.manager.orchestrator import TestCaseOrchestrator
from com.aiase.web.routes.helpers import get_session

bp = Blueprint('export', __name__, url_prefix='/api/export')


def _model_args():
    """从请求中解析 provider/model/api_key/models，供 AI 生成文件名等场景使用"""
    form = request.form
    models = form.get('models')
    try:
        models = json.loads(models) if models else None
    except Exception:
        models = None
    return (form.get('provider', 'deepseek'), form.get('model') or None,
            form.get('api_key') or None, models)


def _attachment(path, orch, session_id, kind):
    """构造附件响应，并附带 AI 生成的文件名（X-Filename 头，URL 编码）"""
    resp = send_file(path, as_attachment=True)
    provider, model, api_key, models = _model_args()
    filename = orch.generate_filename(session_id, kind, provider, model, api_key, models)
    resp.headers['X-Filename'] = urllib.parse.quote(filename)
    return resp


@bp.route('/cases', methods=['POST'])
def export_cases():
    orch = TestCaseOrchestrator()
    session_id = get_session()
    fmt = request.form.get('format', 'excel')
    provider, model, api_key, models = _model_args()
    path = orch.process_phase3_export(session_id, fmt, provider, model, api_key, models)
    return _attachment(path, orch, session_id, 'cases')


@bp.route('/analysis', methods=['POST'])
def export_analysis():
    orch = TestCaseOrchestrator()
    session_id = get_session()
    fmt = request.form.get('format', 'html')
    path = orch.export_analysis(session_id, fmt)
    return _attachment(path, orch, session_id, 'review')


@bp.route('/manual', methods=['POST'])
def export_manual():
    orch = TestCaseOrchestrator()
    session_id = get_session()
    fmt = request.form.get('format', 'word')
    provider, model, api_key, models = _model_args()
    path = orch.export_manual(session_id, fmt, provider, model, api_key, models)
    return _attachment(path, orch, session_id, 'manual')


@bp.route('/dirs', methods=['GET'])
def list_dirs():
    """目录浏览：返回指定路径的子目录列表及上级路径，供前端选择保存目录"""
    path = request.args.get('path', '').strip()
    base = os.path.abspath(path) if path else Config.BASE_DIR
    if not os.path.isdir(base):
        base = Config.BASE_DIR
    try:
        dirs = sorted(d for d in os.listdir(base)
                      if os.path.isdir(os.path.join(base, d))
                      and not d.startswith('.') and not d.startswith('$'))
    except OSError:
        dirs = []
    return jsonify({'current': base, 'parent': os.path.dirname(base), 'dirs': dirs})


@bp.route('/save', methods=['POST'])
def export_save():
    """导出并保存到用户选择的服务器目录：复用各导出流程生成到临时目录后写入目标路径"""
    orch = TestCaseOrchestrator()
    session_id = get_session()
    fmt = request.form.get('format', 'excel')
    kind = request.form.get('kind', 'cases')
    target = request.form.get('dir', '').strip()
    filename = request.form.get('filename', '').strip()
    if not target or not os.path.isdir(target):
        return jsonify({'error': '目标目录不存在或不可写'}), 400
    if kind == 'cases':
        temp = orch.process_phase3_export(session_id, fmt)
    elif kind == 'review':
        temp = orch.export_analysis(session_id, fmt)
    elif kind == 'manual':
        provider, model, api_key, models = _model_args()
        temp = orch.export_manual(session_id, fmt, provider, model, api_key, models)
    else:
        return jsonify({'error': '未知导出类型'}), 400
    ext = os.path.splitext(temp)[1]
    if not filename:
        filename = os.path.basename(temp)
    elif not filename.lower().endswith(ext.lower()):
        filename = filename + ext
    filename = re.sub(r'[\\/:*?"<>|\s]+', '_', filename).strip('_') or 'export'
    dest = os.path.join(target, filename)
    try:
        shutil.copy2(temp, dest)
    except OSError as e:
        return jsonify({'error': f'写入失败：{e}'}), 400
    return jsonify({'path': dest, 'filename': filename})

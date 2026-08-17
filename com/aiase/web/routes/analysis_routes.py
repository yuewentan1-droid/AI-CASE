"""分析路由 - 阶段一"""
from flask import Blueprint, request, jsonify

from com.aiase.manager.orchestrator import TestCaseOrchestrator
from com.aiase.utils import job_control
from com.aiase.web.routes.helpers import ai_params, get_session, save_upload_files, restore_files

bp = Blueprint('analysis', __name__, url_prefix='/api/analysis')


@bp.route('/', methods=['POST'])
def analyze():
    orch = TestCaseOrchestrator()
    session_id = get_session()
    job_control.register(session_id)
    params = ai_params(request.form)
    # 从会话临时目录恢复文件路径，并接收本阶段新上传文件
    files = request.files.getlist('files')
    saved = []
    if files:
        saved = save_upload_files(files, session_id)
    saved += restore_files(session_id, request.form.get('filenames', ''))
    user_input = request.form.get('user_input', '')
    test_data = request.form.get('test_data', '')
    try:
        analysis = orch.process_phase1_analysis(
            session_id, saved, user_input, test_data,
            params['provider'], params['model'], params['api_key'],
            models=params['models'],
        )
        return jsonify({'session_id': session_id, 'analysis': analysis})
    except job_control.CancelledError:
        # 用户已停止：返回取消标记，不保存结果
        return jsonify({'session_id': session_id, 'cancelled': True}), 200
    finally:
        job_control.clear(session_id)


@bp.route('/stop', methods=['POST'])
def stop_analysis():
    """请求停止当前会话的分析任务"""
    session_id = get_session()
    job_control.request_cancel(session_id)
    return jsonify({'ok': True})

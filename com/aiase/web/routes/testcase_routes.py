"""用例生成路由 - 阶段二"""
import json

from flask import Blueprint, request, jsonify

from com.aiase.manager.orchestrator import TestCaseOrchestrator
from com.aiase.utils import job_control
from com.aiase.web.routes.helpers import ai_params, get_session, save_upload_files, restore_files

bp = Blueprint('testcase', __name__, url_prefix='/api/testcase')


@bp.route('/generate', methods=['POST'])
def generate():
    orch = TestCaseOrchestrator()
    session_id = get_session()
    job_control.register(session_id)
    params = ai_params(request.form)
    custom_template = request.form.get('template') or None
    # 接收当前上传文件与输入，确保生成基于实际文件与分析
    files = request.files.getlist('files')
    saved = []
    if files:
        saved = save_upload_files(files, session_id)
    saved += restore_files(session_id, request.form.get('filenames', ''))
    user_input = request.form.get('user_input', '')
    test_data = request.form.get('test_data', '')
    # 需求评审勾选点：仅以用户勾选的节点作为生成依据（JSON 字符串 → dict）
    checked_points = None
    raw = request.form.get('checked_points', '')
    if raw:
        try:
            checked_points = json.loads(raw)
        except (ValueError, TypeError):
            checked_points = None
    try:
        result = orch.process_phase2_strategy(
            session_id, custom_template, user_skills=None,
            provider=params['provider'], model=params['model'], api_key=params['api_key'],
            file_paths=saved, user_input=user_input, test_data=test_data,
            models=params['models'], checked_points=checked_points,
        )
        return jsonify({'session_id': session_id, **result})
    except job_control.CancelledError:
        # 用户已停止：返回取消标记，不保存结果
        return jsonify({'session_id': session_id, 'cancelled': True}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        job_control.clear(session_id)


@bp.route('/stop', methods=['POST'])
def stop_generate():
    """请求停止当前会话的用例生成任务"""
    session_id = get_session()
    job_control.request_cancel(session_id)
    return jsonify({'ok': True})


@bp.route('/review', methods=['POST'])
def review():
    try:
        orch = TestCaseOrchestrator()
        session_id = get_session()
        params = ai_params(request.form)
        result = orch.review_cases(session_id, params['provider'], params['model'], params['api_key'],
                                   params['models'])
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp.route('/edits', methods=['POST'])
def apply_edits():
    orch = TestCaseOrchestrator()
    session_id = get_session()
    data = request.get_json()
    cases = orch.apply_edits(session_id, data.get('delete_indices'), data.get('edits'))
    return jsonify({'cases': cases})

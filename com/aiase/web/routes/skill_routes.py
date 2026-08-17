"""Skill管理路由"""
import json
import urllib.request

from flask import Blueprint, request, jsonify

from com.aiase.config.settings import Config
from com.aiase.services.ai.multimodal_processor import MultimodalProcessor
from com.aiase.services.skill.skill_loader import SkillLoader
from com.aiase.services.skill.skill_validator import SkillValidator
from com.aiase.storage.factory import create_storage

bp = Blueprint('skill', __name__, url_prefix='/api/skill')


@bp.route('/list', methods=['GET'])
def list_skills():
    skills = SkillLoader().list_skills()
    return jsonify({'skills': [
        {'name': name, 'type': data.get('type'), 'description': data.get('description', '')}
        for name, data in skills.items()
    ]})


@bp.route('/upload', methods=['POST'])
def upload():
    validator = SkillValidator()
    storage = create_storage()
    file = request.files.get('file')
    fname = file.filename
    path = f'{Config.TEMP_PATH}/{fname}'
    file.save(path)
    valid, data = validator.validate_upload(path)
    if not valid:
        return jsonify({'success': False, 'error': data}), 400
    name = data.get('name', fname.rsplit('.', 1)[0])
    storage.save_skill(name, data)
    return jsonify({'success': True, 'name': name, 'type': data.get('type')})


@bp.route('/apikeys', methods=['GET'])
def load_apikeys():
    return jsonify({'keys': create_storage().load_apikeys()})


@bp.route('/models', methods=['POST'])
def fetch_models():
    """从提供商官方 /models 接口加载最新模型列表（用用户填写的 API Key）"""
    data = request.get_json() or {}
    provider = data.get('provider')
    api_key = data.get('api_key')
    base_url = Config.AI_MODELS.get(provider, {}).get('base_url') if provider else None
    if not provider or not api_key or not base_url:
        return jsonify({'success': False, 'error': '缺少 provider/api_key'}), 400
    req = urllib.request.Request(
        f'{base_url.rstrip("/")}/models',
        headers={'Authorization': f'Bearer {api_key}', 'Accept': 'application/json'},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            payload = json.loads(resp.read().decode('utf-8'))
        # 过滤已下线（Shutdown）模型，仅保留当前可用
        models = [
            m.get('id') for m in payload.get('data', [])
            if m.get('id') and m.get('status') != 'Shutdown'
        ]
        return jsonify({'success': True, 'models': models})
    except Exception as e:  # 拉取失败：向前端返回具体原因
        return jsonify({'success': False, 'error': str(e)})


@bp.route('/test-connection', methods=['POST'])
def test_connection():
    """测试模型接口连通性：用填写的 url/key 发起一次最小请求"""
    import time
    from openai import OpenAI
    data = request.get_json() or {}
    provider = data.get('provider')
    model = data.get('model')
    url = data.get('url') or (Config.AI_MODELS.get(provider, {}).get('base_url') if provider else None)
    api_key = data.get('api_key')
    if not provider or not model or not url or not api_key:
        return jsonify({'success': False, 'error': '缺少 provider/model/url/api_key'}), 400
    client = OpenAI(api_key=api_key, base_url=url, timeout=15)
    # 透传用户自定义参数，让测试反映真实配置
    kwargs = {'model': model, 'messages': [{'role': 'user', 'content': 'ping'}]}
    extra = {}
    try:
        if data.get('temperature') is not None:
            kwargs['temperature'] = float(data['temperature'])
        if data.get('max_tokens') is not None:
            kwargs['max_tokens'] = int(data['max_tokens'])
        # 提供商专属参数不识别为标准 kwarg，经 extra_body 透传
        if data.get('reasoning_effort') and provider == 'deepseek':
            extra['reasoning_effort'] = data['reasoning_effort']
        if data.get('enable_thinking') is not None and provider == 'qianwen':
            extra['enable_thinking'] = bool(data['enable_thinking'])
    except (TypeError, ValueError):
        pass
    start = time.time()
    try:
        client.chat.completions.create(**kwargs, extra_body=extra)
        latency = int((time.time() - start) * 1000)
        return jsonify({'success': True, 'latency': latency, 'model': model})
    except Exception as e:  # 联通失败：向前端返回具体原因
        return jsonify({'success': False, 'error': str(e)})


@bp.route('/precheck', methods=['POST'])
def precheck():
    """预检可用模型：测试模型池中各任务候选模型，返回实际会选用的模型（供分析前展示）。
    任一任务无可用模型时返回 ok=false，提示用户去模型管理填写正确的 API Key。"""
    data = request.get_json(silent=True) or {}
    models = data.get('models') or []
    if isinstance(models, str):
        try:
            models = json.loads(models)
        except (ValueError, TypeError):
            models = []
    proc = MultimodalProcessor(
        provider=data.get('provider', 'deepseek'),
        model=data.get('model') or None,
        api_key=data.get('api_key') or None,
        models=models,
    )
    tasks = ['text'] + (['vision'] if data.get('has_image') else [])
    try:
        picked = proc.predict(tasks)
        return jsonify({'ok': True, 'picked': picked})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)})


@bp.route('/apikeys', methods=['POST'])
def save_apikeys():
    data = request.get_json() or {}
    storage = create_storage()
    # 合并保存：保留其它已保存 key，仅更新本次提交的，各模型互不覆盖
    keys = storage.load_apikeys()
    for k, v in data.items():
        if v:
            keys[k] = v
    storage.save_apikeys(keys)
    return jsonify({'success': True, 'saved': [k for k in data if data[k]]})


@bp.route('/apikeys/delete', methods=['POST'])
def delete_apikeys():
    """删除 API Key：按 key 值删除，值相同的其它模型 key 一并删除（清空缓存级联，跨提供商）"""
    data = request.get_json() or {}
    values = data.get('values') or []
    storage = create_storage()
    removed = storage.delete_apikeys(values)
    return jsonify({'success': True, 'removed': removed})


@bp.route('/testdata', methods=['POST'])
def save_testdata():
    storage = create_storage()
    data = request.get_json() or {}
    name = data.get('name', 'testdata')
    payload = data.get('data')
    if isinstance(payload, str):
        payload = json.loads(payload)
    storage.save_testdata(name, payload)
    return jsonify({'success': True, 'name': name})


@bp.route('/testdata/list', methods=['GET'])
def list_testdata():
    storage = create_storage()
    return jsonify({'files': storage.list_testdata()})

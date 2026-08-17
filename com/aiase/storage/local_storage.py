"""本地文件存储实现"""
import os
import json

from com.aiase.config.settings import Config
from com.aiase.storage.base import BaseStorage


class LocalStorage(BaseStorage):
    """基于本地文件的持久化实现，仅保存Skill/测试数据/API Key，用例不落盘"""

    def __init__(self):
        self.base_path = Config.STORAGE_PATH
        self.skill_path = Config.SKILL_PATH
        self.testdata_path = os.path.join(self.base_path, 'testdata')
        self.apikey_path = os.path.join(self.base_path, 'apikeys.json')
        self.upload_base_path = Config.UPLOAD_PATH
        os.makedirs(self.skill_path, exist_ok=True)
        os.makedirs(self.testdata_path, exist_ok=True)
        os.makedirs(self.upload_base_path, exist_ok=True)

    def save_skill(self, name, skill_data):
        """保存用户自定义Skill为JSON"""
        path = os.path.join(self.skill_path, f'{name}.json')
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(skill_data, f, ensure_ascii=False, indent=2)
        return path

    def list_skills(self):
        """列出已保存Skill"""
        names = []
        for fname in os.listdir(self.skill_path):
            if fname.endswith('.json'):
                names.append(fname.rsplit('.', 1)[0])
        return names

    def save_testdata(self, name, data):
        """保存测试数据，按内容格式存储为json或txt"""
        ext = 'json' if isinstance(data, (dict, list)) else 'txt'
        path = os.path.join(self.testdata_path, f'{name}.{ext}')
        if ext == 'json':
            content = json.dumps(data, ensure_ascii=False, indent=2)
        else:
            content = str(data)
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)
        return path

    def list_testdata(self):
        files = []
        for fname in os.listdir(self.testdata_path):
            files.append(fname)
        return files

    def save_apikeys(self, keys):
        """保存用户自定义的API Key"""
        os.makedirs(os.path.dirname(self.apikey_path), exist_ok=True)
        with open(self.apikey_path, 'w', encoding='utf-8') as f:
            json.dump(keys, f, ensure_ascii=False, indent=2)

    def load_apikeys(self):
        """加载用户保存的API Key"""
        if os.path.exists(self.apikey_path):
            with open(self.apikey_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        return {}

    def resolve_apikey(self, provider):
        """解析API Key：优先用户保存的，其次该提供商的模型 key，最后环境变量"""
        keys = self.load_apikeys()
        key = keys.get(provider)
        if not key:
            # 按模型名保存的 key 也可用于该提供商（同一提供商共用）
            for m in Config.AI_MODELS.get(provider, {}).get('models', []):
                if keys.get(m):
                    key = keys[m]
                    break
        return key or Config.get_api_key(provider)

    def delete_apikeys(self, values):
        """删除与给定任一值相同的API Key。按 key 值级联：其它模型共用同一 key 时一并删除，
        保证清空缓存后同一 key 的所有模型（跨提供商）前端/后端/存储一并清除。
        返回被删除的 {模型名: key值} 映射"""
        keys = self.load_apikeys()
        values = set(values or [])
        removed = {}
        for k, v in list(keys.items()):
            if v in values:
                removed[k] = v
        for k in removed:
            keys.pop(k)
        self.save_apikeys(keys)
        return removed

    def upload_dir(self, session_id):
        """会话上传目录绝对路径：data/uploads/{session}"""
        return os.path.join(self.upload_base_path, session_id)

    def save_uploads(self, session_id, files):
        """保存上传文件列表到 data/uploads/{session}，返回绝对路径列表"""
        d = self.upload_dir(session_id)
        os.makedirs(d, exist_ok=True)
        saved = []
        for f in files:
            path = os.path.join(d, f.filename)
            f.save(path)
            saved.append(path)
        return saved

    def save_upload_text(self, session_id, filename, content):
        """保存上传文本为 txt 到 data/uploads/{session}，返回绝对路径"""
        d = self.upload_dir(session_id)
        os.makedirs(d, exist_ok=True)
        path = os.path.join(d, f'{filename}.txt')
        with open(path, 'w', encoding='utf-8') as fp:
            fp.write(content)
        return path

    def list_uploads(self, session_id):
        """列出会话上传文件（按修改时间降序），返回 [{name, size, mtime, path}]"""
        d = self.upload_dir(session_id)
        files = []
        if os.path.isdir(d):
            for name in os.listdir(d):
                p = os.path.join(d, name)
                if os.path.isfile(p):
                    files.append({'name': name, 'size': os.path.getsize(p),
                                  'mtime': os.path.getmtime(p), 'path': p})
        files.sort(key=lambda f: f['mtime'], reverse=True)
        return files

    def delete_uploads(self, session_id, names):
        """删除会话上传文件，返回实际删除的 name 列表"""
        d = self.upload_dir(session_id)
        removed = []
        for name in names:
            p = os.path.join(d, os.path.basename(name))
            if os.path.isfile(p):
                os.remove(p)
                removed.append(name)
        return removed

    def resolve_upload_path(self, session_id, name):
        """拼接会话上传目录下的绝对路径（仅供路径解析，调用方负责存在性判断）"""
        return os.path.join(self.upload_dir(session_id), os.path.basename(name))

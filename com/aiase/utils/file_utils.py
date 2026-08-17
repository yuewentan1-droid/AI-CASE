"""文件处理工具"""
import os
import uuid
import shutil

from com.aiase.config.settings import Config


def gen_session_id():
    return uuid.uuid4().hex[:12]


def read_text_file(path):
    """读取文本文件内容"""
    with open(path, 'r', encoding='utf-8') as fp:
        return fp.read()


def read_json_file(path):
    import json
    return json.loads(read_text_file(path))


def clean_temp(session_id):
    temp_dir = os.path.join(Config.TEMP_PATH, session_id)
    if os.path.exists(temp_dir):
        shutil.rmtree(temp_dir, ignore_errors=True)


def truncate(text, limit=6000):
    """截断超长文本，避免超出模型上下文"""
    if len(text) <= limit:
        return text
    return text[:limit] + f'\n...(内容过长已截断,总长{len(text)}字符)'

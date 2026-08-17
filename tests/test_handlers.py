"""输入处理器测试"""
import os
import json
import shutil

from com.aiase.services.input.factory import parse_file
from com.aiase.services.input.text_handler import TextHandler
from com.aiase.services.input.json_handler import JsonHandler
from com.aiase.services.input.image_handler import ImageHandler

_TMP = 'temp_test'


def setup_module():
    os.makedirs(_TMP, exist_ok=True)


def teardown_module():
    shutil.rmtree(_TMP, ignore_errors=True)


def _tmp(name, content, binary=False):
    path = os.path.join(_TMP, name)
    if binary:
        with open(path, 'wb') as f:
            f.write(content)
    else:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)
    return path


def test_text_handler():
    p = _tmp('a.md', '# 需求\n功能说明')
    c = TextHandler().parse(p)
    assert '需求' in c


def test_json_handler():
    p = _tmp('d.json', json.dumps({'a': 1}))
    c = JsonHandler().parse(p)
    assert 'a' in c


def test_factory_classify():
    cat, _ = parse_file(_tmp('c.py', 'x=1'))
    assert cat == 'code'
    cat, _ = parse_file(_tmp('i.txt', 'hi'))
    assert cat == 'text'


def test_image_handler():
    import base64
    png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==')
    p = _tmp('i.png', png, binary=True)
    c = ImageHandler().parse(p)
    assert isinstance(c, str) and len(c) > 0

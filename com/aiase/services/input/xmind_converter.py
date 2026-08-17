"""XMind(.xmind) → FreeMind(.mm) 转换

.xmind 实为 ZIP 容器（含 content.json 或 content.xml），无法直接当文本/XML 解析。
按 user_skills/xmind.md 转换 Skill 的映射规则，将 XMind 主题树无损转为标准 .mm XML：
- XMind 2020+（Zen）：content.json 数组，每个 sheet.rootTopic 即根主题
- XMind 8 及更早：content.xml，<sheet> 下 <topic> 根主题
多画布仅取第一个画布（符合 .mm 单根规范）。
"""
import json
import itertools
import zipfile
import xml.etree.ElementTree as ET

MM_HEAD = '<?xml version="1.0" encoding="UTF-8"?>\n<map version="1.0.1">\n'
MM_TAIL = '</map>\n'


def _new_id(seq):
    """jsmind 需要唯一节点 ID（缺失会退化为 'undefined' 导致碰撞），这里按序号生成"""
    return 'node-%d' % next(seq)


def _esc(text):
    """转义 MM 属性文本，保证 XML 合法"""
    return str(text or '').replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')


def _localname(tag):
    return tag.split('}')[-1]


def _children_by_localname(node, local):
    return [c for c in node if _localname(c.tag) == local]


def _first_descendant_by_localname(node, local):
    for el in node.iter():
        if _localname(el.tag) == local:
            return el
    return None


def xmind_to_mm(file_path):
    """读取 .xmind（ZIP），转换为 FreeMind .mm XML 文本"""
    with zipfile.ZipFile(file_path) as z:
        names = set(z.namelist())
        if 'content.json' in names:
            return _from_json(z.read('content.json'))
        if 'content.xml' in names:
            return _from_xml(z.read('content.xml'))
        raise ValueError('无法识别 XMind 内容（缺少 content.json / content.xml）')


def _from_json(raw):
    """XMind 2020+：content.json → mm"""
    sheets = json.loads(raw)
    if not sheets:
        return MM_HEAD + MM_TAIL
    root_topic = (sheets[0] or {}).get('rootTopic') or {}
    seq = itertools.count(1)
    lines = [MM_HEAD, _json_topic(root_topic, 1, seq), MM_TAIL]
    return '\n'.join(lines)


def _json_topic(topic, depth, seq):
    """递归：JSON 主题 → <node> 标签"""
    pad = '  ' * depth
    text = _esc(topic.get('title'))
    out = [f'{pad}<node ID="{_new_id(seq)}" TEXT="{text}">']
    children = topic.get('children', {}).get('attached') or []
    for child in children:
        out.append(_json_topic(child, depth + 1, seq))
    out.append(f'{pad}</node>')
    return '\n'.join(out)


def _from_xml(raw):
    """XMind 8 及更早：content.xml → mm"""
    root = ET.fromstring(raw)
    sheet = _first_descendant_by_localname(root, 'sheet')
    root_topic = None
    if sheet is not None:
        roots = _children_by_localname(sheet, 'topic')
        root_topic = roots[0] if roots else None
    if root_topic is None:
        root_topic = _first_descendant_by_localname(root, 'topic')
    if root_topic is None:
        raise ValueError('XMind 无主题内容')
    seq = itertools.count(1)
    return MM_HEAD + _xml_topic(root_topic, 1, seq) + '\n' + MM_TAIL


def _xml_topic(node, depth, seq):
    """递归：XML 主题 → <node> 标签（子主题位于 children > topics > topic）"""
    pad = '  ' * depth
    title_el = _first_descendant_by_localname(node, 'title')
    text = _esc(title_el.text if title_el is not None else None)
    out = [f'{pad}<node ID="{_new_id(seq)}" TEXT="{text}">']
    for child in _child_topics(node):
        out.append(_xml_topic(child, depth + 1, seq))
    out.append(f'{pad}</node>')
    return '\n'.join(out)


def _child_topics(node):
    """返回 node 的直接子主题（XMind8: children > topics > topic）"""
    out = []
    for children_el in _children_by_localname(node, 'children'):
        for topics_el in _children_by_localname(children_el, 'topics'):
            out.extend(_children_by_localname(topics_el, 'topic'))
    return out

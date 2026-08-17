"""Skill验证器"""
import json

from com.aiase.utils.file_utils import read_text_file


class SkillValidator:

    REQUIRED_KEYS = ['type', 'name']

    def validate_upload(self, file_path):
        """验证上传的Skill文件，返回 (是否有效, 数据或错误信息)"""
        ext = file_path.rsplit('.', 1)[-1].lower()
        if ext == 'json':
            data = json.loads(read_text_file(file_path))
            if not isinstance(data, dict):
                return False, 'Skill JSON必须为对象'
            for k in self.REQUIRED_KEYS:
                if k not in data:
                    return False, f'缺少必需字段: {k}'
            if data['type'] not in ('analysis', 'template', 'design'):
                return False, f'type必须为 analysis/template/design，当前: {data["type"]}'
            return True, data
        if ext in ('txt', 'md'):
            return True, {'name': file_path.rsplit('/', 1)[-1].rsplit('.', 1)[0], 'type': 'design', 'prompt': read_text_file(file_path)}
        return False, '仅支持 json/txt/md 格式的Skill'

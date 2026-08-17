"""Skill加载器 - 支持内置与用户自定义，用户优先"""
import os
import json

from com.aiase.config.settings import Config


class SkillLoader:

    def __init__(self):
        self.builtin_dir = Config.BUILTIN_SKILL_PATH
        self.user_dir = Config.SKILL_PATH

    def _load_file(self, fpath):
        """加载单个Skill文件，json为结构化定义，txt为纯文本Prompt"""
        ext = os.path.splitext(fpath)[1].lower()
        if ext == '.json':
            with open(fpath, 'r', encoding='utf-8') as f:
                return json.load(f)
        if ext in ('.txt', '.md'):
            with open(fpath, 'r', encoding='utf-8') as f:
                return {'prompt': f.read()}
        return None

    def _load_dir(self, path):
        skills = {}
        if not os.path.isdir(path):
            return skills
        for fname in os.listdir(path):
            fpath = os.path.join(path, fname)
            if not os.path.isfile(fpath):
                continue
            data = self._load_file(fpath)
            if data:
                name = data.get('name') or os.path.splitext(fname)[0]
                data['_file'] = fpath
                skills[name] = data
        return skills

    def load(self, user_skills=None):
        """加载全部Skill：用户Skill优先覆盖内置，实时上传的user_skills最高优先"""
        skills = self._load_dir(self.builtin_dir)
        skills.update(self._load_dir(self.user_dir))
        if user_skills:
            skills.update(user_skills)
        return skills

    def list_skills(self):
        return self.load()

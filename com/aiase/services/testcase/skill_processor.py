"""Skill处理器 - 从全部Skill中提取分析/模板/设计技能"""
from com.aiase.services.skill.skill_loader import SkillLoader


class SkillProcessor:
    """根据type分类Skill：analysis/template/design"""

    def __init__(self):
        self.loader = SkillLoader()

    def all_skills(self, user_skills=None):
        return self.loader.load(user_skills)

    def get_analysis_skill(self, user_skills=None):
        """获取分析Skill（用户优先）"""
        skills = self.all_skills(user_skills)
        return self._first_type(skills, 'analysis')

    def get_template_skill(self, user_skills=None):
        """获取模板Skill"""
        skills = self.all_skills(user_skills)
        tpl = self._first_type(skills, 'template')
        if tpl:
            return tpl
        return None

    def get_design_skill(self, user_skills=None):
        """获取用例设计Skill"""
        skills = self.all_skills(user_skills)
        return self._first_type(skills, 'design')

    def get_review_skill(self, user_skills=None):
        """获取用例评审Skill prompt（文件名/名称含 review），未找到返回空"""
        skills = self.all_skills(user_skills)
        for name, data in skills.items():
            if 'review' in name.lower():
                return data.get('prompt', '') or ''
        return ''

    def get_generator_skill(self, user_skills=None):
        """获取用例生成Skill（优先 generator，其次 design），未找到返回 None"""
        skills = self.all_skills(user_skills)
        for name, data in skills.items():
            if 'generator' in name.lower():
                return data
        for name, data in skills.items():
            if 'design' in name.lower():
                return data
        return None

    def _first_type(self, skills, skill_type):
        for name, data in skills.items():
            if data.get('type') == skill_type:
                return data
        return None

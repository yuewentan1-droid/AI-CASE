"""AI 自动生成导出文件名（5-15 字） - 依据需求文档上下文提炼

针对用例/评审/操作手册三类导出，让 AI 结合需求文档提炼一个简短、贴切的文件名；
AI 不可用（未配置模型/失败）时回退到「概述」截取或固定默认名，保证导出不被阻断。
"""
import re


class FilenameGenerator:
    """基于需求上下文为导出内容生成简短文件名"""

    _DEFAULTS = {'cases': '测试用例', 'review': '需求评审', 'manual': '操作手册'}

    def __init__(self, ai):
        self.ai = ai

    @staticmethod
    def _clip(name):
        """清理非法字符并截断到 15 字，保证可作为文件名"""
        name = (name or '').strip().strip('《》""‘’“”')
        name = re.sub(r'[\\/:*?"<>|，。！？、\s]+', '', name)
        if len(name) > 15:
            name = name[:15]
        return name

    def generate(self, analysis, kind):
        """返回 5-15 字文件名（无扩展名）；失败时回退"""
        default = self._DEFAULTS.get(kind, '测试文档')
        a = analysis or {}
        overview = (a.get('summary') or {}).get('overview', '')
        seed = (overview or a.get('context') or '').strip()
        seed = seed[:1200] if seed else ''
        label = self._DEFAULTS.get(kind, '测试文档')
        if seed:
            system_prompt = '你是命名专家。根据需求文档提炼一个简短、贴切、通俗易懂的文件名。'
            user_content = (f'需求概述：{seed}\n\n'
                            f'请为要导出的「{label}」给出一个 5-15 个字的中文文件名。'
                            f'只输出文件名本身，不要扩展名、不要标点、不要引号。')
            try:
                res = self._clip(self.ai.text(system_prompt, user_content))
                if res:
                    return res
            except Exception:
                pass
            # 兜底：直接从概述截取
            fb = self._clip(overview)
            if fb:
                return fb
        return default

"""全局配置管理 - 一切皆可自定义，官方模型URL写死"""
import os


class Config:
    # AI模型配置（官方模型URL与模型名写死）
    AI_MODELS = {
        'deepseek': {
            'name': 'DeepSeek',
            'base_url': 'https://api.deepseek.com',
            'models': ['deepseek-chat', 'deepseek-coder'],
            'env_key': 'DEEPSEEK_API_KEY',
        },
        'doubao': {
            'name': '豆包',
            'base_url': 'https://ark.cn-beijing.volces.com/api/v3',
            'models': ['doubao-seed-2-1-pro-260628', 'doubao-seed-2-0-mini-260428'],
            'env_key': 'DOUBAO_API_KEY',
        },
        'qianwen': {
            'name': '千问',
            'base_url': 'https://dashscope.aliyuncs.com/compatible-mode/v1',
            'models': ['qwen3-vl-plus', 'qwen3-vl-flash', 'qwen3.6-plus', 'qwen3.6-max-preview'],
            'env_key': 'QIANWEN_API_KEY',
        },
    }

    # 视觉模型映射（用于图片识别）
    VISION_MODELS = {
        'doubao': 'doubao-seed-2-1-pro-260628',
        'qianwen': 'qwen3-vl-plus',
    }

    # 编程模型映射（用于代码文件）
    CODE_MODELS = {
        'deepseek': 'deepseek-coder',
        'doubao': 'doubao-seed-2-0-mini-260428',
        'qianwen': 'qwen3-vl-flash',
    }

    # 文本模型（默认对话模型）
    TEXT_MODEL_DEFAULT = 'deepseek-chat'

    # 支持的文件格式
    SUPPORTED_FORMATS = {
        'text': ['.txt', '.md'],
        'document': ['.docx', '.doc'],
        'spreadsheet': ['.xlsx', '.xls'],
        'mindmap': ['.mm', '.xmind'],
        'code': ['.py', '.java', '.js', '.go', '.c', '.cpp', '.java', '.ts', '.sql', '.cs', '.php', '.rb', '.sh'],
        'json': ['.json'],
        'image': ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'],
    }

    # 系统内置默认用例模板
    DEFAULT_TEMPLATE = {
        'name': '系统内置模板',
        'fields': ['主模块', '子模块1', '子模块2', '测试标题', '测试步骤', '测试结果'],
    }

    # 存储路径（运行时数据目录，与源码 storage 包区分开）
    BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    # 存储/临时路径支持环境变量覆盖（.env 或系统环境变量），缺省使用项目内 data/temp
    STORAGE_PATH = os.getenv('STORAGE_PATH') or os.path.join(BASE_DIR, 'data')
    SKILL_PATH = os.path.join(BASE_DIR, 'com', 'aiase', 'services', 'skill', 'user_skills')
    BUILTIN_SKILL_PATH = os.path.join(BASE_DIR, 'com', 'aiase', 'services', 'skill', 'builtin_skills')
    TEMP_PATH = os.getenv('TEMP_PATH') or os.path.join(BASE_DIR, 'temp')
    # 上传文件持久化目录：用户上传的图片与其它格式文件统一存此，供后续 AI 综合分析阅读
    UPLOAD_PATH = os.path.join(STORAGE_PATH, 'uploads')

    # 存储后端配置（local=本地文件；mysql=预留扩展）
    DB_CONFIG = {
        'backend': 'local',
        'host': 'localhost',
        'port': 3306,
        'user': 'root',
        'password': '',
        'database': 'aiase',
    }

    @staticmethod
    def get_api_key(provider):
        """获取指定提供商的API Key（优先环境变量）"""
        key = os.getenv(Config.AI_MODELS[provider]['env_key'], '')
        return key

    @staticmethod
    def classify_file(filename):
        """根据扩展名分类文件类型"""
        ext = os.path.splitext(filename)[1].lower()
        for category, exts in Config.SUPPORTED_FORMATS.items():
            if ext in exts:
                return category
        return 'unknown'


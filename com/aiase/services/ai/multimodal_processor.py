"""多模态识别处理器 - 统一分发文本/视觉/编程任务。

先自动测试各可用模型的连通性，只从「测试通过」的模型中选择：
- 所有提供商都填写了 Key：随机使用一个可用模型；
- 否则：优先当前所选模型（能联通即用），否则任选一个可用模型。
不再有主模型优先 + 随机兜底链；全部模型都测试失败才报错（不能用）。
实际使用的模型记录在 self.used_models 供前端展示。
"""
import random

from com.aiase.config.settings import Config
from com.aiase.services.ai.model_factory import ModelFactory
from com.aiase.storage.factory import create_storage
from com.aiase.utils import job_control


class MultimodalProcessor:
    """根据内容类型选择可用模型：文档/文本用对话模型，图片用视觉模型，代码用编程模型。"""

    def __init__(self, provider='deepseek', model=None, api_key=None, models=None, session_id=None):
        self.provider = provider
        self.model = model
        self.api_key = api_key
        self.models = models or []  # 用户已保存的有 key 的模型池：[{provider, model, api_key}]
        self.session_id = session_id  # 供「停止生成/停止分析」在流式调用中检查取消
        self.used_models = {}       # task -> {'provider': .., 'model': ..}
        self._tested = {}           # (provider, model) -> bool，本实例内的连通性测试缓存

    def _all_keys_filled(self):
        """从持久化 Key 判断所有提供商都已填写（模型池为空时的兜底判断）"""
        keys = create_storage().load_apikeys()
        for p in Config.AI_MODELS:
            if not (keys.get(p) or any(keys.get(m) for m in Config.AI_MODELS[p]['models'])):
                return False
        return True

    def _all_filled(self):
        """是否所有提供商都已填写 Key：优先按传入模型池推断，否则按持久化 Key"""
        if self.models:
            provs = {it.get('provider') for it in self.models}
            return all(p in provs for p in Config.AI_MODELS)
        return self._all_keys_filled()

    def _candidates(self, task):
        """候选模型：仅来自「模型池」（用户配置的有效模型卡片，各带自身 key），按任务过滤类型并去重。
        当前所选模型（用户点选的模型卡片）置于候选前列，优先使用。不注入任何未配置的默认模型。"""
        items = []
        for it in self.models:
            p, m, k = it.get('provider'), it.get('model'), it.get('api_key')
            if not p or not m or not k:
                continue
            items.append((p, m, k))
        if self.provider and self.model:
            for i, (p, m, k) in enumerate(items):
                if p == self.provider and m == self.model:
                    items.insert(0, items.pop(i))
                    break
        out = []
        for p, m, k in items:
            if task == 'vision' and p not in Config.VISION_MODELS:
                continue
            if task == 'code' and Config.CODE_MODELS.get(p) != m:
                continue
            out.append((p, m, k))
        uniq = {}
        for c in out:
            uniq.setdefault((c[0], c[1]), c)
        return list(uniq.values())

    def _test(self, prov, model, key):
        """廉价连通性测试：一次最小文本调用成功即视为可用（检测坏 Key/余额不足），带缓存"""
        ck = (prov, model)
        if ck in self._tested:
            return self._tested[ck]
        ok = False
        try:
            service = ModelFactory.create(prov, model=model, api_key=key)
            service.chat([{'role': 'user', 'content': 'ok'}])
            ok = True
        except Exception:
            ok = False
        self._tested[ck] = ok
        return ok

    def _pick(self, task):
        """从「测试通过」的模型中选本次要用的：
        全 Key → 随机；否则 → 优先当前所选（能联通即用），其次任选一个可用模型。"""
        pool = self._candidates(task)
        working = [c for c in pool if self._test(*c)]
        if not working:
            raise RuntimeError(f'所有可用模型均测试失败，无法进行{task}分析')
        if self._all_filled():
            random.shuffle(working)
            return working
        pref = [c for c in working
                if c[0] == self.provider and (self.model is None or c[1] == self.model)]
        if pref:
            return pref + [c for c in working if c not in pref]
        return working

    def predict(self, tasks):
        """预检：测试各任务候选模型，返回每个任务实际会选用的模型（不真正执行任务）。

        任一任务无可用模型即抛错，供前端弹窗提示用户去模型管理填写正确的 API Key。
        """
        picked = {}
        for task in tasks:
            chosen = self._pick(task)
            p, m, _ = chosen[0]
            picked[task] = {'provider': p, 'model': m}
        return picked

    def _cancel_check(self):
        """构造取消检测回调：未绑定会话时不启用（保持原有非流式行为）"""
        if not self.session_id:
            return None
        return lambda: job_control.is_cancelled(self.session_id)

    def _run(self, task, call_fn):
        """按选出的可用模型顺序调用，成功记录 used_models；全部失败才抛错。
        cancel_check 随会话传入，使长调用可在流式拉取中被「停止」中断。"""
        last_err = None
        cancel_check = self._cancel_check()
        for prov, model, key in self._pick(task):
            try:
                service = ModelFactory.create(prov, model=model, api_key=key)
                result = call_fn(service, cancel_check)
            except Exception as e:
                last_err = e
                continue
            if result is None:
                continue  # 该模型不支持该任务（如 DeepSeek 无视觉），换下一个可用模型
            self.used_models[task] = {'provider': prov, 'model': model}
            return result
        if last_err is not None:
            raise last_err
        raise RuntimeError(f'所有可用模型调用均失败（{task}）')

    def text(self, system_prompt, user_content):
        """纯文本任务：测试后选可用模型"""
        return self._run('text', lambda svc, ck: svc.text(system_prompt, user_content, ck))

    def vision(self, system_prompt, image_data_url, user_content):
        """图片识别：测试后选可用视觉模型"""
        return self._run('vision',
                         lambda svc, ck: svc.vision(system_prompt, image_data_url, user_content, ck))

    def code(self, system_prompt, user_content):
        """代码任务：测试后选可用编程模型"""
        return self._run('code', lambda svc, ck: svc.text(system_prompt, user_content, ck))

"""业务流程图生成 - 依据 PRD/设计稿上下文生成 Mermaid 流程图，按需求复杂度选择简单/复杂"""
import re


class FlowchartGenerator:
    """基于需求上下文，让 AI 生成 Mermaid 业务流程图"""

    PROMPT = """你是资深业务分析师。根据以下需求上下文（PRD/设计稿/需求描述等），生成业务流程图。
要求：
1. 输出 Mermaid flowchart 语法（graph TD），用 ```mermaid 代码块包裹，不要输出其它文字。
2. 节点用中文描述，含开始/结束节点，清晰的流程走向，必要的分支判断用菱形。
3. 根据需求的复杂程度自行判定：
   - 流程简单、步骤少（≤5 个主要步骤）→ 输出简单流程图，节点数少；
   - 流程复杂、分支多 → 输出复杂流程图，包含子流程/多分支。
4. 严格基于需求描述，不要虚构需求中不存在的业务。

输出格式（仅此一个代码块）：
```mermaid
graph TD
  ...
```"""

    def __init__(self, ai_processor):
        self.ai = ai_processor

    def generate(self, context):
        """生成流程图，返回 {'mermaid': str, 'type': '简单'|'复杂'}；异常时 mermaid 为空"""
        if not context or not context.strip():
            return {'mermaid': '', 'type': '简单'}
        try:
            resp = self.ai.text(self.PROMPT, context)
        except Exception:
            return {'mermaid': '', 'type': '简单'}
        mermaid = self._extract_mermaid(resp)
        if not mermaid:
            return {'mermaid': '', 'type': '简单'}
        return {'mermaid': mermaid, 'type': self._judge_type(mermaid)}

    def _extract_mermaid(self, text):
        """从 AI 输出中提取 mermaid 代码块内容"""
        m = re.search(r'```mermaid\s*(.*?)```', text, re.S)
        if m:
            return m.group(1).strip()
        # 兜底：直接以 graph/diagram 开头的整段视为 mermaid
        stripped = text.strip()
        if re.match(r'(graph|flowchart|sequenceDiagram|stateDiagram)', stripped, re.I):
            return stripped
        return ''

    def _judge_type(self, mermaid):
        """按节点/连线数量粗判简单或复杂（AI 已按复杂度生成，这里作为兜底展示标签）"""
        nodes = len(re.findall(r'^\s*[A-Za-z0-9_\u4e00-\u9fa5]+\s*[\[\(:{}]', mermaid, re.M))
        return '复杂' if nodes > 8 else '简单'

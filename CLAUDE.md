# AICase 开发规范（精简）

编码前先加载对应 skill（`/aiase-project` 定位，然后 `/frontend-dev` `/backend-dev` `/tooling-dev`）。

## 最高优先级规则

- **禁止多余 try-catch**：直接实现核心逻辑，不要加冗余异常处理/兜底代码
- **禁止前端 JS/CSS/HTML 混写**：按功能拆到不同文件，不写在一个文件
- **禁止污染变动**：改动不得影响现有功能，改动后跑通全链路
- **分层架构**：config / entity / storage / services / manager / utils / web，前端独立于 `com/aiase`

## 开发方法论

- 加能力先去对应子包**新建文件**，再在工厂/注册处挂接，不改现有核心逻辑
- 修改必须全链路检查：前端 → 后端 → 数据 → 工具 → 配置
- 死代码/未引用代码立即删除

## Skill 导航

| Skill | 何时用 |
|-------|--------|
| `/aiase-project` | 总索引：项目架构、核心原则、全链路检查清单 |
| `/frontend-dev` | 改前端页面/样式/JS/Vite/接口调用 |
| `/backend-dev` | 加/改模型、文件格式、分析、导出、后端 API、API Key、storage、三阶段编排 |
| `/tooling-dev` | 写测试、改依赖、改部署运行、数据目录、工具函数 |

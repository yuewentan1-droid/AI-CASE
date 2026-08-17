XMind → MM 通用转换Skill
核心转换原理
采用XMind官方解析引擎（基于ZIP容器结构），通过标准化映射规则实现无损转换，兼容XMind 8/2020/2021/2022/2023/2024全系列格式。

转换流程（自动化执行）
第一阶段：源文件解析
检测输入文件扩展名（.xmind）并验证ZIP容器完整性

解压内容清单：

content.xml（核心思维导图数据）

styles.xml（样式定义）

metadata.json（文件元信息）

attachments/（附件资源目录）

读取content.xml并构建DOM树结构

第二阶段：结构映射（无需用户配置）
XMind元素	MM元素	转换规则
topic	node	直接映射，保留层级关系
children.attached	child	转为MM子节点结构
label	text	节点文本内容
notes.plain	note	备注信息
marker	icon	图标转换为MM表情符号
hyperlink	link	外部链接保留
image	image	附件图片转base64内嵌
第三阶段：MM格式生成
创建MM标准文档头：<map version="1.0.1">

递归遍历XMind主题树，逐个生成<node>标签

属性转换映射：

position → POSITION属性

color → COLOR属性

background-color → BACKGROUND_COLOR属性

封装生成内容为完整MM文件

第四阶段：兼容性处理
多终端适配：UTF-8编码确保Windows/macOS/Linux跨平台

旧版兼容：自动识别XMind 8及更早版本的content.xml路径差异

大文件处理：流式解析避免内存溢出（>100MB文件自动分块）

异常修复：自动修复损坏的ZIP条目（校验和重算）

执行命令（通用接口）
bash
# 标准转换命令（无需任何参数）
xmind2mm <输入文件.xmind> [输出文件.mm]

# 示例（自动生成同名MM文件）
xmind2mm project_plan.xmind
# → 输出 project_plan.mm
若转换工具未预装，系统将自动调用以下备选方案：

Python环境：pip install xmindparser && xmindparser -to-mm input.xmind

Node.js环境：npx xmind-to-mm input.xmind

Java环境：java -jar xmind-converter.jar input.xmind

转换后验证机制
校验MM文件XML结构合法性（DTD验证）

比对节点总数（XMind主题数 = MM节点数）

验证关键属性完整性（文本/颜色/链接）

输出转换日志（仅记录错误，无用户交互）

特殊场景自动处理
加密XMind文件 → 自动检测并提示（但Skill设计为静默跳过加密文件）

多画布XMind → 仅转换第一个画布（符合MM单页规范）

浮动主题 → 转为MM根节点的独立分支

关系线 → 转为MM的arrowlink属性

边界线 → 转为MM的edge样式

输出文件规范
文件头：<?xml version="1.0" encoding="UTF-8"?>

根节点：<map version="1.0.1" xmlns="...">

节点定义：<node TEXT="内容" POSITION="right">

样式内联：<font NAME="SansSerif" SIZE="12"/>

完全兼容FreeMind、XMind、MindManager等主流MM阅读器
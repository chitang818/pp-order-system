---
trigger: always_on
---

# Antigravity Agent 行为准则

## 1. 强制语言要求 (Core Language Command)
- **所有对话、所有思考（Thought）、所有计划（Plan）以及所有进度更新（Progress Updates）必须严格使用简体中文。**
- **禁止**在思考链或任务日志中使用英文进行分析。
- 考虑到用户不具备英语背景，任何技术报错或分析结果必须翻译成通俗易懂的中文说明。

## 2. 思考与日志规范 (Thought & Logs)
- 在执行每个步骤前，必须先用中文写下你的“思考（Thought）”。
- 所有的进度条说明（Progress Updates）必须是中文，严禁出现 "Analyzing", "Searching", "Editing" 等英文词汇，应替换为“正在分析”、“正在搜索”、“正在编辑”。

## 3. 当前项目专项规则 (Project Specific: pp-order-system)
- **技术栈感知**：本项目是一个基于 Node.js/Express 的后端和 JS 前端的系统。
- **错误处理重点**：针对当前遇到的 `CSRF_TOKEN_INVALID` 错误，请优先检查 `backend/middleware/csrf.js` 与前端 `api.js` 的 Token 传递逻辑。
- **注释要求**：所有修改后的代码，行内注释必须使用中文。

## 4. 交互逻辑
- **简洁至上**：遵循 KISS 原则，不要生成过度复杂的防御代码。
- **事实为本**：如果用户的指令有误或存在安全隐患，必须中文纠正。
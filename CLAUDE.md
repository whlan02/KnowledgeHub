# KnowledgeHub

本地版 Notion:Tauri 桌面应用,笔记是工作区文件夹里的普通 `.md` 文件(用 GitHub 管理)。前端 React + TipTap,后端 `src-tauri/`(Rust)。

## 开发规则

编写或修改任何代码时遵循项目 skill `clean-code-orange`(`.claude/skills/clean-code-orange/SKILL.md`),即 Clean Code Developer 橙色等级。

## 常用命令

- `npm start`:启动桌面应用开发版(Tauri)
- `npm test`:前端测试(Vitest);`npm run test:rust`:Rust 测试
- `npx tsc -b` 和 `npm run lint`:类型检查与 lint,提交前都要通过

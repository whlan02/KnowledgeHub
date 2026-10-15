# KnowledgeHub

本地版 Notion:Tauri 桌面应用,笔记是工作区文件夹里的普通 `.md` 文件(用 GitHub 管理)。前端 React + TipTap,后端 `src-tauri/`(Rust)。

## 开发规则

编码规范是 Clean Code Developer 橙色等级,写在 `.claude/rules/clean-code-orange.md`。它没有 `paths` 限定,每次会话启动时自动载入,不需要手动加载。

## 常用命令

- `npm start`:启动桌面应用开发版(Tauri)
- `npm test`:前端测试(Vitest);`npm run test:rust`:Rust 测试
- `npx tsc -b` 和 `npm run lint`:类型检查与 lint,提交前都要通过

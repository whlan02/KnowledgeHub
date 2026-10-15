# KnowledgeHub

本地版 Notion:Tauri 桌面应用,笔记是工作区文件夹里的普通 `.md` 文件(用 GitHub 管理)。前端 React + TipTap,后端 `src-tauri/`(Rust)。

## 开发规则

编写或修改任何代码时遵循项目 skill `clean-code-orange`(`.claude/skills/clean-code-orange/SKILL.md`),即 Clean Code Developer 橙色等级。每次开始写代码前先用 Skill 工具加载它(技能正文不会自动载入,只有描述会)。

提交前自查:函数只在一个抽象层级;文件/组件/hook 只有一个改动理由(约 300 行为警戒线);基础设施细节不进核心逻辑;命名与周围一致、注释只写“为什么”;遗留问题记到 `docs/issues.md`;改动有测试,功能完成后跑 `/code-review`。

## 常用命令

- `npm start`:启动桌面应用开发版(Tauri)
- `npm test`:前端测试(Vitest);`npm run test:rust`:Rust 测试
- `npx tsc -b` 和 `npm run lint`:类型检查与 lint,提交前都要通过

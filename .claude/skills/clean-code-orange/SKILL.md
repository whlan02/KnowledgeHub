---
name: clean-code-orange
description: KnowledgeHub 的编码规范,基于 Clean Code Developer 橙色等级(Single Level of Abstraction、SRP、Separation of Concerns、代码约定,以及 Issue Tracking、集成测试、Review 实践)。在本项目里编写、修改、重构或评审任何 TypeScript/React/Rust 代码时使用。
---

# Clean Code Developer · 橙色等级

来源:https://clean-code-developer.de/die-grade/orangener-grad/

在本项目写代码时按下面四条原则和三条实践执行。动手前先想一遍,收尾时对照检查。

## 原则

### 1. Single Level of Abstraction(单一抽象层级)
一个函数只处在一个抽象层级上:要么讲"做什么"(调用别的函数),要么讲"怎么做"(具体细节),不要混在一起。

- 函数体读起来像一段目录式的步骤列表;细节下沉到命名清楚的小函数里。
- 一个函数里同时出现业务决策和底层操作(拼路径、解析字符串、DOM 操作)时,拆开。
- 反例信号:一个函数里既有 `if (业务条件)` 又有逐字符处理。

### 2. Single Responsibility Principle(单一职责)
一个类、模块、组件、hook 只有一个改动理由。

- React 组件:展示归组件,数据获取和状态归 hook/provider,纯计算归 `src/lib/`。
- Rust:`lib.rs` 里文件系统、监听、协议处理各自成函数;变大后拆成模块(`workspace.rs`、`watcher.rs`、`assets.rs`)。
- 一个文件超过约 300 行,先怀疑它不止一个职责。

### 3. Separation of Concerns(关注点分离)
把横切的、基础设施类的事情和核心逻辑分开,做到低耦合、高内聚。

- 前端只通过 `src/lib/backend.ts` 调 Tauri;组件里不直接 `invoke`、不直接碰文件路径。
- 持久化(localStorage、磁盘)、日志、缓存不写进渲染逻辑里。
- Markdown 解析/序列化、目录(TOC)提取、链接解析放在 `src/lib/`,不依赖 React。
- Rust 命令只做"校验参数 + 调用",路径安全检查集中在 `safe_join`,不在各处重复。

### 4. Source Code Conventions(代码约定)
- **命名**:保持与周围代码一致,一致性比具体风格重要。TypeScript 用 camelCase / PascalCase 组件;Rust 用 snake_case。名字要说明意图,布尔值用 `is/has/can` 开头。ref 用 `xxxRef` 后缀(现有风格)。
- **注释**:能用命名表达的就不写注释。注释写"为什么",不写"做了什么"。删掉复述代码的注释和被注释掉的旧代码。
- 新代码的注释密度、风格向周围文件看齐,不额外加装饰性文档。

## 实践

### Issue Tracking(问题跟踪)
发现但本次不处理的问题、后续功能、已知缺陷,不要丢在脑子或聊天里。

- 记到仓库的 `docs/issues.md`(一条一行:`- [ ] 简述 — 背景/文件`),完成后打勾。
- 用户明确要求时,才用 `gh issue create` 建 GitHub Issue。
- 本次顺手发现的问题:记录,不在同一次改动里夹带修复。

### Automated Integration Tests(自动化集成测试)
改动已有行为之前,先有测试作安全网。

- 要改的逻辑没有测试时,先写一个固定当前行为的测试,再改。
- 优先测有价值的边界:Markdown 往返(读入再写回不丢内容)、链接解析、路径安全(`..`、绝对路径)、工作区扫描。
- 项目目前没有测试框架。第一次需要测试时,前端用 Vitest,Rust 用 `cargo test`;引入框架前先告诉用户。

### Reviews(评审)
一个功能完成后、交付给用户前,让第二双眼睛看一遍。

- 用 `/code-review` 评审当前改动,处理其中的正确性问题后再报告完成。
- 交付说明里讲清楚改了什么、哪些没测过、哪些留给后续。

> 第四条实践 "Read, Read, Read"(每年读至少六本技术书)是对开发者本人的要求,代码工作中不需要执行。

## 收尾检查

提交前自查:
1. 每个函数是否只在一个抽象层级?
2. 每个文件/组件/模块是否只有一个改动理由?
3. 基础设施细节是否被挡在核心逻辑之外?
4. 命名是否与周围一致,注释是否只说"为什么"?
5. 遗留的问题是否已记到 `docs/issues.md`?
6. 改动的行为是否有测试或已被 review?

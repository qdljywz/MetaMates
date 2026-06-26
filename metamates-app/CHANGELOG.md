# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.0] - 2026-03-11

### Added

#### 核心功能
- 实现命令执行引擎
- 实现 13 个核心命令
  - 日常管理类：/context, /today, /closeday, /schedule
  - 深度思考类：/trace, /connect, /challenge, /ghost
  - 灵感挖掘类：/ideas, /graduate, /drift, /emerge
  - 规划基础类：/sync

#### 模板系统
- 实现模板系统
- 内置 4 个核心模板
  - 每日计划模板
  - 每日复盘模板
  - 项目规划模板
  - 周报模板

#### Master Control
- 实现 Master Control 机制
- 项目管理和任务跟踪
- 自动上下文同步
- 项目发现和状态更新

#### 智能功能
- 实现智能建议功能
  - 艾森豪威尔矩阵建议
  - 精力管理建议
  - 任务优先级建议
- 实现智能提醒功能
  - 任务提醒
  - 截止日期提醒
- 实现智能洞察功能
  - 工作模式分析
  - 效率趋势分析
  - 改进建议

#### 高级功能
- 实现文件关系图谱
- 实现个性化建议
- 实现智能预测
- 实现工作流优化

#### 用户界面
- 三栏布局设计
  - 文件浏览器
  - 代码编辑器
  - AI 对话面板
- 文件打开和保存功能
- 实时文件同步
- 命令快捷按钮
- 智能功能按钮

#### AI 集成
- 集成智谱AI API
- JWT token 认证
- 自然语言处理
- 内容生成
- 文件操作支持

#### 开发工具
- TypeScript 类型系统
- Vite 构建工具
- Vitest 测试框架
- ESLint 代码检查
- 代码分割和优化

#### 文档
- 用户手册
- 开发者文档
- 产品愿景文档
- 错误记录文档
- 用户测试计划
- 产品决策文档

### Changed

- 优化构建配置
  - 添加代码分割
  - 优化依赖预编译
  - 提高构建速度
- 优化 Electron 配置
  - 添加 path 模块支持
  - 改进 IPC 通信
  - 增强安全性

### Fixed

- 修复文件路径重复问题
- 修复 AI 生成虚假成功消息问题
- 修复编辑器保存功能缺失问题
- 修复 TypeScript 类型错误
- 修复 API Key 格式问题
- 修复端口冲突问题
- 修复模块导入错误
- 修复 Vite 构建警告

### Performance

- 构建时间优化：10.45s → 8.98s
- 代码分割：6 个 chunk
- 依赖预编译优化
- 热更新速度提升

### Security

- 实现 contextBridge 安全隔离
- 暴露安全的 API 给渲染进程
- 验证 API Key 格式
- 添加错误处理和日志记录

### Product Decisions

- **产品形态**：独立 Electron 桌面应用（非 Obsidian 插件）
- **AI 服务**：智谱AI API（非 Claude API）
- **构建工具**：Vite（非 esbuild/rollup）

### Note

- 代码层面功能已实现，但实际测试未完成
- 需要用户实际测试所有功能
- 需要完成边界测试和兼容性测试

---

## [Unreleased]

### Planned

- [ ] 用户测试和反馈收集
- [ ] 性能优化和内存优化
- [ ] 更多模板和主题
- [ ] 插件系统
- [ ] 云同步功能
- [ ] 移动端支持
- [ ] 多语言支持
- [ ] 更多 AI 模型支持

---

## 版本说明

### 版本号格式

Metamates 遵循语义化版本规范 (SemVer)：

- **主版本号**：不兼容的 API 修改
- **次版本号**：向下兼容的功能性新增
- **修订号**：向下兼容的问题修正

### 版本类型

- **Major**：重大更新，可能包含不兼容的更改
- **Minor**：功能更新，向后兼容
- **Patch**：错误修复，向后兼容
- **Alpha**：内部测试版本
- **Beta**：公开测试版本
- **RC**：候选发布版本

---

## 更新指南

### 从 0.0.x 升级到 0.1.0

1. 备份你的工作区
2. 下载新版本安装包
3. 运行安装程序
4. 启动 Metamates
5. 重新配置 AI 服务（如果需要）

### 配置迁移

0.1.0 版本会自动迁移旧版本的配置，但建议手动检查：

- AI 配置
- 工作区路径
- 用户偏好设置

---

## 反馈和问题

如果你遇到任何问题或有任何建议，请：

1. 查看 [用户手册](USER_MANUAL.md)
2. 查看 [开发者文档](DEVELOPER_GUIDE.md)
3. 提交 Issue 到 GitHub
4. 联系 support@metamates.com

---

> Metamates Changelog
> 最后更新：2026-03-11

---
name: sync
description: 系统同步 - 扫描全库进展，复盘今日并自动更新 Master_Control.md
allowed-tools: Read, Write, Glob, Grep
---

# 🔄 系统同步 (Sync)

请执行以下任务：

1. **扫描今日活动**：读取今日日记和相关文件，了解今天的进展
2. **读取 Master_Control**：查看 `05_模板与配置/Master_Control.md` 当前状态
3. **识别核心进展**：总结今天完成的重要工作、产生的想法
4. **更新 Master_Control**：根据 Metamates 协议，更新 Master_Control.md 文件

## 更新内容应包括
- 📊 核心目标进展
- ⏱️ 微观时间块记录
- 🎯 战略提醒
- 📈 全局进度

## 输出格式
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔄 系统同步完成
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📅 同步时间：[日期时间]

📊 今日进展摘要
- [进展1]
- [进展2]

✅ Master_Control.md 已更新
- 新增内容：[说明]
- 更新内容：[说明]
```

**重要**：更新后必须读取 Master_Control.md 验证修改正确。

---
**协议来源**: Metamates CODEBUDDY.md

## 记忆与 Vault 边界（Metamates 强制）

- 用户可读的长期记忆须镜像到 `04_情报与连接/记忆索引.md`（详细条目放 `04_情报与连接/参考/`）
- **禁止**只写入 `~/.codebuddy`、CLI 项目缓存或其它 Vault 外路径
- 本命令若要求写回：必须使用 Write/编辑工具落盘，并在写后 **Read 验证**（Act & Verify）

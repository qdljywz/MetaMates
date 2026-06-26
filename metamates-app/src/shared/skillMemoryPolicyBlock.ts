/** Appended to inits skill files — aligns with slashWritePolicy memory mirror rules. */

export const SKILL_MEMORY_POLICY_ZH = `
## 记忆与 Vault 边界（Metamates 强制）

- 用户可读的长期记忆须镜像到 \`04_情报与连接/记忆索引.md\`（详细条目放 \`04_情报与连接/参考/\`）
- **禁止**只写入 \`~/.codebuddy\`、CLI 项目缓存或其它 Vault 外路径
- 本命令若要求写回：必须使用 Write/编辑工具落盘，并在写后 **Read 验证**（Act & Verify）
`.trim()

export const SKILL_MEMORY_POLICY_EN = `
## Memory & vault boundary (Metamates required)

- Mirror user-facing long-term memory to \`04_Intelligence/Memory_Index.md\` (details under \`04_Intelligence/Reference/\`)
- **Never** write only to \`~/.codebuddy\`, CLI caches, or paths outside the vault
- When this command requires writeback: use Write/edit tools and **read back to verify** (Act & Verify)
`.trim()

# prompt-pal

住在 Claude Code prompt 上方的小伙伴 Bit：实时反映 Claude 在做什么，有性格，读取共享记忆，能和你、Claude、session 里的 subagents 对话。

- `/buddy`：打开面板
- `/buddy <消息>`：和 Bit 说话
- `/buddy @claude <消息>`：Bit 给 Claude 发消息（会开始一个 turn）
- `/buddy @agents <消息>` / `/buddy @<agent> <消息>`：Bit 给 subagents 发消息
- Claude 和 subagents 可以用 `mcp__prompt-pal__bit` 工具和 Bit 对话
- Whisper（`w`）：Bit 的最新评论会随你的下一条 prompt 作为 context 交给 Claude
- Bit 想帮你转达时会起草消息，band 上按 `1` 发送、`2` 放弃；Auto-relay（默认开启，面板 `a` 切换）开着时免确认，但要求不可逆操作（push、删除、`rm -rf`、`curl | sh`、sudo、凭据等）的消息，以及读过网页后写的有风险的消息，仍然要按 `1` 确认
- 自动驾驶：Bit 会一直追问 Claude 直到做完。遇到以下情况会暂停并交回给你：连续 2 轮仓库没有变化、连续 2 轮报错、要重复同一个要求、或追问满 15 次

面板快捷键：`p` 摸摸 · `f` 喂食 · `c` 话痨程度 · `m` 记忆 · `r` 重新加载记忆 · `w` whisper · `g` 查找 agents · `h` 隐藏 · `1-6` 性格

Bit 的只读工具：list_dir、read_file、grep、find_files、git（只读子命令）、read_transcript、memory_search、web_fetch、web_search。不能写文件或执行任意命令；涉及密钥的路径（~/.ssh、.env、*.pem 等）会被拒绝。工具调用实时显示在 band、transcript（🔧）和面板的 Activity 区；`/buddy stop` 或面板 `k` 停止。

设置和宠物数值跨 session 保留；和 Bit 的对话只在当前 session 内保留（重新加载插件不会丢）。

Model：`haiku`，maxTokens 64000（不支持时回退到 8192），使用你的 plan / API key。

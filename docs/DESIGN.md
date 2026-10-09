# prompt-pal (Bit) 架构重构设计

状态：草案，待审阅。本文只是设计，还没有改任何代码。

## 1. 目标与非目标

**目标**
- **完全自动驾驶**：Bit 代表用户驱动 Claude 把事情做完，只在遇到重大问题时停下来问用户（见 3.5、3.6）。
- 把 1359 行的 `register.js` 拆成职责清晰、可单测的模块，行为保持不变。
- 让安全边界写在代码里强制执行，而不是只靠 prompt 约束。
- 解决并发与状态问题：多个 model 调用互相干扰、hot reload 丢状态、每 400ms 全量重绘。
- 降低每个 turn 的 haiku 调用成本。

**非目标**
- 不改 Bit 的产品形态（band、pane、`/buddy` 命令、6 种性格、宠物数值）。
- 不给 Bit 写文件或执行任意命令的能力。

## 2. 现状问题（带证据）

| # | 问题 | 位置 | 后果 |
|---|---|---|---|
| P1 | **`grep` 能读到密钥文件**：`DENY_PATH` 只检查 grep 的根目录，不检查递归进去的子目录 | `register.js:438-445` | `grep {"pattern":"PRIVATE KEY","path":"~"}` 会返回 `~/.ssh/id_rsa` 的内容；项目里 `.env` 的内容也照样返回。`SECRET_RE` 只能遮住几种 token 格式，私钥、密码都遮不住 |
| P2 | **Prompt 注入能经 relay 传到 Claude**：Bit 用 `web_fetch` 或读文件拿到不可信内容后，可以产出一行 `RELAY:`，`autoRelay` 打开时直接发给 Claude | `844-860` | 网页里埋的指令会以"用户伙伴"的身份发给 Claude，并在用户的权限模式下执行 |
| P3 | **「不批准不可逆操作」只写在 prompt 里** | `766` | 是否遵守全看 haiku；代码层面不拦截 |
| P4 | **`autoRelay` 的默认值迁移会覆盖用户保存的设置**（`autoRelayDefaultV`）。默认开启本身没问题 | `967` | 用户之前关掉的 auto-relay 会被悄悄重新打开 |
| P5 | **并发状态是全局共享的**：`stopRequested`、`thought`、`activity` 全局只有一份；`think()` 一开始就把 `stopRequested` 重置为 false，`finally` 里又把 `activity` 清空 | `621, 649-650` | review 和 talk 同时跑时：用户按 stop 会被另一个调用抹掉；activity 显示错乱 |
| P6 | **靠字符串匹配判断哪个 turn 是 Bit 发起的**：`BIT_MARK` 子串检测，加上 `.then` 里设置 `pendingBitTurn` | `858, 1018` | 用户粘贴的文本里恰好包含 `BIT_MARK` 就会被误判；两处同时设置有竞态 |
| P7 | **约 40 个模块级 `let`** | `67-115, 194-204, 350-353` | hot reload 后 intent、记忆、chat 状态全部丢失；也没法单测 |
| P8 | **每 400ms 无条件重绘一次** `ui.render` | `973-977` | 空闲时也在持续重绘 band 和 pane |
| P9 | **三套各自解析的文本协议**：`TOOL`、`RELAY`、`INTENT/VERDICT/RELAY/ASK` | `565, 720, 823` | 三个正则各有边界情况，没有测试 |
| P10 | **成本**：每个 turn 都跑一次 review，最多 40 步工具调用，system prompt 每次重建、没有走 prompt cache | `626, 1087` | 长 session 里 haiku 调用量很大 |
| P11 | **cwd 来源不一致**：记忆用 `PWD`，工具用 `$.session.cwd()` | `236` vs `379` | 两边看到的可能不是同一个项目 |

## 3. 目标架构

### 3.1 分层

```
hooks/register.ts          薄适配层：只把事件转发给下面各层，不放业务逻辑
  │
  ├─ state/                $.state atoms（session 级）+ $.store（设置与统计）
  ├─ brain/                Job 调度、model 调用、回复协议解析
  ├─ tools/                工具注册表 + 安全层（guard）
  ├─ review/               review / relay 状态机
  ├─ comms/                与 Claude、subagents 通信（relay、send、answerCaller）
  ├─ memory/               记忆加载与召回
  └─ ui/                   band、pane，纯渲染，只读 state
```

依赖方向是单向的：`ui → state ← review/comms → brain → tools/memory`。`ui` 只读 state 和派发 action，不直接调用 brain。

已确认的平台能力：mod 支持 `.ts/.tsx`，可以 `import` 插件内其他文件（不支持动态 `import()`）；`$.state` 提供 `atom` / `update` / `read`，并有类型 contract；`claude plugin test` 可以跑 `*.test.ts`；`$.model.complete` 支持 `signal`（中途取消）、prompt cache 标记和 `effort`，但**不支持原生 tool use**，所以文本协议保留，只是统一成一套。

### 3.2 State

- **session 状态**放进 `$.state`，在 `types/index.d.ts` 的 `PluginState['prompt-pal']` 里声明。包括 `mood`、`speech`、`intent`、`userRequests`、`review`（状态机）、`jobs`（进行中的任务）、`pendingRelay`、`agents`。好处：hot reload 不丢；写入后只重绘读了它的组件（解决 P7、P8）。
- **持久数据**拆成两个 `$.store` key：
  - `settings`：persona、chattiness、开关项。带 `schemaVersion` 做显式迁移，**不覆盖用户已经设过的值**（解决 P4）。
  - `pet`：xp、energy、affection、计数。
- chat 记录只放 session state，不再跨 session 持久化，避免 transcript 内容长期存在 store 里。
- 动画帧单独一个 `frame` atom：只在 `busy || jobs.length > 0` 时由 `$.clock.every` 推进，空闲时停掉。

### 3.3 Brain：Job 调度

每次调用 model 都是一个 Job：

```ts
type Job = {
  id: string
  kind: 'talk' | 'caller' | 'review' | 'remark' | 'compose'
  audience: Audience
  budget: { steps: number; ms: number; effort: ModelEffort }
  controller: AbortController          // stop 只取消这一个 job
  taint: Set<'web' | 'file' | 'transcript'>   // 本次用过的不可信数据源
  activity?: { tool: string; label: string; startedAt: number }
  thought?: string
}
```

- **调度规则**：`talk` / `caller` 立即执行；同一时间最多一个 `review`；如果已有 job 在跑，新的 `remark` 直接丢弃。每个 job 有自己的 `activity` 和 `thought`（解决 P5）。
- **预算按 kind 区分**：`remark` 不给工具、`effort: 'low'`；`review` 最多 8 步；`talk` / `caller` 最多 20 步。原来的 40 步只保留为绝对上限。
- **prompt cache**：system prompt 拆成两块。不变的部分（身份、性格、规则、`TOOL_DOCS`）标 `cache: true`；会变的部分（记忆片段、最近一条 prompt）放后面（解决 P10）。
- **review 触发条件**：Bit 发起的 turn 一定 review，这是自动驾驶闭环的核心。用户发起的 turn 只在 Claude 改了文件或执行了命令、或者答复里有未完成的迹象（提问、"next steps"、报错）时才 review。纯问答类 turn 跳过（解决 P10）。不在用户 turn 上开 review 的话，闭环就永远启动不了，所以不能完全不 review 用户 turn。

### 3.4 统一回复协议

用一个 parser 处理所有带标签的行：

```
<给人看的正文>
TOOL {"name": "...", "args": {...}}      ← 出现时必须是最后一行，其余标签忽略
INTENT: ...
VERDICT: done | follow_up | ask_user
RELAY[ @target]: ...
ASK: ...
```

`parseReply(text) → { visible, tool?, intent?, verdict?, relay?, ask? }`，是纯函数，并配一组表驱动测试，覆盖代码块包裹、多行 RELAY、JSON 损坏、标签大小写等情况（解决 P9）。

### 3.5 工具与安全层

**工具注册表**：每个工具一条记录，以后新增工具只改一处：

```ts
type ToolDef = { name; doc; mood; label(args): string; run($, args, ctx): Promise<string>; taint?: 'web'|'file'|'transcript' }
```

原代码注释说过「Static dispatch, so claude plugin validate can trace every mods API call」。表里每个 `run` 都是字面量函数引用，理论上仍可静态追踪；**实施第一步先用 `claude plugin validate` 确认这一点**，追踪不到就保留 `switch` 分发，由注册表生成。

**Guard**（全部在代码里强制执行）：
1. **路径**：`resolvePath` 之后做两项检查。(a) 目标本身不能命中 `DENY_PATH`。(b) 递归类工具（`grep`、`find_files`）的根目录不能是 deny 目录的祖先：根目录是 `$HOME` 或 `/` 时直接拒绝，并且一律加上 `--exclude-dir=.ssh --exclude-dir=.aws …` 和 `--exclude=.env* --exclude=*.pem …`；GNU grep 的 `-R` 会跟随 symlink，统一改成 `-r`（解决 P1）。
2. **输出脱敏**：在 `SECRET_RE` 之外，再加 PEM 块（`-----BEGIN … PRIVATE KEY-----`）、`password=` / `token=` 这类赋值的匹配。
3. **Relay 策略**（自动驾驶的"刹车"）：发出 relay 前统一走 `relayPolicy(relay, job)`，返回 `auto | confirm | block`。默认是 `auto`，只有重大问题才停：
   - **不可逆或对外操作** → `confirm`。判断依据是 relay 文本命中词表：push、merge 进主分支、`rm -rf` / 删除文件或分支、reset --hard、force、改写历史、deploy、publish、发送消息、付款、动凭据（解决 P3）。
   - **被污染的风险请求** → `confirm`，`autoRelay` 开着也一样：job 读过网页（`taint` 含 `web`），且 relay 命中风险词表（push、删除、curl/wget、`| sh`、安装依赖、sudo、凭据等）。普通的、基于网页信息的 follow-up 照常 `auto`，但末尾附上一句"网页来源内容不可信"的说明（解决 P2，同时不打断自动驾驶）。已在 `register.js` 实现（`RISKY_RELAY`、`WEB_NOTE`）。
   - **停滞** → `block`，交回用户（见 3.6 的停滞检测）。
   - 其余情况：`autoRelay` 开（默认）就 `auto`，关就 `confirm`。
4. `autoRelay` **默认开启**。只对从没设置过的用户写入默认值，用户明确关掉的保留（解决 P4）。
5. Claude 收到 relay 后仍按用户自己的权限模式执行。Claude Code 自身的权限提示是最后一道防线，Bit 不会替用户点批准。

### 3.6 Review / relay 状态机

```
            turn.complete(user turn, 需要 review)
 Idle ───────────────────────────────────────▶ Reviewing
  ▲                                              │
  │◀──── done ───────────────────────────────────┤
  │◀──── ask_user ──▶ AwaitUser ──(用户发言)──▶ Idle
  │                                              │ follow_up
  │                                              ▼
  │                                        RelayPending ──(confirm 被拒)──▶ Idle
  │                                              │ 发送（auto / 用户确认）
  │                                              ▼
  └──────────(followUps ≥ 3 / abort)──────── BitTurn(id) ──turn.complete──▶ Reviewing
```

- **怎么认出 Bit 发起的 turn**：`$.prompt.submit` 返回后，记下 Bit 的 `relayId`。`prompt.submit` hook 里只认 Bit 自己记录过的、尚未消费的那一条，按精确文本加 id 匹配，不再做子串检测（解决 P6）。
- **何时重置**：用户发言时 `followUps = 0`；用户 abort 时回到 Idle。
- **停滞检测代替固定的 3 次上限**：要做完整任务，3 次太少。改成满足以下任一条件就暂停交回用户：
  - 连续 2 轮 follow-up 没有进展，即 `git diff --stat` 和失败的测试或报错都没变化；
  - relay 内容和上一条基本相同（同一个要求说了两遍）；
  - 硬上限 `MAX_FOLLOW_UPS = 15`；
  - 连续 2 个 turn 报错，或被 refusal 结束。
- **`ask_user` 只用于重大问题**：review prompt 改成"有合理默认值就自己定，并在 RELAY 里说明假设"。只有以下情况才 `ask_user`：意图存在根本歧义、方案取舍需要用户做产品决策、涉及不可逆操作、预算或范围明显超出原始请求。
- **完成通知**：自动驾驶跑完（verdict `done`，且这一串里至少有一次 Bit 发起的 turn）或暂停时，用 toast 给出一行摘要：做了什么、停在哪、为什么停。
- 状态机写成纯函数 `next(state, event) → [state, effects[]]`，effects 交给 comms / brain 执行，可以直接单测。

### 3.7 Memory

- cwd 统一用 `$.session.cwd()`（解决 P11）。
- 召回算法维持 token overlap 不变；`memory_search` 工具和 `recall()` 共用同一个打分函数。原来是两套略有差异的实现。
- 记忆只读这一条不变。

### 3.8 UI

- band 和 pane 都只读 atoms，交互只派发 action（`update($, atom, fn)`），不在闭包里捕获渲染当时的值。
- pane 拆成多个 section 组件：Header/Stats、Controls、Memory、Personality、Activity（列出所有进行中的 job，每个都能单独 Stop）、Intent/Review、Claude & agents、Conversation。
- 快捷键保持不变。

## 4. 目录结构

```
prompt-pal/
  .claude-plugin/plugin.json      + "types": "./types/index.d.ts"
  types/index.d.ts                PluginState contract
  hooks/
    hooks.json                    { "modules": ["./register.ts"] }
    register.ts
    state/{atoms,settings,pet}.ts
    brain/{jobs,model,prompt,protocol}.ts
    tools/{registry,guard,redact,fs,git,web,session}.ts
    review/{machine,prompt}.ts
    comms/{claude,agents,caller}.ts
    memory/{load,recall}.ts
    ui/{band,pane,sections/*}.tsx
  tests/*.test.ts
```

## 5. 迁移步骤

每一步都能单独发布，每步结束都跑 `claude plugin validate ./prompt-pal`、`tsc -p prompt-pal` 和 `claude plugin test ./prompt-pal`。

1. **安全修复先行**：P1 grep guard、P2/P3 relay policy、P4 不覆盖用户设置。先直接改在现有 `register.js` 里，因为这几项不该等重构。
2. 换成 TS，加 `types/` 和 tsconfig；把纯函数（protocol、guard、redact、recall、helpers）抽到独立文件并补测试。
3. 工具注册表，同时验证 validate 能否静态追踪。
4. 把 State 迁到 `$.state` / `$.store` 拆分，带设置迁移。
5. Job 调度，替换 `talking`、`stopRequested`、`activity` 这几个全局变量。
6. 实现 review 状态机和 relay 的 id 关联。
7. 拆分 UI，去掉全局 tick。
8. 成本优化：prompt cache、按 kind 的 budget、review 触发条件。

## 6. 测试策略

- **纯函数单测**：`parseReply`、`guard`（覆盖 deny 列表、祖先目录、symlink、`..` 路径）、`redact`、`relayPolicy`、review 状态机、`recall`。
- **集成测试**（`claude plugin test`）：mock `$.model.complete`，回放 TOOL → RESULT → 最终答复的流程；用 `ui.mount` 在 `terminal` 和 `desktop` 两个 surface 上测 pane 的快捷键。
- **回归用例**：上面每个 P# 至少对应一个测试。

## 7. 已定决策

1. `autoRelay` 默认开启，但不覆盖用户明确的设置。
2. review 以 Bit 发起的 turn 为主；用户发起的 turn 只在有改动或明显没做完时才 review（3.3）。
3. 目标是完全自动驾驶，只在重大问题时暂停（3.5 的 relay 策略、3.6 的停滞检测和 `ask_user` 收紧）。

## 8. 仍待确认

1. chat 记录不再跨 session 持久化（默认按此执行）。
2. 第 1 步的安全修复：P1（含 symlink，`resolvePath` 用 `$.fs.stat` 解析真实路径）、P2、P3（`IRREVERSIBLE_RELAY`）、P4 已完成（2026-10-08）。
3. `read_file` 等文件工具**不限制**在项目根目录内（用户 2026-10-08 决定），只靠 secret 路径 deny list 加 symlink 解析把关。
4. 第 5 步（Job 调度）和第 6 步（自动驾驶 review：停滞检测、硬上限 15、`turn.start` 按精确文本识别 Bit 的 turn、按需 review、完成或暂停时 toast）已完成（2026-10-08），实现留在 `register.js` 里，还没拆模块。另外发现：插件自己调用 `$.prompt.submit` 时不会经过自己的 `prompt.submit` hook，3.6 的关联方案因此改在 `turn.start` 里做。
5. 其余步骤也已完成（2026-10-08）：第 2 步（纯函数拆到 `hooks/lib/*.ts`，strict TS，`tsc` 通过；`register.js` 仍是 JS）、第 3 步（`TOOLS` 注册表；分发保留静态 `callTool` switch，因为 validate 不允许把 `$` 传给运行时选出的函数）、第 4 步（`$.store` 拆成 `settings` / `pet`，会话状态快照放进 `$.state`，hot reload 后恢复）、第 7 步（pane 拆成 section 函数；空闲时约每 5s 重绘一次）、第 8 步（system prompt 拆成可缓存的固定块和变化块，tool loop 的 prompt 前缀可缓存，remark / compose 使用 low effort）。另外：whisper 和 `mcp__prompt-pal__bit` 回复里的 web 内容会附加 `WEB_NOTE`；只跑测试、带来新结果的轮次不再算停滞；`turn.start` 也能识别被包装过的 Bit 文本；修了一个旧漏洞：`git remote add/remove/set-url/rename` 原来可以执行。
6. 设计里剩下的两项也已完成（2026-10-08）：`register.js` 已转成 strict TS（`register.ts`）；autopilot 已改写成纯函数状态机（`hooks/lib/autopilot.ts`，`step(state, event) → [state, effects]`）。API 类型固定在仓库根目录 `typings/` 下的一份拷贝，`tsc -p prompt-pal` 可以直接运行。转 TS 时发现 `list_dir` 一直没给目录加 `/`（它判断的 `kind` 值是 `'directory'`，API 实际是 `'dir'`），已修复。

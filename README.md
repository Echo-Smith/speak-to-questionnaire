# 语音问卷助手 Speak-to-Questionnaire

开源的问卷**语音作答**浏览器插件：朗读题目、开口作答、说"下一题"流转。
为打字困难的人群（视障用户、老年人）和不想逐题点选的所有人设计。

**核心特性**

- 🗣 **说话即作答**：念出选项（"B" / "第二个" / "城市"）即完成选择
- ⏭ **说话即流转**：单选说完自动进入下一题；多选说完停留，说"完成"才走；说"上一题"随时回退；"重复"重听题目；"跳过"略过
- 📖 **题目朗读**：TTS 读题 + 读选项，与作答联动
- ✍️ **论述题听写**：开口说，说"结束作答"完成；配置 LLM 后可一键整理成书面语（**先预览、可编辑、可改回原文，原始口述始终保留**）
- 🔑 **BYOK**：LLM 完全由用户自备（任意 OpenAI 兼容接口：OpenAI / DeepSeek / Moonshot / Ollama…），插件本身不内置、不经手任何 Key
- 🔒 **规则兜底**：不配置 LLM 也能用——指令识别和选项匹配全部本地完成

当前适配平台：**问卷星**（wjx.cn / wjx.top / sojump.com）。

---

## 安装（开发者模式）

1. 下载本仓库，得到目录（含 `manifest.json`）
2. Chrome / Edge 打开 `chrome://extensions`
3. 右上角开启「开发者模式」→「加载已解压的扩展程序」→ 选择本目录
4. 打开任意问卷星问卷页面，右下角出现「语音问卷助手」面板
5. 点击 🎙 麦克风（首次会请求麦克风权限）开始作答

## 配置 LLM（可选）

插件图标 → 设置页：

- **接口协议**：`OpenAI 兼容`（/v1/chat/completions）或 `Anthropic 兼容`（/v1/messages），可对接 Dots 等聚合平台与 Claude 系模型
- **鉴权方式**：自动 / `Authorization: Bearer` / `api-key` 头 / `x-api-key` 头（Dots 平台用 `api-key`，Anthropic 官方用 `x-api-key`，"自动"会同时带上两种头以兼容）
- **Base URL**：填到 `/v1` 或域名根均可（自动补全）
- **API Key**：你的 Key（仅存本地 `chrome.storage.local`，不经过任何第三方服务器）
- **模型名**：如 `deepseek-chat` / `claude-sonnet-4-5` / `dots3-note-prev`

点「测试连通性」验证。LLM 用于：模糊口述的选项归一（"我觉得还是城里吧" → 选"城市"）、论述题书面整理。请求由插件后台直连你填的服务，与本项目作者无关。

## 语音识别（ASR）：自动选择 + 优先级

默认 `auto` 模式按页面环境自动构建引擎链，失败自动逐级降级：

| 页面环境 | 引擎链（browser-first 默认） |
|---|---|
| **https** | 浏览器内置识别（页面内，零配置低延迟）→ 自备转写服务 → LLM 多模态 → 扩展内置识别 |
| **http** | 自备转写服务 → LLM 多模态 → **扩展内置识别**（http 页面不允许页面访问麦克风，识别在扩展的 offscreen 安全上下文完成，故 http 问卷同样可用） |

可在设置页切换优先级为 `service-first`（自有转写服务优先），或显式固定某种引擎。链上任一引擎在产出第一条结果前失败，自动切换下一引擎并在面板提示。

| 引擎 | 适用场景 | 配置 |
|---|---|---|
| 浏览器内置 | https 页面，零配置 | 无 |
| 自备转写服务 | OpenAI Whisper 形态（/v1/audio/transcriptions），隐私可控/内网部署 | Base URL / Key / 模型（如 whisper-1、groq、faster-whisper-server） |
| LLM 多模态直转写 | 服务无转写端点但模型支持音频输入（audio_url，如 Dots） | 复用 LLM 配置，需 OpenAI 协议 |
| 扩展内置识别 | http 页面的兜底 | 首次在插件弹窗点一次「授权麦克风」 |

本地/内网地址（如自建 Ollama `http://localhost:11434`）默认被拦截（防 SSRF），需在设置页对应条目勾选「允许本地/内网地址」。

## 支持平台

| 平台 | 方式 | 说明 |
|---|---|---|
| 问卷星 wjx.cn / wjx.top / sojump.com | 自动 | 专用适配器 |
| Google Forms（docs.google.com/forms） | 自动 | 专用适配器（role 语义 DOM） |
| 金数据 jinshuju.net、腾讯问卷 wj.qq.com、美团问卷 wenjuan.meituan.com | 自动 | 通用适配器（React 自绘：ARIA role 选项 + Shadow DOM 穿透 + SPA 渲染等待） |
| 其他任意问卷页面 | popup「在本页启用」 | 通用适配器按需注入（SPA 站点可随时重按，自动重探题目；activeTab 授权随导航过期时重按一次图标即可） |

**通用适配器（experimental）**：识别标准表单结构——radio/checkbox 按 name 分组、select、textarea/text。支持向导式多步表单（存在"下一步/继续"类按钮即按分步处理，答完当页自动翻步，"上一步"可回退）。题干提取按 `label[for] > fieldset legend > aria-label > 临近标题` 的顺序启发式判断，识别不准的页面欢迎提 issue 附 DOM 片段，或按下面"架构"一节写个专用适配器（通常 100 行以内）。

## 语音指令

| 指令 | 作用 |
|---|---|
| 下一题 / 下一个 | 进入下一题 |
| 上一题 / 返回 | 回退（跨页问卷自动翻回） |
| 重复 / 再说一遍 | 重听当前题目 |
| 跳过 | 不作答直接下一题 |
| 完成 / 好了 | 多选确认后进入下一题 |
| 提交 / 交卷 | 答完最后题后提交 |
| 停止朗读 / 别读了 | 打断题目朗读 |
| 结束作答 / 说完了 | 论述题听写结束（听写中只有这些词生效，防止正文误触发） |

## 支持题型

| 题型 | 状态 | 交互 |
|---|---|---|
| 单选 | ✅ | 说选项即写入并自动下一题（可设置关闭） |
| 多选 | ✅ | 说选项追加/取消，说"完成"进入下一题 |
| 填空/论述 | ✅ | 听写模式，"结束作答"收尾，预览后写入 |
| 下拉 | ✅ | 同单选 |
| 量表 | ⚠️ 实验性 | 同单选 |
| 矩阵/排序/上传 | ❌ | 提示手动作答后说"下一题" |

## 架构

```
问卷页面（问卷星 DOM）
  → 平台适配器 adapters/wjx.js     归一化为统一题目模型 canonical.js
  → 语音交互引擎 voice-engine.js    指令/答案状态机
       ├─ createASR 调度  语音识别（auto：按页面协议自动选链，recorder.js）
       │    └─ offscreen 文档：麦克风与识别在扩展安全上下文（http 页面可用）
       ├─ tts.js   题目朗读（speechSynthesis）
       ├─ matcher.js 规则匹配（本地兜底）
       └─ llm.js → background → llm-protocols.js（openai / anthropic 可插拔协议适配）
  → 答案写回：合成真实 DOM 事件，平台自身校验/逻辑跳转照常工作
```

**开发一个新平台适配器**：在 `src/content/adapters/` 新建文件，实现 `probe() -> survey`，把页面 DOM 解析成 `STQ.createQuestion` 统一模型并在 `manifest.json` 的 `content_scripts` 中注册即可。语音引擎无需改动。

## 隐私

- 语音识别使用浏览器内置能力（Chrome 系由浏览器厂商的语音服务处理）
- API Key 仅存本地；LLM 请求只发往你自己填写的地址
- 插件不上传、不收集任何问卷数据
- 注意：在公开场合使用语音作答前，请留意周围环境

## 已知限制与路线图

- [ ] 问卷星矩阵题、排序题
- [ ] 腾讯问卷 / 金数据 / Google Forms 适配器
- [ ] 档案库自动填（授权制个人资料库）
- [ ] 完全本地 ASR（whisper-wasm）作为隐私选项
- [ ] Chrome Web Store 上架

欢迎 PR，尤其是新平台适配器。

## License

MIT

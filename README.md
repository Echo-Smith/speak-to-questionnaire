<p align="center">
  <img src="icons/icon256.png" width="96" alt="Speak-to-Questionnaire">
</p>

<h1 align="center">Speak-to-Questionnaire 语音问卷助手</h1>

<p align="center">
  <a href="README.md">English</a> | <a href="README.zh-CN.md">中文</a>
</p>

<p align="center">
  <a href="https://github.com/Echo-Smith/speak-to-questionnaire/actions/workflows/ci.yml"><img src="https://github.com/Echo-Smith/speak-to-questionnaire/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/Echo-Smith/speak-to-questionnaire/releases/latest"><img src="https://img.shields.io/github/v/release/Echo-Smith/speak-to-questionnaire?label=latest" alt="Latest release"></a>
  <a href="https://github.com/Echo-Smith/speak-to-questionnaire/blob/main/LICENSE"><img src="https://img.shields.io/github/license/Echo-Smith/speak-to-questionnaire" alt="MIT License"></a>
  <img src="https://img.shields.io/badge/BYOK-bring%20your%20own%20key-168b5b" alt="BYOK">
  <img src="https://img.shields.io/badge/UI-React%20%2B%20shadcn%2Fui-168b5b" alt="React + shadcn/ui">
</p>

An open-source browser extension for **voice-driven survey answering**: it reads questions aloud, you speak your answers, and say "next question" to move on.
Built for people who have difficulty typing (visually impaired users, the elderly) — and anyone who'd rather talk than click through a form.

**Core features**

- 🗣 **Speak to answer** — say an option ("B" / "the second one" / "City") and it's selected
- ⏭ **Speak to navigate** — single-choice auto-advances; multi-choice stays until you say "done"; "previous question" anytime; "repeat" to hear a question again; "skip" to pass
- 🎯 **Current-question highlight** — the active question is framed on the page: amber while reading, green pulsing while listening, orange on errors
- 📖 **Question read-aloud** — TTS reads questions and options; interrupt by clicking the mic (or turn reading off with the 🔊 toggle)
- ✍️ **Essay dictation** — speak freely, finish with "end of answer"; optionally have an LLM polish it into written prose (**preview first, editable, original speech always preserved**)
- 🔑 **BYOK** — bring your own LLM (any OpenAI-compatible or Anthropic-compatible API: OpenAI / DeepSeek / Moonshot / Ollama…). The extension never ships or touches your keys
- 🔒 **Works without an LLM** — command recognition and option matching run entirely locally

Currently supported platform: **WJX/问卷星** (wjx.cn / wjx.top / sojump.com), plus Google Forms and generic form pages (see [Supported platforms](#supported-platforms)).

---

## Installation

### Option 1: download a ready-made build (recommended)

1. Grab the latest `speak-to-questionnaire-vX.Y.Z.zip` from the [Releases page](https://github.com/Echo-Smith/speak-to-questionnaire/releases)
2. Unzip it into a **fixed directory** (don't use a temp folder — the extension references that directory)
3. Open `chrome://extensions` in Chrome/Edge (`edge://extensions` in Edge)
4. Enable **Developer mode** (top-right toggle)
5. Click **Load unpacked** and select the unzipped folder **containing `manifest.json`**
6. Pin the extension to the toolbar (puzzle icon → pin "Speak-to-Questionnaire")

> Until it's published to the Chrome Web Store, this loads in developer mode. Chrome may ask to disable developer-mode extensions on startup — choose to keep it.

### First run: 3 steps

| Step | Action | Notes |
|---|---|---|
| ① Grant microphone | Click the extension icon → "Microphone / Settings →" → click **🎤 Grant microphone** | Grants mic access to **the extension itself** (recognition happens inside the extension, unrelated to survey sites). One-time, remembered by the browser. Must be done on the settings page — the popup gets closed by the permission prompt |
| ② Configure a model (optional) | Settings page: Base URL / API Key / model → "Test connection" → **Save** | BYOK: any OpenAI- or Anthropic-compatible service. Skippable — rule-based matching works locally without it |
| ③ Start answering | Open a survey page → click **🎙** on the floating panel | Supported platforms show the panel automatically; for other surveys use "Enable on this page" in the popup |

### Updating

Download the new zip, overwrite the unzipped directory, then click the **Reload** (🔄) button on the extension card in `chrome://extensions`. Settings are preserved.

### Install from source (since v0.6.0 the UI is React + shadcn/ui — build required)

```bash
git clone https://github.com/Echo-Smith/speak-to-questionnaire.git
cd speak-to-questionnaire
npm install
npm run build
# then chrome://extensions → Developer mode → Load unpacked → select the dist/app directory
```

> Don't want Node? Use the pre-built zip from [Releases](https://github.com/Echo-Smith/speak-to-questionnaire/releases) (option 1).

## Development

**Stack**: the UI layer is React 18 + shadcn/ui (Tailwind CSS + Radix primitives) built with Vite; the voice engine and platform adapters stay in dependency-free vanilla JS (directly auditable).

```
src/
├── ui/                 # React UI (shadcn/ui components + three surfaces)
│   ├── components/ui/  # shadcn components (button/input/switch/select/tabs/card/alert…)
│   ├── panel/          # floating panel: rendered inside Shadow DOM, CSS injected via ?inline
│   ├── options/        # settings page (tabs: microphone/LLM/ASR/interaction)
│   ├── popup/          # toolbar popup
│   └── settings-bridge.js  # bridge between React and the vanilla settings layer
├── content/            # voice engine, adapters, focus highlight (vanilla JS)
├── offscreen/          # recording/recognition in the extension's secure context (vanilla JS)
└── background/         # dual-protocol LLM proxy, offscreen lifecycle (vanilla JS)
```

**Commands**:

```bash
npm run dev      # watch both build configs
npm run build    # build and assemble dist/app (a loadable extension directory)
./scripts/release.sh 0.7.0   # release: validate → build → zip → tag → Release
```

See [CHANGELOG.md](CHANGELOG.md) for version history.

**Architecture constraint**: the UI talks to the engine through the imperative `createOverlay()` interface (`setState/setTranscript/setMicOn…`); the engine never imports React, and `settings-bridge.js` is the only way React touches `chrome.storage`. Change the UI without touching the engine, and vice versa.

## Configuring the LLM (optional)

Extension icon → Settings:

- **Protocol**: `OpenAI-compatible` (/v1/chat/completions) or `Anthropic-compatible` (/v1/messages) — works with aggregators like Dots and Claude-family models
- **Auth style**: auto / `Authorization: Bearer` / `api-key` header / `x-api-key` header (auto sends both headers for compatibility)
- **Base URL**: `/v1`-suffixed or bare domain root both work (auto-completed)
- **API Key**: stored only in local `chrome.storage.local`, never sent to any third party
- **Model**: e.g. `gpt-4o-mini` / `deepseek-chat` / `claude-sonnet-4-5`

Click "Test connection" to verify. The LLM is used for fuzzy utterance→option mapping ("I'd say the city one" → selects "City") and essay polishing. Requests go directly from the extension to the service you configured; the authors are not involved.

## Speech recognition (ASR): auto selection with priority

The default `auto` mode builds an engine chain based on the page environment and degrades automatically:

| Page | Engine chain (browser-first by default) |
|---|---|
| **https** | Built-in browser recognition (in-page, zero-config, low latency) → your transcription service → LLM multimodal → extension-side recognition |
| **http** | Your transcription service → LLM multimodal → **extension-side recognition** (http pages can't access the mic, so recording/recognition run in the extension's offscreen secure context — http surveys work too) |

You can switch priority to `service-first` in settings, or pin a single engine. If an engine fails before producing its first result, the chain moves to the next one automatically.

| Engine | Best for | Config |
|---|---|---|
| Built-in browser | **Chrome** + https, zero config (Edge has no built-in speech service — auto-degrades) | none |
| Your transcription service | OpenAI Whisper-style (/v1/audio/transcriptions), privacy-controlled/on-prem | Base URL / key / model (whisper-1, groq, faster-whisper-server…) |
| LLM multimodal | No transcription endpoint but the model accepts audio (audio_url, e.g. Dots) | reuses the LLM config, OpenAI protocol |
| Extension-side recognition | fallback for http pages | click "Grant microphone" once in the popup |

Local/private addresses (e.g. self-hosted Ollama at `http://localhost:11434`) are blocked by default (SSRF protection) — enable "Allow local/private addresses" for that entry in settings.

## Supported platforms

| Platform | Activation | Notes |
|---|---|---|
| WJX 问卷星 wjx.cn / wjx.top / sojump.com | automatic | dedicated adapter |
| Google Forms (docs.google.com/forms) | automatic | dedicated adapter (ARIA-role DOM) |
| Jinshuju, Tencent Survey (wj.qq.com), Meituan Survey (wenjuan.meituan.com) | automatic | generic adapter (React-rendered: ARIA-role options + Shadow DOM piercing + SPA render wait) |
| Any other survey page | popup → "Enable on this page" | generic adapter injected on demand |

**Generic adapter (experimental)**: recognizes standard form structures — radio/checkbox grouped by name, select, textarea/text. Supports wizard-style multi-step forms ("Next"/"Continue" buttons trigger step mode; "Previous" steps back). Question titles are extracted heuristically: `label[for] > fieldset legend > aria-label > nearby heading`. If a page is mis-parsed, open an issue with a DOM snippet — or write a dedicated adapter (~100 lines, see Architecture).

## Voice commands

| Command | Action |
|---|---|
| 下一题 (next question) | advance |
| 上一题 (previous) | go back (flips pages on paginated surveys) |
| 重复 (repeat) | re-read the current question |
| 跳过 (skip) | skip without answering |
| 完成 (done) | confirm multi-choice and advance |
| 提交 (submit) | submit after the last question |
| 停止朗读 (stop reading) | interrupt read-aloud |
| 结束作答 (end of answer) | finish essay dictation (only these phrases work during dictation, to avoid false triggers) |

> Commands are Chinese keywords in this version; English command words are on the roadmap.

## Supported question types

| Type | Status | Interaction |
|---|---|---|
| Single choice | ✅ | speak an option; auto-advances (configurable) |
| Multiple choice | ✅ | speak options to add/remove; say "done" to advance |
| Text / essay | ✅ | dictation; "end of answer" finishes; preview before writing |
| Dropdown | ✅ | like single choice |
| Scale / rating | ⚠️ experimental | like single choice |
| Matrix / ranking / upload | ❌ | prompts to answer manually, then say "next" |

## Architecture

```
Survey page (site DOM)
  → platform adapter adapters/wjx.js    normalizes into the canonical question model (canonical.js)
  → voice engine voice-engine.js        command/answer state machine
       ├─ createASR dispatcher   speech recognition (auto: chain per page protocol, recorder.js)
       │    └─ offscreen document: mic + recognition in the extension secure context (works on http)
       ├─ tts.js   question read-aloud (speechSynthesis)
       ├─ matcher.js  rule matching (local fallback)
       └─ llm.js → background → llm-protocols.js (pluggable: openai / anthropic)
  → answer write-back: real DOM events, so each platform's own validation and branching still work
```

**Writing a new platform adapter**: add a file under `src/content/adapters/`, implement `probe() -> survey` that parses the page DOM into the `STQ.createQuestion` canonical model, and register it in `manifest.json`. No engine changes needed.

## Privacy

- Built-in recognition uses the browser's speech service (Chromium browsers send audio to the vendor's service)
- API keys stay local; LLM/ASR requests go only to the addresses you configured
- The extension never uploads or collects survey data
- Be mindful of your surroundings when answering surveys by voice in public

## Troubleshooting

**The panel never appears**

Check that the current page is a [supported platform](#supported-platforms). On other sites, open the extension popup and click "Enable on this page". If the page was just reloaded, give it a second — content scripts are injected after `document_idle`.

**Clicking 🎙 does nothing, or you're told the microphone isn't available**

The microphone permission is granted to **the extension itself**, not to the survey site, and it has to be done on the settings page (the popup gets closed by the permission dialog). Extension icon → Settings → "🎤 Grant microphone". If you previously dismissed the prompt with "Block", re-allow it under `chrome://extensions` → the extension's card → Details → site access.

**Recognition always fails in Edge**

Edge ships no built-in speech service. Switch ASR to a third-party path in Settings (LLM multimodal transcription, or an external ASR service); Chrome over `https` works with zero configuration.

**Voice commands are misheard**

First confirm you're on an `https` page (some browsers withhold the microphone over plain `http`). Then check whether an LLM is configured — without one, matching is local and rule-based, so only the fixed phrases in the vocabulary are recognized. Short commands like "next" are the most vulnerable to homophones; reduce background noise or use the buttons.

**"Test connection" fails**

Both `https://api.example.com` and `https://api.example.com/v1` work as Base URL — the extension completes it automatically. If it fails, read the HTTP status in the error body: `401/403` means the key or auth style is wrong, `404` usually means a wrong Base URL or model name. On aggregators (Dots, etc.) pick the protocol its docs specify (OpenAI-compatible / Anthropic-compatible).

**Settings vanished after an update**

Settings live in `chrome.storage.local` and survive overwriting the unpacked directory. If they really are gone, the extension ID probably changed — reinstalling, or loading from a different directory, gives a new ID with its own isolated storage.

## Roadmap

- [ ] WJX matrix / ranking questions
- [ ] Dedicated adapters for Tencent Survey / Jinshuju / Google Forms-grade fidelity
- [ ] Profile vault auto-fill (consent-based personal data store)
- [ ] Fully local ASR (whisper-wasm) as a privacy option
- [ ] Chrome Web Store listing
- [ ] English voice commands

PRs welcome — especially new platform adapters.

## License

MIT

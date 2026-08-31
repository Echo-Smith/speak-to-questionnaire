/**
 * 后台 Service Worker：
 * - 代理 LLM 请求（协议可插拔：openai / anthropic，BYOK 全由用户提供）
 * - 代理 ASR 请求（OpenAI 兼容 /audio/transcriptions 上传音频 Blob）
 * - 打开设置页
 */
importScripts('../shared/settings.js', 'llm-protocols.js');

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'stq-open-options') {
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
    return false;
  }

  if (msg && msg.type === 'stq-llm-chat') {
    handleChat(msg.payload)
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: String(e && e.message ? e.message : e) }));
    return true; // async
  }

  if (msg && msg.type === 'stq-asr-transcribe') {
    handleTranscribe(msg.payload)
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: String(e && e.message ? e.message : e) }));
    return true;
  }

  return false;
});

async function handleChat(payload) {
  const settings = await stqLoadSettings();
  const llm = settings.llm;
  const check = stqValidateBaseUrl(llm.baseUrl);
  if (!check.ok) return { ok: false, error: 'LLM 未配置：' + check.error };
  if (!llm.apiKey) return { ok: false, error: 'LLM 未配置：缺少 API Key' };
  if (!llm.model) return { ok: false, error: 'LLM 未配置：缺少模型名' };

  const proto = globalThis.STQ_PROTOCOLS[llm.protocol || 'openai'];
  if (!proto) return { ok: false, error: '未知 LLM 协议：' + llm.protocol };

  const req = proto.buildRequest(settings, payload);
  let res;
  try {
    res = await fetch(req.url, {
      method: 'POST',
      headers: req.headers,
      body: JSON.stringify(req.body),
    });
  } catch (e) {
    return { ok: false, error: '请求失败：' + e.message };
  }

  if (!res.ok) {
    let detail = res.status + ' ' + res.statusText;
    try {
      const body = await res.json();
      if (body && body.error && body.error.message) detail = body.error.message;
      else if (body && body.error && typeof body.error === 'string') detail = body.error;
    } catch (_) { /* ignore */ }
    return { ok: false, error: 'LLM 返回错误：' + detail };
  }

  const data = await res.json();
  const content = proto.parseResponse(data);
  if (!content) return { ok: false, error: 'LLM 返回为空' };
  return { ok: true, content };
}

/**
 * ASR：把音频 Blob 上报到 OpenAI 兼容 /audio/transcriptions（Whisper API 形态）。
 * payload: { blob: Blob(settings 冻结为 {b64, mime}), lang, model, prompt }
 */
async function handleTranscribe(payload) {
  const settings = await stqLoadSettings();
  const asr = settings.asr;
  const check = stqValidateBaseUrl(asr.baseUrl);
  if (!check.ok) return { ok: false, error: 'ASR 服务未配置：' + check.error };
  if (!asr.apiKey) return { ok: false, error: 'ASR 服务未配置：缺少 API Key' };

  const b64 = payload.blob.b64;
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const fd = new FormData();
  fd.append('file', new Blob([bin], { type: payload.blob.mime }), 'audio.' + (payload.blob.ext || 'webm'));
  fd.append('model', payload.model || asr.model || 'whisper-1');
  if (payload.lang || asr.lang) fd.append('language', payload.lang || asr.lang);
  if (payload.prompt) fd.append('prompt', payload.prompt);

  let res;
  try {
    res = await fetch(check.url + '/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + asr.apiKey },
      body: fd,
    });
  } catch (e) {
    return { ok: false, error: 'ASR 请求失败：' + e.message };
  }
  if (!res.ok) {
    let detail = res.status + ' ' + res.statusText;
    try {
      const j = await res.json();
      if (j && j.error && j.error.message) detail = j.error.message;
    } catch (_) { /* ignore */ }
    return { ok: false, error: 'ASR 返回错误：' + detail };
  }
  const data = await res.json();
  const text = data && (data.text || (data.segments && data.segments.map((s) => s.text).join('')));
  if (!text) return { ok: false, error: 'ASR 返回为空' };
  return { ok: true, text };
}

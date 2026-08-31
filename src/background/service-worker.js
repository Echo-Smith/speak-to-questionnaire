/**
 * 后台 Service Worker：
 * - 代理 LLM 请求（OpenAI 兼容 /chat/completions），BYOK：Base URL / Key / Model 均由用户在设置页提供
 * - 打开设置页
 */
importScripts('../shared/settings.js');

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

  return false;
});

async function handleChat(payload) {
  const settings = await stqLoadSettings();
  const { baseUrl, apiKey, model } = settings.llm;
  const check = stqValidateBaseUrl(baseUrl);
  if (!check.ok) return { ok: false, error: 'LLM 未配置：' + check.error };
  if (!apiKey) return { ok: false, error: 'LLM 未配置：缺少 API Key' };
  if (!model) return { ok: false, error: 'LLM 未配置：缺少模型名' };

  let res;
  try {
    res = await fetch(check.url + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + apiKey,
      },
      body: JSON.stringify({
        model,
        messages: payload.messages,
        temperature: typeof payload.temperature === 'number' ? payload.temperature : settings.llm.temperature,
        ...(payload.json ? { response_format: { type: 'json_object' } } : {}),
      }),
    });
  } catch (e) {
    return { ok: false, error: '请求失败：' + e.message };
  }

  if (!res.ok) {
    let detail = res.status + ' ' + res.statusText;
    try {
      const body = await res.json();
      if (body && body.error && body.error.message) detail = body.error.message;
    } catch (_) { /* ignore */ }
    return { ok: false, error: 'LLM 返回错误：' + detail };
  }

  const data = await res.json();
  const content = data && data.choices && data.choices[0] && data.choices[0].message
    ? data.choices[0].message.content
    : '';
  if (!content) return { ok: false, error: 'LLM 返回为空' };
  return { ok: true, content };
}

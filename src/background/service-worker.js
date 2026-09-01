/**
 * 后台 Service Worker：
 * - 代理 LLM 请求（协议可插拔：openai / anthropic，BYOK 全由用户提供）
 * - 管理 offscreen 文档并把 ASR 事件路由到发起的标签页
 *   （麦克风与识别都在扩展安全上下文完成，http 问卷页面同样可用）
 * - 打开设置页
 */
importScripts('../shared/settings.js', 'llm-protocols.js');

const OFFSCREEN_URL = 'src/offscreen/offscreen.html';
/** sessionId -> tabId */
const asrSessions = new Map();

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
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

  // 内容脚本请求开始识别：记录来源标签页，转发给 offscreen
  if (msg && msg.type === 'stq-asr-start') {
    const tabId = sender && sender.tab && sender.tab.id;
    if (tabId == null) {
      sendResponse({ ok: false, error: '无法识别来源标签页' });
      return false;
    }
    asrSessions.set(msg.session, tabId);
    ensureOffscreen()
      .then(() => chrome.runtime.sendMessage({
        target: 'offscreen',
        type: 'stq-offscreen-asr-start',
        lang: msg.settings.voice.lang,
        settings: msg.settings,
      }))
      .catch((e) => routeToTab(msg.session, { kind: 'error', error: 'offscreen 启动失败：' + e.message }));
    sendResponse({ ok: true });
    return false;
  }

  if (msg && msg.type === 'stq-asr-stop') {
    chrome.runtime.sendMessage({ target: 'offscreen', type: 'stq-offscreen-asr-stop' }).catch(() => {});
    asrSessions.delete(msg.session);
    sendResponse({ ok: true });
    return false;
  }

  // offscreen 事件回传 → 路由到对应标签页
  if (msg && msg.type === 'stq-offscreen-asr') {
    routeToTab(msg.session, { kind: msg.kind, text: msg.text, error: msg.error });
    sendResponse({ ok: true });
    return false;
  }

  return false;
});

async function ensureOffscreen() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_URL)],
  });
  if (contexts.length > 0) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: ['USER_MEDIA'],
    justification: '语音问卷识别需要在扩展安全上下文中访问麦克风（支持 http 问卷页面）',
  });
}

function routeToTab(session, event) {
  const tabId = asrSessions.get(session);
  if (tabId == null) return;
  chrome.tabs.sendMessage(tabId, { type: 'stq-asr-event', session, event }).catch(() => {
    asrSessions.delete(session);
  });
}

async function handleChat(payload) {
  const settings = await stqLoadSettings();
  // 设置页"测试连通性"用当前输入值（override），不依赖已保存配置
  if (payload.override) {
    settings.llm = Object.assign({}, settings.llm, payload.override);
  }
  const llm = settings.llm;
  const check = stqValidateBaseUrl(llm.baseUrl, { allowPrivate: !!llm.allowPrivateHosts });
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
  if (!content) {
    const finish = data && data.choices && data.choices[0] && data.choices[0].finish_reason;
    const hasReasoning = !!(data && data.choices && data.choices[0] && data.choices[0].message
      && data.choices[0].message.reasoning_content);
    if (finish === 'length' && hasReasoning) {
      return { ok: false, error: '模型思考耗尽了 max_tokens（正文为空）。请确认已开启"关闭思考"，或调大 maxTokens' };
    }
    return { ok: false, error: 'LLM 返回为空' };
  }
  return { ok: true, content };
}

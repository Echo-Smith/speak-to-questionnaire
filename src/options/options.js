/* 设置页逻辑 */
(async function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const msg = (el, text, ok) => {
    el.textContent = text;
    el.className = ok ? 'ok' : 'err';
  };

  const settings = await stqLoadSettings();

  // 回填
  $('protocol').value = settings.llm.protocol;
  $('authStyle').value = settings.llm.authStyle;
  $('baseUrl').value = settings.llm.baseUrl;
  $('apiKey').value = settings.llm.apiKey;
  $('model').value = settings.llm.model;
  $('asrMode').value = settings.asr.mode;
  $('asrBaseUrl').value = settings.asr.baseUrl;
  $('asrApiKey').value = settings.asr.apiKey;
  $('asrModel').value = settings.asr.model;
  $('lang').value = settings.voice.lang;
  $('rate').value = settings.voice.rate;
  $('readOptions').checked = settings.voice.readOptions;
  $('autoSingle').checked = settings.voice.autoAdvanceSingle;
  $('autoMulti').checked = settings.voice.autoAdvanceMultiple;
  $('autoClean').checked = settings.essay.autoClean;

  const syncAsrBox = () => {
    $('asrApiBox').classList.toggle('hidden', $('asrMode').value !== 'api');
  };
  $('asrMode').addEventListener('change', syncAsrBox);
  syncAsrBox();

  async function requestOriginPermission(rawUrl) {
    const check = stqValidateBaseUrl(rawUrl);
    if (!check.ok) return check;
    const origin = new URL(check.url).origin + '/*';
    try {
      await chrome.permissions.request({ origins: [origin] });
      return { ok: true };
    } catch (_) {
      return { ok: false, error: '未授予 ' + origin + ' 域名权限，无法调用' };
    }
  }

  // 保存（用户手势内申请 LLM / ASR 域名的主机权限）
  $('save').addEventListener('click', async () => {
    const check = stqValidateBaseUrl($('baseUrl').value);
    if (!check.ok) return msg($('saveMsg'), 'LLM Base URL 无效：' + check.error, false);

    settings.llm.protocol = $('protocol').value;
    settings.llm.authStyle = $('authStyle').value;
    settings.llm.baseUrl = check.url;
    settings.llm.apiKey = $('apiKey').value.trim();
    settings.llm.model = $('model').value.trim();

    const mode = $('asrMode').value;
    settings.asr.mode = mode;
    if (mode === 'api') {
      const asrCheck = stqValidateBaseUrl($('asrBaseUrl').value);
      if (!asrCheck.ok) return msg($('saveMsg'), 'ASR Base URL 无效：' + asrCheck.error, false);
      if (!$('asrApiKey').value.trim()) return msg($('saveMsg'), 'ASR 服务缺少 API Key', false);
      settings.asr.baseUrl = asrCheck.url;
      settings.asr.apiKey = $('asrApiKey').value.trim();
      settings.asr.model = $('asrModel').value.trim() || 'whisper-1';
      const p = await requestOriginPermission(settings.asr.baseUrl);
      if (!p.ok) return msg($('saveMsg'), p.error, false);
    } else {
      settings.asr.baseUrl = $('asrBaseUrl').value.trim();
      settings.asr.apiKey = $('asrApiKey').value.trim();
      settings.asr.model = $('asrModel').value.trim() || 'whisper-1';
    }

    if (settings.llm.baseUrl) {
      const p = await requestOriginPermission(settings.llm.baseUrl);
      if (!p.ok) return msg($('saveMsg'), p.error, false);
    }

    settings.voice.lang = $('lang').value;
    settings.voice.rate = parseFloat($('rate').value) || 1.0;
    settings.voice.readOptions = $('readOptions').checked;
    settings.voice.autoAdvanceSingle = $('autoSingle').checked;
    settings.voice.autoAdvanceMultiple = $('autoMulti').checked;
    settings.essay.autoClean = $('autoClean').checked;

    await stqSaveSettings(settings);
    msg($('saveMsg'), '已保存 ✓', true);
  });

  // 连通性测试
  $('test').addEventListener('click', async () => {
    msg($('msg'), '测试中…', true);
    const resp = await chrome.runtime.sendMessage({
      type: 'stq-llm-chat',
      payload: { messages: [{ role: 'user', content: '回复"ok"两个字' }], temperature: 0 },
    });
    if (resp && resp.ok) msg($('msg'), '连接成功 ✓', true);
    else msg($('msg'), (resp && resp.error) || '失败', false);
  });
})();

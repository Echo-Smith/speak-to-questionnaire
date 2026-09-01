/* 设置页逻辑 */
(async function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const msg = (el, text, ok) => {
    el.textContent = text;
    el.className = ok ? 'ok' : 'err';
  };

  const settings = await stqLoadSettings();

  // 麦克风授权（本页是整页标签，不会像 popup 那样被授权框抢焦点关闭）
  const micMsg = (text, ok) => {
    const el = $('micMsg');
    el.textContent = text;
    el.className = ok ? 'ok' : 'err';
  };
  $('micGrant').addEventListener('click', async () => {
    micMsg('请求授权中…', true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      micMsg('已授权 ✓', true);
    } catch (e) {
      micMsg('授权失败：' + e.message + '（若地址栏有麦克风/相机图标被禁，也可在站点设置里手动允许本插件）', false);
    }
  });

  // 回填
  $('protocol').value = settings.llm.protocol;
  $('authStyle').value = settings.llm.authStyle;
  $('baseUrl').value = settings.llm.baseUrl;
  $('apiKey').value = settings.llm.apiKey;
  $('model').value = settings.llm.model;
  $('llmPrivate').checked = !!settings.llm.allowPrivateHosts;
  $('asrMode').value = settings.asr.mode;
  $('asrPrefer').value = settings.asr.prefer || 'browser-first';
  $('asrBaseUrl').value = settings.asr.baseUrl;
  $('asrApiKey').value = settings.asr.apiKey;
  $('asrModel').value = settings.asr.model;
  $('asrPrivate').checked = !!settings.asr.allowPrivateHosts;
  $('lang').value = settings.voice.lang;
  $('rate').value = settings.voice.rate;
  $('readQuestion').checked = settings.voice.readQuestion !== false;
  $('readOptions').checked = settings.voice.readOptions;
  $('autoSingle').checked = settings.voice.autoAdvanceSingle;
  $('autoMulti').checked = settings.voice.autoAdvanceMultiple;
  $('highlight').checked = settings.voice.highlight !== false;
  $('autoClean').checked = settings.essay.autoClean;

  const syncAsrBox = () => {
    $('asrApiBox').classList.toggle('hidden', $('asrMode').value === 'webspeech');
    $('preferBox').classList.toggle('hidden', $('asrMode').value !== 'auto');
  };
  $('asrMode').addEventListener('change', syncAsrBox);
  syncAsrBox();

  async function requestOriginPermission(rawUrl, allowPrivate) {
    const check = stqValidateBaseUrl(rawUrl, { allowPrivate: !!allowPrivate });
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
    const form = validateLlmForm();
    if (!form.ok) return msg($('saveMsg'), form.error, false);
    const check = stqValidateBaseUrl($('baseUrl').value, { allowPrivate: $('llmPrivate').checked });
    if (!check.ok) return msg($('saveMsg'), 'LLM Base URL 无效：' + check.error, false);

    settings.llm.protocol = $('protocol').value;
    settings.llm.authStyle = $('authStyle').value;
    settings.llm.baseUrl = check.url;
    settings.llm.apiKey = $('apiKey').value.trim();
    settings.llm.model = $('model').value.trim();
    settings.llm.allowPrivateHosts = $('llmPrivate').checked;

    const mode = $('asrMode').value;
    settings.asr.mode = mode;
    settings.asr.prefer = $('asrPrefer').value;
    settings.asr.baseUrl = $('asrBaseUrl').value.trim();
    settings.asr.apiKey = $('asrApiKey').value.trim();
    settings.asr.model = $('asrModel').value.trim() || 'whisper-1';
    settings.asr.allowPrivateHosts = $('asrPrivate').checked;

    if (mode === 'api' || (mode === 'auto' && settings.asr.baseUrl)) {
      const asrCheck = stqValidateBaseUrl(settings.asr.baseUrl, { allowPrivate: settings.asr.allowPrivateHosts });
      if (!asrCheck.ok) return msg($('saveMsg'), 'ASR Base URL 无效：' + asrCheck.error, false);
      if (!settings.asr.apiKey) return msg($('saveMsg'), 'ASR 服务缺少 API Key', false);
      settings.asr.baseUrl = asrCheck.url;
      const p = await requestOriginPermission(settings.asr.baseUrl, settings.asr.allowPrivateHosts);
      if (!p.ok) return msg($('saveMsg'), p.error, false);
    }

    if (settings.llm.baseUrl) {
      const p = await requestOriginPermission(settings.llm.baseUrl, settings.llm.allowPrivateHosts);
      if (!p.ok) return msg($('saveMsg'), p.error, false);
    }

    settings.voice.lang = $('lang').value;
    settings.voice.rate = parseFloat($('rate').value) || 1.0;
    settings.voice.readQuestion = $('readQuestion').checked;
    settings.voice.readOptions = $('readOptions').checked;
    settings.voice.autoAdvanceSingle = $('autoSingle').checked;
    settings.voice.autoAdvanceMultiple = $('autoMulti').checked;
    settings.voice.highlight = $('highlight').checked;
    settings.essay.autoClean = $('autoClean').checked;

    await stqSaveSettings(settings);
    msg($('saveMsg'), '已保存 ✓', true);
  });

  // 连通性测试：直接读取当前输入框的值（不依赖"保存"），并做必填校验
  $('test').addEventListener('click', async () => {
    msg($('msg'), '测试中…', true);
    const check = stqValidateBaseUrl($('baseUrl').value, { allowPrivate: $('llmPrivate').checked });
    if (!check.ok) return msg($('msg'), 'Base URL 无效：' + check.error, false);
    if (!$('apiKey').value.trim()) return msg($('msg'), '必填项缺失：API Key', false);
    if (!$('model').value.trim()) return msg($('msg'), '必填项缺失：模型名', false);

    const p = await requestOriginPermission(check.url, $('llmPrivate').checked);
    if (!p.ok) return msg($('msg'), p.error, false);

    const resp = await chrome.runtime.sendMessage({
      type: 'stq-llm-chat',
      payload: {
        messages: [{ role: 'user', content: '回复"ok"两个字' }],
        temperature: 0,
        override: {
          protocol: $('protocol').value,
          authStyle: $('authStyle').value,
          baseUrl: check.url,
          apiKey: $('apiKey').value.trim(),
          model: $('model').value.trim(),
          maxTokens: 1024,
          temperature: 0,
          allowPrivateHosts: $('llmPrivate').checked,
        },
      },
    });
    if (resp && resp.ok) msg($('msg'), '连接成功 ✓', true);
    else msg($('msg'), (resp && resp.error) || '失败', false);
  });

  // 保存前必填校验：LLM 三项要么全空（可选不用），要么配齐
  function validateLlmForm() {
    const filled = [$('baseUrl').value.trim(), $('apiKey').value.trim(), $('model').value.trim()].filter(Boolean);
    if (filled.length === 0) return { ok: true }; // 整组可选，全空放行
    if (!$('baseUrl').value.trim()) return { ok: false, error: '必填项缺失：Base URL' };
    if (!$('apiKey').value.trim()) return { ok: false, error: '必填项缺失：API Key' };
    if (!$('model').value.trim()) return { ok: false, error: '必填项缺失：模型名' };
    return { ok: true };
  }
})();

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
  $('baseUrl').value = settings.llm.baseUrl;
  $('apiKey').value = settings.llm.apiKey;
  $('model').value = settings.llm.model;
  $('lang').value = settings.voice.lang;
  $('rate').value = settings.voice.rate;
  $('readOptions').checked = settings.voice.readOptions;
  $('autoSingle').checked = settings.voice.autoAdvanceSingle;
  $('autoMulti').checked = settings.voice.autoAdvanceMultiple;
  $('autoClean').checked = settings.essay.autoClean;

  // 保存（用户手势内申请 LLM 域名的主机权限）
  $('save').addEventListener('click', async () => {
    const check = stqValidateBaseUrl($('baseUrl').value);
    if (!check.ok) return msg($('saveMsg'), 'Base URL 无效：' + check.error, false);

    settings.llm.baseUrl = check.url;
    settings.llm.apiKey = $('apiKey').value.trim();
    settings.llm.model = $('model').value.trim();
    settings.voice.lang = $('lang').value;
    settings.voice.rate = parseFloat($('rate').value) || 1.0;
    settings.voice.readOptions = $('readOptions').checked;
    settings.voice.autoAdvanceSingle = $('autoSingle').checked;
    settings.voice.autoAdvanceMultiple = $('autoMulti').checked;
    settings.essay.autoClean = $('autoClean').checked;

    if (check.url) {
      const origin = new URL(check.url).origin + '/*';
      try {
        await chrome.permissions.request({ origins: [origin] });
      } catch (_) {
        return msg($('saveMsg'), '未授予 LLM 服务域名权限，无法调用', false);
      }
    }

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

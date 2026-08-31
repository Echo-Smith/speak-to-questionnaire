/* popup 逻辑 */
(async function () {
  'use strict';
  const $ = (id) => document.getElementById(id);

  const settings = await stqLoadSettings();
  $('enabled').checked = settings.enabled;

  $('enabled').addEventListener('change', async () => {
    settings.enabled = $('enabled').checked;
    await stqSaveSettings(settings);
  });

  $('options').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // 在未适配的问卷页面上按需注入（依赖 activeTab 权限，无需申请 <all_urls>）
  const CONTENT_FILES = [
    'src/shared/settings.js',
    'src/content/canonical.js',
    'src/content/adapters/registry.js',
    'src/content/adapters/wjx.js',
    'src/content/adapters/google-forms.js',
    'src/content/adapters/generic.js',
    'src/content/core/matcher.js',
    'src/content/core/tts.js',
    'src/content/core/asr.js',
    'src/content/core/recorder.js',
    'src/content/core/llm.js',
    'src/content/core/voice-engine.js',
    'src/content/overlay.js',
    'src/content/main.js',
  ];

  $('inject').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !/^https?:/i.test(tab.url || '')) return;
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: CONTENT_FILES });
      window.close();
    } catch (e) {
      const hint = document.querySelector('.hint');
      hint.textContent = '注入失败：' + e.message + '（应用商店内部页、PDF 等页面无法注入）';
    }
  });
})();

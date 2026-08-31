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

  // 麦克风授权在设置页完成：popup 会因授权框抢焦点而关闭（Permission dismissed），
  // 设置页是整页标签，授权稳定。
  document.getElementById('mic').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
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
    'src/content/core/focus.js',
    'src/content/core/asr.js',
    'src/content/core/recorder.js',
    'src/content/core/llm.js',
    'src/content/core/voice-engine.js',
    'src/content/overlay.js',
    'src/content/main.js',
  ];

  $('inject').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !/^https?:/i.test(tab.url || '')) {
      hint('当前页面无法注入（仅支持 http/https 页面）');
      return;
    }
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        files: CONTENT_FILES,
      });
      window.close();
    } catch (e) {
      // activeTab 授权随导航失效是最常见原因：提示用户重新点击
      hint('注入失败：' + e.message + '。请关闭弹窗后重新点击插件图标再试一次（activeTab 授权随页面跳转会过期）。');
    }
  });

  function hint(text) {
    const el = document.querySelector('.hint');
    el.textContent = text;
  }
})();

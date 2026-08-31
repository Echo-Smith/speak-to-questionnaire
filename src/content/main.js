/**
 * 内容脚本入口：探测平台 -> 注入面板 -> 绑定语音引擎。
 * 重复注入（popup "在本页启用" + manifest 自动注入）时只启动一次。
 */
(function () {
  'use strict';
  if (globalThis.__STQ_LOADED__) return;
  globalThis.__STQ_LOADED__ = true;

  let engine = null;

  async function boot() {
    const settings = await stqLoadSettings();
    if (!settings.enabled) return;

    const survey = STQ.Registry.probe();
    if (!survey) return;

    STQ.LLM.refresh(settings);
    STQ.TTS.configure({ rate: settings.voice.rate, lang: settings.voice.lang });

    const ui = STQ.createOverlay();
    engine = new STQ.VoiceEngine(survey, ui, settings);

    let micOn = false;
    ui.onMicToggle(() => {
      micOn = !micOn;
      if (micOn) {
        engine.start();
        if (engine.state !== 'idle') ui.setMicOn(true);
        else micOn = false;
      } else {
        engine.stop();
        ui.setMicOn(false);
      }
    });
  }

  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'local' || !changes.settings) return;
    const settings = await stqLoadSettings();
    if (!settings.enabled && engine) {
      engine.stop();
      engine = null;
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();

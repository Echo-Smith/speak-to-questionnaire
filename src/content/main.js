/**
 * 内容脚本入口：探测平台 -> 注入面板 -> 绑定语音引擎。
 * - SPA 动态渲染（如美团问卷）：题目未出现时延迟重试探测
 * - 重复注入（popup "在本页启用" + manifest 自动注入）时只启动一次
 */
(function () {
  'use strict';
  if (globalThis.__STQ_LOADED__) return;
  globalThis.__STQ_LOADED__ = true;

  const RETRY_DELAYS = [0, 2000, 5000, 10000];
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

    // 诊断：把识别到的题目结构复制到剪贴板，用于编写平台专用适配器
    ui.onDiagnostics(async () => {
      try {
        const questions = (engine.questions && engine.questions.length)
          ? engine.questions
          : await survey.list();
        const data = {
          url: location.href,
          frame: window === window.top ? 'main' : 'iframe',
          questions: questions.map((q) => ({
            topic: q.topic,
            type: q.type,
            title: q.title,
            required: q.required,
            options: (q.options || []).map((o) => o.label),
          })),
        };
        await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
        ui.setState('诊断信息已复制到剪贴板 ✓', 'ok');
      } catch (e) {
        ui.setState('诊断失败：' + e.message, 'error');
      }
    });
  }

  (function tryBoot(i) {
    if (i >= RETRY_DELAYS.length) return;
    setTimeout(async () => {
      if (engine) return;
      // probe 前先看页面是否已有疑似题目节点，避免对无关页面反复重试
      if (i > 0 && !document.querySelector('input[type=radio],input[type=checkbox],textarea,[role=radio],[role=checkbox]')) {
        tryBoot(i + 1);
        return;
      }
      await boot();
      if (!engine) tryBoot(i + 1);
    }, RETRY_DELAYS[i]);
  })(0);

  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'local' || !changes.settings) return;
    const settings = await stqLoadSettings();
    if (!settings.enabled && engine) {
      engine.stop();
      engine = null;
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => tryBoot(0));
  }
})();

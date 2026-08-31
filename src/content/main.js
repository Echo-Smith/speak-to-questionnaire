/**
 * 内容脚本入口：探测平台 -> 注入面板 -> 绑定语音引擎。
 * - SPA 动态渲染（如美团问卷）：题目未出现时延迟重试探测
 * - SPA 路由切换 / popup 重复"在本页启用"：自动复活实例（重探题目、重建面板），
 *   而不是被加载哨兵静默挡掉
 */
(function () {
  'use strict';
  const RETRY_DELAYS = [0, 2000, 5000, 10000];

  // 同页重复注入：不重新执行初始化，唤醒既有实例处理新路由/新题目
  if (globalThis.__STQ_LIVE__) {
    globalThis.__STQ_LIVE__.revive();
    return;
  }

  let engine = null;
  let survey = null;
  let ui = null;
  let lastUrl = location.href;

  function wireUI() {
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
        const text = JSON.stringify(data, null, 2);
        // clipboard API 仅安全上下文可用（http 页面为 undefined），降级 execCommand
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
          ui.setState('诊断信息已复制到剪贴板 ✓', 'ok');
        } else {
          const ta = document.createElement('textarea');
          ta.value = text;
          ta.style.cssText = 'position:fixed;left:-9999px;top:0;';
          document.body.appendChild(ta);
          ta.select();
          const ok = document.execCommand('copy');
          ta.remove();
          ui.setState(ok ? '诊断信息已复制到剪贴板 ✓' : '复制失败（http 页面限制），请打开 Console 手动复制', ok ? 'ok' : 'error');
        }
      } catch (e) {
        ui.setState('诊断失败：' + e.message, 'error');
      }
    });
  }

  async function boot() {
    const settings = await stqLoadSettings();
    if (!settings.enabled) return false;

    survey = STQ.Registry.probe();
    if (!survey) return false;

    STQ.LLM.refresh(settings);
    STQ.TTS.configure({ rate: settings.voice.rate, lang: settings.voice.lang });

    ui = STQ.createOverlay();
    engine = new STQ.VoiceEngine(survey, ui, settings);
    wireUI();

    globalThis.__STQ_LIVE__ = { revive };
    return true;
  }

  /** 重探当前页面（SPA 路由切换 / 重注入后） */
  function revive() {
    if (engine) { engine.stop(); engine = null; }
    survey = null;
    if (ui) { ui.setState('页面已切换，重新探测题目…', 'busy'); }
    scheduleProbe();
  }

  function scheduleProbe() {
    (function attempt(i) {
      if (i >= RETRY_DELAYS.length) return;
      setTimeout(async () => {
        if (engine) return; // 已有实例探测成功
        if (i > 0 && !document.querySelector('input[type=radio],input[type=checkbox],textarea,[role=radio],[role=checkbox]')) {
          attempt(i + 1);
          return;
        }
        const ok = await boot();
        if (ok && ui) ui.setState('已识别到问卷，点击麦克风开始', 'ok');
        if (!ok) attempt(i + 1);
      }, RETRY_DELAYS[i]);
    })(0);
  }

  // SPA 路由变化监听：pushState/replaceState 不触发原生事件，用轻量轮询
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      revive();
    }
  }, 1500);

  scheduleProbe();
})();

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
    // 麦克风图标由引擎驱动（setMicOn 跟随 ASR 实际录音状态）；点击按引擎状态切换启停
    ui.onMicToggle(() => {
      if (!engine || engine.state === 'idle') {
        engine.start();
      } else {
        engine.stop();
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

    // 读题开关（面板即时生效并持久化）
    ui.setSpeakerOn(settings.voice.readQuestion !== false);
    ui.onSpeakerToggle(async () => {
      settings.voice.readQuestion = !(settings.voice.readQuestion !== false);
      ui.setSpeakerOn(settings.voice.readQuestion);
      await stqSaveSettings(settings);
      ui.setState(
        settings.voice.readQuestion ? '读题已开启' : '读题已关闭：仅文字提示，直接聆听作答',
        'ok'
      );
    });

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
      if (i >= RETRY_DELAYS.length) {
        console.warn('[STQ] 首轮探测未识别到问卷：', location.href, '→ 挂载 DOM 监听，等待题目动态渲染');
        watchDom();
        return;
      }
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

  // 动态渲染问卷（如点击"开始测试"后才渲染题目）：监听 DOM 变化，出现题目控件时重探一次
  let domWatchArmed = false;
  let domWatchTimer = 0;
  function watchDom() {
    if (domWatchArmed || engine) return;
    domWatchArmed = true;
    const obs = new MutationObserver(() => {
      if (engine) { obs.disconnect(); return; }
      clearTimeout(domWatchTimer);
      // 防抖 600ms，等渲染完一批节点
      domWatchTimer = setTimeout(async () => {
        if (engine) { obs.disconnect(); return; }
        if (!document.querySelector('input[type=radio],input[type=checkbox],textarea,[role=radio],[role=checkbox]')) return;
        const ok = await boot();
        if (ok && ui) ui.setState('已识别到问卷，点击麦克风开始', 'ok');
        if (ok) obs.disconnect();
      }, 600);
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
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

/**
 * ASR 封装：webkitSpeechRecognition（Chrome 系浏览器）。
 * 连续监听 + 中间结果回调；不支持语音识别时 isSupported=false。
 */
(function () {
  'use strict';
  const STQ = (globalThis.STQ = globalThis.STQ || {});

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  STQ.ASR = {
    isSupported: !!SR,

    /**
     * 启动连续识别
     * callbacks: { onPartial(text), onFinal(text), onError(err), onEnd() }
     * 返回控制器 { stop() }
     */
    start(lang, callbacks) {
      if (!SR) {
        if (callbacks.onError) callbacks.onError(new Error('当前浏览器不支持语音识别'));
        return { stop() {} };
      }
      const rec = new SR();
      rec.lang = lang || 'zh-CN';
      rec.continuous = true;
      rec.interimResults = true;

      let stopped = false;

      rec.onresult = (event) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const r = event.results[i];
          const text = r[0].transcript;
          if (r.isFinal) {
            if (callbacks.onFinal) callbacks.onFinal(text.trim());
          } else {
            if (callbacks.onPartial) callbacks.onPartial(text.trim());
          }
        }
      };
      rec.onerror = (e) => {
        if (e.error === 'no-speech' || e.error === 'aborted') return;
        if (callbacks.onError) callbacks.onError(new Error('语音识别错误：' + e.error));
      };
      rec.onend = () => {
        if (!stopped) {
          try { rec.start(); return; } catch (_) { /* fallthrough */ }
        }
        if (callbacks.onEnd) callbacks.onEnd();
      };

      try {
        rec.start();
      } catch (e) {
        if (callbacks.onError) callbacks.onError(e);
      }

      return {
        stop() {
          stopped = true;
          try { rec.stop(); } catch (_) { /* ignore */ }
        },
      };
    },
  };
})();

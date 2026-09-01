/**
 * TTS 封装：speechSynthesis，长文本按句切分入队。
 */
(function () {
  'use strict';
  const STQ = (globalThis.STQ = globalThis.STQ || {});

  let queue = [];
  let speaking = false;
  let activeWatch = 0;
  let rate = 1.0;
  let lang = 'zh-CN';

  function pickVoice() {
    const voices = window.speechSynthesis.getVoices() || [];
    return voices.find((v) => v.lang && v.lang.toLowerCase().startsWith('zh')) || null;
  }

  function splitText(text) {
    const parts = String(text).split(/(?<=[。！？!?\n])/);
    const chunks = [];
    let buf = '';
    for (const p of parts) {
      if ((buf + p).length > 80 && buf) {
        chunks.push(buf);
        buf = p;
      } else {
        buf += p;
      }
    }
    if (buf) chunks.push(buf);
    return chunks.filter((c) => c.trim());
  }

  function playNext(onDone) {
    if (!queue.length) {
      speaking = false;
      if (onDone) onDone();
      return;
    }
    const text = queue.shift();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = rate;
    const v = pickVoice();
    if (v) u.voice = v;

    // Chrome 顽疾：speechSynthesis 偶发不触发 onend（尤其长句/切后台），
    // 用"预估朗读时长 ×1.6 + 3s"的 watchdog 兜底推进，否则引擎永远停在朗读态
    let finished = false;
    const advance = () => {
      if (finished) return;
      finished = true;
      clearTimeout(watch);
      playNext(onDone);
    };
    const est = Math.max(2500, (text.length / Math.max(1, rate)) * 260);
    activeWatch = setTimeout(advance, est + 3000);
    u.onend = advance;
    u.onerror = advance;
    window.speechSynthesis.speak(u);
  }

  STQ.TTS = {
    configure(opts) {
      if (opts && opts.rate) rate = opts.rate;
      if (opts && opts.lang) lang = opts.lang;
    },

    get speaking() { return speaking; },

    speak(text, onDone) {
      this.cancel();
      queue = splitText(text);
      if (!queue.length) {
        if (onDone) onDone();
        return;
      }
      speaking = true;
      playNext(onDone);
    },

    cancel() {
      queue = [];
      speaking = false;
      clearTimeout(activeWatch);
      activeWatch = 0;
      try { window.speechSynthesis.cancel(); } catch (_) { /* ignore */ }
    },
  };
})();

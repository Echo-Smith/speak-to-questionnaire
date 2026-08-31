/**
 * 内容脚本侧 ASR 调度器（页面不碰麦克风，录音/识别在扩展 offscreen 安全上下文完成）。
 *
 * settings.asr.mode：
 *   'auto'（默认） 按页面环境与优先级自动构建引擎链：
 *     - https 页面可用浏览器内置（页面内 Web Speech，零配置低延迟）
 *     - http 页面跳过页面内识别，直接走扩展自己的服务（转写API/LLM多模态/扩展内 Web Speech）
 *   显式指定某一种引擎时，仅做配置校验与回退。
 *
 * settings.asr.prefer（仅 auto 生效）：
 *   'browser-first'（默认） 浏览器内置 → 自备转写服务 → LLM 多模态 → 扩展内置识别
 *   'service-first'         自备转写服务 → LLM 多模态 → 浏览器内置 → 扩展内置识别
 *
 * 链上任一引擎在产出第一条结果前报错，自动切换到下一引擎并提示。
 * STQ.createASR(settings, callbacks) -> { stop() }
 */
(function () {
  'use strict';
  const STQ = (globalThis.STQ = globalThis.STQ || {});

  const LABELS = {
    'page-webspeech': '浏览器内置识别',
    'webspeech': '浏览器内置识别',
    'api': '自备转写服务',
    'llm-multimodal': 'LLM 多模态听写',
    'offscreen-webspeech': '扩展内置识别',
  };

  function canUse(mode, settings) {
    if (mode === 'page-webspeech') return window.isSecureContext && STQ.ASR.isSupported;
    if (mode === 'webspeech') return true; // 由 startEntry 内部决定页面内或 offscreen
    if (mode === 'api') return !!(settings.asr.baseUrl && settings.asr.apiKey);
    if (mode === 'llm-multimodal') {
      return settings.llm.protocol === 'openai' &&
        !!(settings.llm.baseUrl && settings.llm.apiKey && settings.llm.model);
    }
    return true; // offscreen-webspeech：offscreen 内部裁决并报错
  }

  function buildChain(settings) {
    const mode = (settings.asr && settings.asr.mode) || 'auto';

    if (mode !== 'auto') {
      const chain = canUse(mode, settings) ? [mode] : [mode, 'offscreen-webspeech'];
      return mode === 'webspeech' ? ['webspeech'] : chain;
    }

    const prefer = (settings.asr && settings.asr.prefer) || 'browser-first';
    const chain = [];
    if (prefer === 'service-first') {
      if (canUse('api', settings)) chain.push('api');
      if (canUse('llm-multimodal', settings)) chain.push('llm-multimodal');
      if (canUse('page-webspeech', settings)) chain.push('page-webspeech');
    } else {
      if (canUse('page-webspeech', settings)) chain.push('page-webspeech');
      if (canUse('api', settings)) chain.push('api');
      if (canUse('llm-multimodal', settings)) chain.push('llm-multimodal');
    }
    chain.push('offscreen-webspeech');
    return chain;
  }

  function startOffscreen(mode, settings, callbacks) {
    const session = 'asr-' + (crypto.randomUUID
      ? crypto.randomUUID()
      : Date.now() + '-' + crypto.getRandomValues(new Uint32Array(2)).join('-'));
    const s2 = Object.assign({}, settings, { asr: Object.assign({}, settings.asr, { mode }) });

    const listener = (msg) => {
      if (!msg || msg.type !== 'stq-asr-event' || msg.session !== session) return;
      const ev = msg.event || {};
      if (ev.kind === 'final' && ev.text) {
        if (callbacks.onFinal) callbacks.onFinal(ev.text);
      } else if (ev.kind === 'partial') {
        if (callbacks.onPartial) callbacks.onPartial(ev.text || '');
      } else if (ev.kind === 'error') {
        if (callbacks.onError) callbacks.onError(new Error(ev.error || '识别失败'));
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    chrome.runtime.sendMessage({ type: 'stq-asr-start', session, settings: s2 }).catch(() => {});

    return {
      stop() {
        chrome.runtime.sendMessage({ type: 'stq-asr-stop', session }).catch(() => {});
        chrome.runtime.onMessage.removeListener(listener);
      },
    };
  }

  function startEntry(entry, settings, callbacks) {
    if (entry === 'page-webspeech' || entry === 'webspeech') {
      if (window.isSecureContext && STQ.ASR.isSupported) {
        return STQ.ASR.start(settings.voice.lang, callbacks);
      }
      return startOffscreen('webspeech', settings, callbacks);
    }
    return startOffscreen(entry, settings, callbacks);
  }

  STQ.createASR = function createASR(settings, callbacks) {
    const chain = buildChain(settings);
    let idx = 0;
    let ctl = null;
    let gotResult = false;
    let stopped = false;

    const wrapped = {
      onPartial: (t) => { if (!stopped && callbacks.onPartial) callbacks.onPartial(t); },
      onFinal: (t) => {
        gotResult = true;
        if (!stopped && callbacks.onFinal) callbacks.onFinal(t);
      },
      onError: (e) => {
        if (stopped) return;
        // 产出第一条结果前失败 → 降级到下一引擎；之后只如实上报
        if (!gotResult && idx < chain.length - 1) {
          try { ctl && ctl.stop(); } catch (_) { /* ignore */ }
          idx += 1;
          if (callbacks.onPartial) callbacks.onPartial('');
          if (callbacks.onError) {
            callbacks.onError(new Error('「' + LABELS[chain[idx - 1]] + '」不可用，已切换到「' + LABELS[chain[idx]] + '」'));
          }
          ctl = startEntry(chain[idx], settings, wrapped);
          return;
        }
        if (callbacks.onError) callbacks.onError(e);
      },
    };

    ctl = startEntry(chain[0], settings, wrapped);

    return {
      stop() {
        stopped = true;
        try { ctl && ctl.stop(); } catch (_) { /* ignore */ }
      },
    };
  };
})();

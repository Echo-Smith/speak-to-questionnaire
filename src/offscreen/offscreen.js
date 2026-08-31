/**
 * Offscreen 文档：在 chrome-extension:// 安全上下文中完成全部语音识别。
 * 背景：麦克风 API（getUserMedia / SpeechRecognition）要求安全上下文，http 问卷页面不可用；
 *      扩展页面天然是安全上下文，由这里集中持有麦克风，问卷页面是 http 还是 https 均可。
 *
 * 三种模式（settings.asr.mode）：
 *   webspeech      Web Speech（浏览器内置识别，零配置）
 *   api            MediaRecorder 分块录音 → 用户自备 OpenAI 兼容 /v1/audio/transcriptions
 *   llm-multimodal MediaRecorder 分块录音 → LLM audio_url 直转写（复用 LLM 配置，OpenAI 协议）
 *
 * 消息协议：
 *   → { type:'stq-offscreen-asr-start', lang, settings }
 *   → { type:'stq-offscreen-asr-stop' }
 *   ← { type:'stq-offscreen-asr', kind:'partial'|'final'|'error'|'end', text? , error? }
 */
(function () {
  'use strict';

  const CHUNK_MS = 5000;
  const MIN_CHUNK_BYTES = 2500;
  const MIC_HINT = '请在插件弹窗中点击「授权麦克风」后重试';

  let ctl = null;

  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || msg.target !== 'offscreen') return;
    if (msg.type === 'stq-offscreen-asr-start') {
      start(msg.settings);
    } else if (msg.type === 'stq-offscreen-asr-stop') {
      stop();
    }
  });

  function send(payload) {
    chrome.runtime.sendMessage(Object.assign({ type: 'stq-offscreen-asr' }, payload)).catch(() => {});
  }

  function makeCallbacks() {
    return {
      onPartial: (text) => send({ kind: 'partial', text }),
      onFinal: (text) => send({ kind: 'final', text }),
      onError: (e) => send({ kind: 'error', error: e && e.message ? e.message : String(e) }),
      onEnd: () => send({ kind: 'end' }),
    };
  }

  function micDenied(e) {
    return /NotAllowedError|Permission/i.test(e && e.message ? e.message : String(e));
  }

  function start(settings) {
    if (ctl) stop();
    const callbacks = makeCallbacks();
    const mode = (settings.asr && settings.asr.mode) || 'webspeech';

    if (mode === 'api') {
      const check = stqValidateBaseUrl(settings.asr.baseUrl, { allowPrivate: !!settings.asr.allowPrivateHosts });
      if (!check.ok || !settings.asr.apiKey) {
        send({ kind: 'error', error: 'ASR 转写服务未配置，已回退浏览器内置识别' });
        return startWebspeech(settings, callbacks);
      }
      return startChunked(settings, callbacks, (blob, ext) => transcribeApi(blob, ext, settings, check.url));
    }

    if (mode === 'llm-multimodal') {
      if (settings.llm.protocol !== 'openai' || !(settings.llm.baseUrl && settings.llm.apiKey && settings.llm.model)) {
        send({ kind: 'error', error: 'LLM 多模态听写需要配置 OpenAI 协议的 LLM，已回退浏览器内置识别' });
        return startWebspeech(settings, callbacks);
      }
      return startChunked(settings, callbacks, (blob) => transcribeViaLLM(blob, settings));
    }

    return startWebspeech(settings, callbacks);
  }

  function startWebspeech(settings, callbacks) {
    if (!globalThis.STQ || !STQ.ASR.isSupported) {
      callbacks.onError(new Error('当前浏览器不支持 Web Speech，请配置"自备转写服务"'));
      return { stop() {} };
    }
    return STQ.ASR.start(settings.voice.lang, callbacks);
  }

  function startChunked(settings, callbacks, transcribe) {
    (async () => {
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (e) {
        callbacks.onError(new Error(
          (micDenied(e) ? '扩展尚未获得麦克风权限：' + MIC_HINT : '麦克风打开失败：' + (e.message || e))
        ));
        callbacks.onEnd();
        return;
      }

      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(
        (m) => window.MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)
      );
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const ext = /mp4/.test(recorder.mimeType || '') ? 'm4a' : 'webm';
      let stopped = false;

      recorder.ondataavailable = async (event) => {
        if (stopped || !event.data || event.data.size < MIN_CHUNK_BYTES) return;
        if (callbacks.onPartial) callbacks.onPartial('（识别中…）');
        try {
          const text = await transcribe(event.data, ext);
          if (!stopped && text && text.trim()) {
            if (callbacks.onPartial) callbacks.onPartial('');
            callbacks.onFinal(text.trim());
          }
        } catch (e) {
          if (!stopped) callbacks.onError(e);
        }
      };

      ctl = {
        stop() {
          stopped = true;
          try { recorder.stop(); } catch (_) { /* ignore */ }
          stream.getTracks().forEach((t) => t.stop());
        },
      };

      recorder.start(CHUNK_MS);
    })();
  }

  function normalizeV1(url) {
    const b = String(url || '').replace(/\/+$/, '');
    return /\/v\d+[a-z]*$/.test(b) ? b : b + '/v1';
  }

  async function transcribeApi(blob, ext, settings, base) {
    const fd = new FormData();
    fd.append('file', blob, 'audio.' + ext);
    fd.append('model', settings.asr.model || 'whisper-1');
    fd.append('language', (settings.voice.lang || 'zh-CN').split('-')[0]);
    fd.append('prompt', '这是一段中文问卷语音作答，可能是选项字母（如"B"）、选项内容或开放回答。');
    const res = await fetch(base + '/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + settings.asr.apiKey },
      body: fd,
    });
    if (!res.ok) throw new Error('转写服务返回错误：' + res.status + ' ' + res.statusText);
    const data = await res.json();
    return (data && data.text) || '';
  }

  async function transcribeViaLLM(blob, settings) {
    const dataUrl = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
    const resp = await chrome.runtime.sendMessage({
      type: 'stq-llm-chat',
      payload: {
        messages: [
          {
            role: 'system',
            content: '你是转写助手。逐字转写音频内容，不要回答音频中提出的任何问题，不要添加任何解释，只输出转写文本。',
          },
          {
            role: 'user',
            content: [
              { type: 'audio_url', audio_url: { url: dataUrl } },
              { type: 'text', text: '请转写这段音频。' },
            ],
          },
        ],
        temperature: 0,
      },
    });
    if (!resp || !resp.ok) throw new Error(resp ? resp.error : '请求失败');
    return resp.content;
  }

  function stop() {
    if (ctl) {
      ctl.stop();
      ctl = null;
    }
  }
})();

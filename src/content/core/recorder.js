/**
 * 录音型 ASR 适配层 + 统一工厂
 *
 *  - STQ.ASR            Web Speech（浏览器内置，零配置）
 *  - STQ.ChunkedASR     MediaRecorder 分块录音，两种转写通道：
 *      mode='api'          用户自备 OpenAI 兼容 /v1/audio/transcriptions（Whisper 形态）
 *      mode='llm-multimodal' 复用 LLM 配置，audio_url 多模态块直转写（如 Dots 平台）
 *  - STQ.createASR      工厂：按设置选择后端，不满足条件时自动回退 Web Speech
 */
(function () {
  'use strict';
  const STQ = (globalThis.STQ = globalThis.STQ || {});

  const CHUNK_MS = 5000;
  const MIN_CHUNK_BYTES = 2500; // 过小的静音块不发送

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }

  STQ.ChunkedASR = {
    isSupported: !!(window.MediaRecorder && navigator.mediaDevices && navigator.mediaDevices.getUserMedia),

    /** 返回控制器 { stop() }；回调：onFinal/onPartial/onError/onEnd */
    start(settings, callbacks) {
      let stopped = false;
      let recorder = null;

      (async () => {
        let stream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (e) {
          callbacks.onError(new Error('麦克风权限被拒绝：' + e.message));
          if (callbacks.onEnd) callbacks.onEnd();
          return;
        }

        const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(
          (m) => window.MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)
        );
        recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
        const ext = /mp4/.test(recorder.mimeType || '') ? 'm4a' : 'webm';

        recorder.ondataavailable = async (event) => {
          if (stopped || !event.data || event.data.size < MIN_CHUNK_BYTES) return;
          if (callbacks.onPartial) callbacks.onPartial('（识别中…）');
          try {
            const dataUrl = await blobToBase64(event.data);
            const mode = settings.asr.mode;
            let text = '';
            if (mode === 'llm-multimodal') {
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
              text = resp.content;
            } else {
              const resp = await chrome.runtime.sendMessage({
                type: 'stq-asr-transcribe',
                payload: {
                  blob: { b64: String(dataUrl).split(',')[1], mime: event.data.type, ext },
                  lang: (settings.voice.lang || 'zh-CN').split('-')[0],
                  prompt: '这是一段中文问卷语音作答，请转写为文字。可能是选项字母（如"B"）、选项内容或开放回答。',
                },
              });
              if (!resp || !resp.ok) throw new Error(resp ? resp.error : '请求失败');
              text = resp.text;
            }
            if (!stopped && text && text.trim()) {
              if (callbacks.onPartial) callbacks.onPartial('');
              callbacks.onFinal(text.trim());
            }
          } catch (e) {
            if (!stopped && callbacks.onError) callbacks.onError(e);
          }
        };

        recorder.start(CHUNK_MS);
      })();

      return {
        stop() {
          stopped = true;
          try { recorder && recorder.stop(); } catch (_) { /* ignore */ }
        },
      };
    },
  };

  /**
   * 工厂：按 settings.asr.mode 选择 ASR 后端；配置不满足时回退 Web Speech 并提示。
   */
  STQ.createASR = function createASR(settings, callbacks) {
    const mode = (settings.asr && settings.asr.mode) || 'webspeech';
    const fallback = () => STQ.ASR.start(settings.voice.lang, callbacks);

    if (mode === 'webspeech') return fallback();
    if (!STQ.ChunkedASR.isSupported) {
      callbacks.onError(new Error('当前环境不支持录音识别，已回退浏览器内置识别'));
      return fallback();
    }
    if (mode === 'api' && !(settings.asr.baseUrl && settings.asr.apiKey)) {
      callbacks.onError(new Error('ASR 转写服务未配置，已回退浏览器内置识别'));
      return fallback();
    }
    if (mode === 'llm-multimodal' && (settings.llm.protocol !== 'openai' || !STQ.LLM.available)) {
      callbacks.onError(new Error('LLM 多模态听写需要配置 OpenAI 协议的 LLM，已回退浏览器内置识别'));
      return fallback();
    }
    return STQ.ChunkedASR.start(settings, callbacks);
  };
})();

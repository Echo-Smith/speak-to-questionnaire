/**
 * 悬浮控制面板（Shadow DOM 隔离样式）：
 * 麦克风开关、状态显示、听写转写、论述整理预览、可拖动。
 */
(function () {
  'use strict';
  const STQ = (globalThis.STQ = globalThis.STQ || {});

  const STYLE = `
    :host { all: initial; }
    * { box-sizing: border-box; font: 13px/1.6 -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; }
    .panel { position: fixed; right: 18px; bottom: 18px; width: 300px; z-index: 2147483647;
             background: #fff; border: 1px solid #d9d1c2; border-radius: 14px;
             box-shadow: 0 12px 40px rgba(0,0,0,.18); color: #18231f; overflow: hidden; }
    .head { display: flex; align-items: center; gap: 8px; padding: 10px 12px; cursor: move;
            background: #f4f0e7; user-select: none; }
    .dot { width: 9px; height: 9px; border-radius: 50%; background: #b8b2a4; flex: none; transition: background .2s; }
    .dot.speaking { background: #c98a2d; } .dot.listening { background: #166b5b; animation: stqpulse 1.2s infinite; }
    .dot.ok { background: #166b5b; } .dot.error { background: #ad5b35; } .dot.busy { background: #c98a2d; animation: stqpulse .7s infinite; }
    @keyframes stqpulse { 50% { opacity: .35; } }
    .title { font-weight: 700; flex: 1; }
    .close { border: 0; background: none; cursor: pointer; color: #6a746d; font-size: 15px; padding: 2px 6px; }
    .body { padding: 10px 12px 12px; }
    .state { min-height: 38px; font-weight: 600; }
    .state.error { color: #ad5b35; font-weight: 500; }
    .state.ok { color: #166b5b; }
    .transcript { color: #6a746d; font-size: 12px; min-height: 18px; word-break: break-all; margin-top: 4px; }
    .essay { display: none; margin-top: 8px; }
    .essay textarea { width: 100%; height: 110px; resize: vertical; border: 1px solid #c8c0b1; border-radius: 8px;
                      padding: 8px; font-size: 12px; outline: none; }
    .essay textarea:focus { border-color: #166b5b; }
    .essay .tip { color: #6a746d; font-size: 11px; margin: 4px 0; }
    .actions { display: flex; gap: 6px; margin-top: 6px; }
    .actions button, .mic { border: 0; border-radius: 8px; padding: 7px 10px; cursor: pointer; font-weight: 600; }
    .btn-primary { background: #166b5b; color: #fff; flex: 1; }
    .btn-ghost { background: #ede9df; color: #455149; }
    .foot { display: flex; align-items: center; gap: 8px; margin-top: 10px; }
    .mic { width: 46px; height: 46px; border-radius: 50%; background: #166b5b; color: #fff; font-size: 20px; flex: none; }
    .mic.on { background: #ad5b35; }
    .hint { color: #8a938c; font-size: 11px; flex: 1; }
    .settings { border: 0; background: none; color: #166b5b; cursor: pointer; font-size: 12px; padding: 2px; }
  `;

  const HINT = '指令：下一题 / 上一题 / 重复 / 跳过 · 多选后说"完成" · 论述说"结束作答"';

  STQ.createOverlay = function createOverlay() {
    const host = document.createElement('div');
    host.id = 'stq-overlay-host';
    host.style.cssText = 'position:fixed;z-index:2147483647;';
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>${STYLE}</style>
      <div class="panel">
        <div class="head">
          <span class="dot" data-el="dot"></span>
          <span class="title">语音问卷助手</span>
          <button class="close" data-el="close" title="收起面板">×</button>
        </div>
        <div class="body">
          <div class="state" data-el="state">点击麦克风开始</div>
          <div class="transcript" data-el="transcript"></div>
          <div class="essay" data-el="essay">
            <div class="tip" data-el="essayTip"></div>
            <textarea data-el="essayText"></textarea>
            <div class="actions">
              <button class="btn-primary" data-el="essayConfirm">确认写入</button>
              <button class="btn-ghost" data-el="essayOriginal">用原文</button>
              <button class="btn-ghost" data-el="essayRetry">重说</button>
            </div>
          </div>
          <div class="foot">
            <button class="mic" data-el="mic" title="开始/停止">🎙</button>
            <div class="hint">${HINT}</div>
            <button class="settings" data-el="settings">设置</button>
            <button class="settings" data-el="diag" title="复制题目识别结果，用于适配新平台">诊断</button>
          </div>
        </div>
      </div>`;

    document.documentElement.appendChild(host);

    const el = {};
    for (const node of shadow.querySelectorAll('[data-el]')) {
      el[node.dataset.el] = node;
    }

    const handlers = {
      onMicToggle: null, onSettings: null, onDiagnostics: null, onEssayConfirm: null,
      onEssayOriginal: null, onEssayRetry: null,
    };

    el.mic.addEventListener('click', () => handlers.onMicToggle && handlers.onMicToggle());
    el.close.addEventListener('click', () => { host.style.display = 'none'; });
    el.settings.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'stq-open-options' });
    });
    el.diag.addEventListener('click', () => {
      handlers.onDiagnostics && handlers.onDiagnostics();
    });
    el.essayConfirm.addEventListener('click', () => {
      handlers.onEssayConfirm && handlers.onEssayConfirm(el.essayText.value);
    });
    el.essayOriginal.addEventListener('click', () => handlers.onEssayOriginal && handlers.onEssayOriginal());
    el.essayRetry.addEventListener('click', () => handlers.onEssayRetry && handlers.onEssayRetry());

    // 拖动
    let drag = null;
    el.panel = shadow.querySelector('.panel');
    shadow.querySelector('.head').addEventListener('pointerdown', (e) => {
      const rect = el.panel.getBoundingClientRect();
      drag = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    });
    window.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const right = window.innerWidth - e.clientX + drag.dx - el.panel.offsetWidth;
      const bottom = window.innerHeight - e.clientY + drag.dy - el.panel.offsetHeight;
      el.panel.style.right = Math.max(4, right) + 'px';
      el.panel.style.bottom = Math.max(4, bottom) + 'px';
    });
    window.addEventListener('pointerup', () => { drag = null; });

    return {
      el,
      onMicToggle(fn) { handlers.onMicToggle = fn; },
      onSettings(fn) { handlers.onSettings = fn; },
      onDiagnostics(fn) { handlers.onDiagnostics = fn; },

      setState(text, tone) {
        el.state.textContent = text;
        el.state.className = 'state' + (tone === 'error' ? ' error' : tone === 'ok' ? ' ok' : '');
        el.dot.className = 'dot' + (tone ? ' ' + tone : '');
      },
      setTranscript(text) { el.transcript.textContent = text || ''; },
      setMicOn(on) {
        el.mic.classList.toggle('on', on);
        el.mic.textContent = on ? '⏹' : '🎙';
      },
      showEssay({ original, cleaned, onConfirm, onUseOriginal, onRetry }) {
        el.essay.style.display = 'block';
        el.essayText.value = cleaned || original;
        el.essayTip.textContent = cleaned
          ? '已按口语整理（下方可编辑）。原文：' + original
          : '听写内容（下方可编辑）：';
        el.essayOriginal.style.display = cleaned ? '' : 'none';
        handlers.onEssayConfirm = onConfirm;
        handlers.onEssayOriginal = onUseOriginal;
        handlers.onEssayRetry = onRetry;
        el.essayText.focus();
      },
      hideEssay() { el.essay.style.display = 'none'; },
    };
  };
})();

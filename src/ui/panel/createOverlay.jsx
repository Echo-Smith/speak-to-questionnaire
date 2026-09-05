import React from 'react';
import ReactDOM from 'react-dom/client';
import panelStyles from './panel.css?inline';
import PanelApp from './PanelApp.jsx';

/**
 * 悬浮面板：Shadow DOM 隔离样式，挂载 React。
 * 对引擎暴露与旧版 overlay 完全相同的命令式接口，引擎零改动。
 */
export function createOverlay() {
  // 兼容 SPA 重复注入：先移除遗留宿主
  const stale = document.getElementById('stq-overlay-host');
  if (stale) stale.remove();

  const host = document.createElement('div');
  host.id = 'stq-overlay-host';
  host.style.cssText = 'position:fixed;z-index:2147483647;';
  const shadow = host.attachShadow({ mode: 'open' });

  // Tailwind 产物（构建期内联为字符串）注入 shadow root
  const styleEl = document.createElement('style');
  styleEl.textContent = panelStyles;
  shadow.appendChild(styleEl);

  const mount = document.createElement('div');
  shadow.appendChild(mount);
  document.documentElement.appendChild(host);

  const handlers = {
    onMicToggle: null, onSpeakerToggle: null, onSettings: null, onDiagnostics: null,
    onEssayConfirm: null, onEssayOriginal: null, onEssayRetry: null,
  };
  const state = { visible: true };

  const root = ReactDOM.createRoot(mount);
  root.render(<PanelApp handlers={handlers} state={state} />);

  return {
    onMicToggle(fn) { handlers.onMicToggle = fn; },
    onSpeakerToggle(fn) { handlers.onSpeakerToggle = fn; },
    onDiagnostics(fn) { handlers.onDiagnostics = fn; },

    setState(text, tone) { state.statusText = text; state.statusTone = tone; state.tick?.(); },
    setTranscript(text) { state.transcript = text; state.tick?.(); },
    setQuestion(text) { state.question = text; state.tick?.(); },
    setMicOn(on) { state.micOn = on; state.tick?.(); },
    setSpeakerOn(on) { state.speakerOn = on; state.tick?.(); },
    showEssay(payload) {
      state.essay = payload;
      if (payload && payload.onConfirm) handlers.onEssayConfirm = payload.onConfirm;
      if (payload && payload.onUseOriginal) handlers.onEssayOriginal = payload.onUseOriginal;
      if (payload && payload.onRetry) handlers.onEssayRetry = payload.onRetry;
      state.tick?.();
    },
    hideEssay() { state.essay = null; state.tick?.(); },
  };
}

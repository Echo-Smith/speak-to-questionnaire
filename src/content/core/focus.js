/**
 * 焦点高亮层：把"正在读 / 正在作答"的题目在页面上框出来。
 * - 用四个边框条拼成框（不用 outline/border，避免影响页面布局）
 * - 阶段着色：speaking=琥珀（读题中）、listening=绿（聆听中）、error=橙、done=灰（已完成即淡出）
 * - 滚动/窗口变化时自动跟随；同帧只保留一个焦点
 */
(function () {
  'use strict';
  const STQ = (globalThis.STQ = globalThis.STQ || {});

  const COLORS = {
    speaking: '#c98a2d',
    listening: '#166b5b',
    error: '#ad5b35',
    done: '#8a938c',
  };

  const STYLE = `
    .stq-focus-bar { position: fixed; z-index: 2147483646; pointer-events: none;
      transition: all .25s ease; border-radius: 4px; }
    .stq-focus-badge { position: fixed; z-index: 2147483646; pointer-events: none;
      font: 700 11px/1.5 -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
      color: #fff; padding: 2px 9px; border-radius: 999px; transition: all .25s ease; }
    .stq-focus-pulse { animation: stq-focus-pulse 1.4s ease-in-out infinite; }
    @keyframes stq-focus-pulse { 50% { opacity: .45; } }
    @media (prefers-reduced-motion: reduce) { .stq-focus-pulse { animation: none; } }
  `;

  let root = null;
  let bars = null;
  let badge = null;
  let currentEl = null;
  let rafId = 0;

  function ensureRoot() {
    if (root && root.isConnected) return;
    root = document.createElement('div');
    root.id = 'stq-focus-root';
    const style = document.createElement('style');
    style.textContent = STYLE;
    root.appendChild(style);
    // 上/右/下/左 四条边框
    bars = ['top', 'right', 'bottom', 'left'].map(() => {
      const b = document.createElement('div');
      b.className = 'stq-focus-bar';
      root.appendChild(b);
      return b;
    });
    badge = document.createElement('div');
    badge.className = 'stq-focus-badge stq-focus-pulse';
    root.appendChild(badge);
    document.documentElement.appendChild(root);
  }

  function layout() {
    if (!currentEl || !currentEl.isConnected) return hide();
    const r = currentEl.getBoundingClientRect();
    const pad = 6;
    const x0 = Math.max(0, r.left - pad);
    const y0 = Math.max(0, r.top - pad);
    const x1 = Math.min(window.innerWidth, r.right + pad);
    const y1 = Math.min(window.innerHeight, r.bottom + pad);
    const t = 3;

    bars[0].style.cssText = `left:${x0}px;top:${y0}px;width:${x1 - x0}px;height:${t}px;`;
    bars[1].style.cssText = `left:${x1 - t}px;top:${y0}px;width:${t}px;height:${y1 - y0}px;`;
    bars[2].style.cssText = `left:${x0}px;top:${y1 - t}px;width:${x1 - x0}px;height:${t}px;`;
    bars[3].style.cssText = `left:${x0}px;top:${y0}px;width:${t}px;height:${y1 - y0}px;`;

    badge.style.cssText = `left:${x0}px;top:${Math.max(0, y0 - 26)}px;`;
    rafId = requestAnimationFrame(layout); // 跟随滚动与窗口变化
  }

  STQ.Focus = {
    /**
     * 高亮目标题目
     * @param el 题目容器
     * @param phase 'speaking' | 'listening' | 'error' | 'done'
     * @param label 角标文案（如"读题中"/"请作答"）
     */
    focus(el, phase, label) {
      if (!el) return;
      ensureRoot();
      currentEl = el;
      const color = COLORS[phase] || COLORS.listening;
      for (const b of bars) b.style.background = color;
      badge.textContent = label || '';
      badge.style.background = color;
      badge.classList.toggle('stq-focus-pulse', phase === 'listening' || phase === 'speaking');
      if (!rafId) rafId = requestAnimationFrame(layout);
    },

    hide() {
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
      currentEl = null;
      if (root) root.remove();
      root = null; bars = null; badge = null;
    },
  };

  function hide() { STQ.Focus.hide(); }
})();

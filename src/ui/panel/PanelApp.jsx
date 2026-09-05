import React, { useEffect, useRef, useState } from 'react';
import { Mic, Square, Volume2, VolumeX, Settings2, Stethoscope } from 'lucide-react';
import { cn } from '@/lib/utils.js';
import { Button } from '@/components/ui/button.jsx';
import { Textarea } from '@/components/ui/textarea.jsx';

const TONE_COLOR = {
  speaking: '#c98a2d',
  listening: '#166b5b',
  error: '#ad5b35',
  busy: '#c98a2d',
  ok: '#166b5b',
  idle: '#b8b2a4',
};

const HINT = '指令：下一题 / 上一题 / 重复 / 跳过 · 多选后说"完成" · 论述说"结束作答"';

const MARGIN = 4;

export default function PanelApp({ handlers, state }) {
  const [, force] = useState(0);
  useEffect(() => { state.tick = () => force((n) => n + 1); }, [state]);

  const panelRef = useRef(null);
  const dragRef = useRef(null);

  const tone = state.statusTone || 'idle';
  const color = TONE_COLOR[tone] || TONE_COLOR.idle;
  const recording = !!state.micOn;
  const speakerOn = state.speakerOn !== false;
  const essay = state.essay || null;

  function clampPanel() {
    const el = panelRef.current;
    if (!el) return;
    const w = el.offsetWidth || 300;
    const h = el.offsetHeight || 200;
    const maxRight = Math.max(MARGIN, window.innerWidth - w - MARGIN);
    const maxBottom = Math.max(MARGIN, window.innerHeight - h - MARGIN);
    const r = parseFloat(el.style.right) || MARGIN;
    const b = parseFloat(el.style.bottom) || MARGIN;
    el.style.right = Math.min(Math.max(MARGIN, r), maxRight) + 'px';
    el.style.bottom = Math.min(Math.max(MARGIN, b), maxBottom) + 'px';
  }

  function onHeadPointerDown(e) {
    if (e.button !== 0) return;
    const el = panelRef.current;
    const rect = el.getBoundingClientRect();
    dragRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    e.preventDefault();
  }
  function onHeadPointerMove(e) {
    if (!dragRef.current) return;
    const el = panelRef.current;
    const w = el.offsetWidth || 300;
    const h = el.offsetHeight || 200;
    const right = window.innerWidth - e.clientX + dragRef.current.dx - w;
    const bottom = window.innerHeight - e.clientY + dragRef.current.dy - h;
    const maxRight = Math.max(MARGIN, window.innerWidth - w - MARGIN);
    const maxBottom = Math.max(MARGIN, window.innerHeight - h - MARGIN);
    el.style.right = Math.min(Math.max(MARGIN, right), maxRight) + 'px';
    el.style.bottom = Math.min(Math.max(MARGIN, bottom), maxBottom) + 'px';
  }
  function onHeadPointerUp() { dragRef.current = null; }

  useEffect(() => {
    const onResize = () => clampPanel();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <div
      ref={panelRef}
      style={{ right: 18, bottom: 18 }}
      className="fixed w-[300px] overflow-hidden rounded-2xl border border-border bg-card text-foreground shadow-2xl"
    >
      {/* 标题栏（可拖动） */}
      <div
        onPointerDown={onHeadPointerDown}
        onPointerMove={onHeadPointerMove}
        onPointerUp={onHeadPointerUp}
        onPointerCancel={onHeadPointerUp}
        className="flex cursor-move select-none items-center gap-2 border-b bg-secondary/60 px-3 py-2.5"
      >
        <span
          className={cn(
            'h-2.5 w-2.5 shrink-0 rounded-full transition-colors',
            (tone === 'listening' || tone === 'busy' || tone === 'speaking') && 'animate-pulse'
          )}
          style={{ background: color }}
        />
        <span className="flex-1 text-sm font-bold">语音问卷助手</span>
        <button
          className="rounded px-1.5 text-muted-foreground transition-colors hover:text-foreground"
          title="收起面板"
          onClick={() => { panelRef.current.style.display = 'none'; }}
        >×</button>
      </div>

      <div className="p-3">
        {/* 状态行 */}
        <div
          className={cn('min-h-[38px] text-sm font-semibold', tone === 'error' && 'text-destructive', tone === 'ok' && 'text-primary')}
        >
          {state.statusText || '点击麦克风开始'}
        </div>

        {/* 当前题目（读题关闭时的文字提醒） */}
        {state.question && (
          <div className="mt-1 break-all text-xs text-foreground/70">{state.question}</div>
        )}

        {/* 语音转写行 */}
        <div className="mt-1 min-h-[18px] break-all text-xs text-muted-foreground">{state.transcript || ''}</div>

        {/* 论述题听写预览 */}
        {essay && (
          <div className="mt-2">
            <div className="mb-1 text-[11px] leading-relaxed text-muted-foreground">
              {essay.cleaned ? '已按口语整理（下方可编辑）。原文：' + essay.original : '听写内容（下方可编辑）：'}
            </div>
            <Textarea className="h-28 text-xs" defaultValue={essay.cleaned || essay.original} id="stq-essay-text" />
            <div className="mt-2 flex gap-2">
              <Button
                className="h-8 flex-1 text-xs"
                onClick={() => {
                  const ta = panelRef.current.querySelector('#stq-essay-text');
                  handlers.onEssayConfirm && handlers.onEssayConfirm(ta ? ta.value : '');
                }}
              >确认写入</Button>
              {essay.cleaned && (
                <Button className="h-8 text-xs" variant="secondary" onClick={() => handlers.onEssayOriginal && handlers.onEssayOriginal()}>
                  用原文
                </Button>
              )}
              <Button className="h-8 text-xs" variant="secondary" onClick={() => handlers.onEssayRetry && handlers.onEssayRetry()}>
                重说
              </Button>
            </div>
          </div>
        )}

        {/* 底部操作区 */}
        <div className="mt-3 flex items-center gap-2 border-t pt-3">
          <button
            title={recording ? '正在录音，点击停止' : '开始语音作答'}
            onClick={() => handlers.onMicToggle && handlers.onMicToggle()}
            className={cn(
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg text-white shadow-md transition-colors',
              recording ? 'bg-destructive' : 'bg-primary hover:bg-primary/90'
            )}
          >
            {recording ? <Square className="h-4 w-4" /> : <Mic className="h-5 w-5" />}
          </button>
          <button
            title={speakerOn ? '读题：开（点击关闭）' : '读题：关（仅文字提示，点击开启）'}
            onClick={() => handlers.onSpeakerToggle && handlers.onSpeakerToggle()}
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm transition-colors',
              speakerOn ? 'bg-secondary text-secondary-foreground' : 'bg-muted/70 text-muted-foreground opacity-70'
            )}
          >
            {speakerOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>
          <div className="flex-1 text-[11px] leading-snug text-muted-foreground">{HINT}</div>
          <div className="flex shrink-0 flex-col gap-0.5">
            <button
              className="text-[11px] text-primary hover:underline"
              onClick={() => chrome.runtime.sendMessage({ type: 'stq-open-options' })}
            ><Settings2 className="h-3.5 w-3.5" /></button>
            <button
              className="text-[11px] text-primary hover:underline"
              title="复制题目识别结果，用于适配新平台"
              onClick={() => handlers.onDiagnostics && handlers.onDiagnostics()}
            ><Stethoscope className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      </div>
    </div>
  );
}

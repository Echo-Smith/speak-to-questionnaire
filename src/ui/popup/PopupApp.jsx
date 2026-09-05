import React, { useEffect, useState } from 'react';
import { Mic, Settings2, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button.jsx';
import { Switch } from '@/components/ui/switch.jsx';
import { Label } from '@/components/ui/label.jsx';

const stq = globalThis.stqSettingsBridge;

export default function PopupApp() {
  const [enabled, setEnabled] = useState(true);
  const [injectMsg, setInjectMsg] = useState('');

  useEffect(() => {
    stq.load().then((s) => setEnabled(s.enabled));
  }, []);

  async function toggleEnabled(v) {
    setEnabled(v);
    const s = await stq.load();
    s.enabled = v;
    await stq.save(s);
  }

  async function injectHere() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !/^https?:/i.test(tab.url || '')) {
      setInjectMsg('当前页面无法注入（仅支持 http/https 页面）');
      return;
    }
    try {
      const files = chrome.runtime.getManifest().content_scripts[0].js;
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        files,
      });
      window.close();
    } catch (e) {
      setInjectMsg(
        '注入失败：' + e.message + '。请关闭弹窗后重新点击插件图标再试（activeTab 授权随页面跳转会过期）。'
      );
    }
  }

  return (
    <div className="w-72 p-4">
      <h1 className="text-sm font-bold">🎙 语音问卷助手</h1>

      <div className="mt-3 flex items-center justify-between rounded-lg border p-3">
        <Label htmlFor="enabled" className="text-sm">启用插件</Label>
        <Switch id="enabled" checked={enabled} onCheckedChange={toggleEnabled} />
      </div>

      <div className="mt-3 space-y-2">
        <Button className="w-full justify-start" variant="outline" onClick={() => chrome.runtime.openOptionsPage()}>
          <Mic className="h-4 w-4" /> 麦克风授权（首次使用）
        </Button>
        <Button className="w-full justify-start" variant="outline" onClick={() => chrome.runtime.openOptionsPage()}>
          <Settings2 className="h-4 w-4" /> 设置（BYOK LLM / 语音偏好）
        </Button>
        <Button className="w-full justify-start" onClick={injectHere}>
          <Zap className="h-4 w-4" /> 在本页启用（其他问卷平台）
        </Button>
      </div>

      {injectMsg && <p className="mt-2 text-xs text-destructive">{injectMsg}</p>}

      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        问卷星 / Google Forms 等已适配平台自动生效；其他问卷点「在本页启用」。
        指令：下一题 / 上一题 / 重复 / 跳过；多选后说"完成"；论述说"结束作答"。
      </p>
    </div>
  );
}

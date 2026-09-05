import React, { useEffect, useState } from 'react';
import { Mic, KeyRound, Speech, Volume2, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.jsx';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Input } from '@/components/ui/input.jsx';
import { Label } from '@/components/ui/label.jsx';
import { Switch } from '@/components/ui/switch.jsx';
import { Separator } from '@/components/ui/separator.jsx';
import { Alert, AlertDescription } from '@/components/ui/alert.jsx';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select.jsx';

const stq = globalThis.stqSettingsBridge;

function Field({ label, hint, children }) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label}
        {hint && <span className="ml-1 text-xs font-normal text-muted-foreground">{hint}</span>}
      </Label>
      {children}
    </div>
  );
}

function ToggleRow({ checked, onChange, title, hint }) {
  return (
    <div className="flex items-center justify-between rounded-lg border p-3">
      <div className="space-y-0.5 pr-4">
        <div className="text-sm font-medium">{title}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

export default function OptionsApp() {
  const [settings, setSettings] = useState(null);
  const [micState, setMicState] = useState({ text: '', ok: null });
  const [testState, setTestState] = useState({ text: '', ok: null });
  const [saveState, setSaveState] = useState({ text: '', ok: null });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    stq.load().then(setSettings);
  }, []);

  if (!settings) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> 加载设置中…
      </div>
    );
  }

  const set = (fn) => setSettings((s) => {
    const next = structuredClone(s);
    fn(next);
    return next;
  });

  async function grantMic() {
    setMicState({ text: '请求授权中…', ok: null });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setMicState({ text: '已授权 ✓ 浏览器已记住，无需重复操作', ok: true });
    } catch (e) {
      setMicState({ text: '授权失败：' + e.message, ok: false });
    }
  }

  async function testLlm() {
    setTestState({ text: '测试中…', ok: null });
    const check = stq.validateBaseUrl(settings.llm.baseUrl, { allowPrivate: settings.llm.allowPrivateHosts });
    if (!check.ok) return setTestState({ text: 'Base URL 无效：' + check.error, ok: false });
    if (!settings.llm.apiKey.trim()) return setTestState({ text: '必填项缺失：API Key', ok: false });
    if (!settings.llm.model.trim()) return setTestState({ text: '必填项缺失：模型名', ok: false });
    const p = await stq.requestOriginPermission(check.url, settings.llm.allowPrivateHosts);
    if (!p.ok) return setTestState({ text: p.error, ok: false });
    const resp = await chrome.runtime.sendMessage({
      type: 'stq-llm-chat',
      payload: {
        messages: [{ role: 'user', content: '回复"ok"两个字' }],
        temperature: 0,
        override: { ...settings.llm, baseUrl: check.url },
      },
    });
    if (resp && resp.ok) setTestState({ text: '连接成功 ✓', ok: true });
    else setTestState({ text: (resp && resp.error) || '失败', ok: false });
  }

  async function save() {
    setSaving(true);
    setSaveState({ text: '', ok: null });
    try {
      // 必填校验：LLM 三项全空放行（整组可选），填一半报缺失项
      const llmFilled = [settings.llm.baseUrl, settings.llm.apiKey, settings.llm.model].filter((x) => x.trim());
      if (llmFilled.length > 0) {
        if (!settings.llm.baseUrl.trim()) throw new Error('必填项缺失：Base URL');
        if (!settings.llm.apiKey.trim()) throw new Error('必填项缺失：API Key');
        if (!settings.llm.model.trim()) throw new Error('必填项缺失：模型名');
      }
      const llmCheck = stq.validateBaseUrl(settings.llm.baseUrl, { allowPrivate: settings.llm.allowPrivateHosts });
      if (!llmCheck.ok) throw new Error('LLM Base URL 无效：' + llmCheck.error);

      const next = structuredClone(settings);
      next.llm.baseUrl = llmCheck.url;

      if (next.asr.mode === 'api' || (next.asr.mode === 'auto' && next.asr.baseUrl.trim())) {
        const asrCheck = stq.validateBaseUrl(next.asr.baseUrl, { allowPrivate: next.asr.allowPrivateHosts });
        if (!asrCheck.ok) throw new Error('ASR Base URL 无效：' + asrCheck.error);
        if (!next.asr.apiKey.trim()) throw new Error('ASR 服务缺少 API Key');
        next.asr.baseUrl = asrCheck.url;
        const p = await stq.requestOriginPermission(next.asr.baseUrl, next.asr.allowPrivateHosts);
        if (!p.ok) throw new Error(p.error);
      }
      if (next.llm.baseUrl) {
        const p = await stq.requestOriginPermission(next.llm.baseUrl, next.llm.allowPrivateHosts);
        if (!p.ok) throw new Error(p.error);
      }

      await stq.save(next);
      setSettings(next);
      setSaveState({ text: '已保存 ✓', ok: true });
    } catch (e) {
      setSaveState({ text: e.message, ok: false });
    } finally {
      setSaving(false);
    }
  }

  const banner = saveState.text || testState.text || micState.text;
  const bannerOk = saveState.text ? saveState.ok : testState.text ? testState.ok : micState.ok;

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="text-xl font-bold tracking-tight">语音问卷助手 · 设置</h1>
      <p className="mt-1 text-sm text-muted-foreground">BYOK：所有模型服务由你自己提供，插件不经手任何 Key</p>

      {banner && (
        <Alert variant={bannerOk === false ? 'destructive' : bannerOk ? 'success' : 'default'} className="mt-4">
          {bannerOk === false ? <XCircle className="h-4 w-4" /> : bannerOk ? <CheckCircle2 className="h-4 w-4" /> : null}
          <AlertDescription>{banner}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="llm" className="mt-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="mic"><Mic className="h-4 w-4" /><span className="ml-1 hidden sm:inline">麦克风</span></TabsTrigger>
          <TabsTrigger value="llm"><KeyRound className="h-4 w-4" /><span className="ml-1 hidden sm:inline">LLM</span></TabsTrigger>
          <TabsTrigger value="asr"><Speech className="h-4 w-4" /><span className="ml-1 hidden sm:inline">识别</span></TabsTrigger>
          <TabsTrigger value="voice"><Volume2 className="h-4 w-4" /><span className="ml-1 hidden sm:inline">交互</span></TabsTrigger>
        </TabsList>

        <TabsContent value="mic">
          <Card>
            <CardHeader>
              <CardTitle>麦克风授权</CardTitle>
              <CardDescription>
                授予<b>插件自身</b>的麦克风权限（http 页面识别与自定义转写用），与问卷网站无关，一次永久生效。
                必须在本页点击——popup 小窗会被授权框抢焦点关闭。
              </CardDescription>
            </CardHeader>
            <CardContent className="flex items-center gap-3">
              <Button onClick={grantMic}><Mic className="h-4 w-4" /> 授权麦克风</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="llm">
          <Card>
            <CardHeader>
              <CardTitle>LLM（BYOK，可选增强）</CardTitle>
              <CardDescription>
                任意 OpenAI 兼容或 Anthropic 兼容服务（OpenAI / DeepSeek / Moonshot / Ollama / Dots…）。
                不填则使用内置规则匹配，基础功能不受影响。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="接口协议">
                  <Select value={settings.llm.protocol} onValueChange={(v) => set((s) => { s.llm.protocol = v; })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="openai">OpenAI 兼容（/v1/chat/completions）</SelectItem>
                      <SelectItem value="anthropic">Anthropic 兼容（/v1/messages）</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="鉴权方式">
                  <Select value={settings.llm.authStyle} onValueChange={(v) => set((s) => { s.llm.authStyle = v; })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">自动（按协议默认）</SelectItem>
                      <SelectItem value="bearer">Authorization: Bearer</SelectItem>
                      <SelectItem value="api-key">api-key 头</SelectItem>
                      <SelectItem value="x-api-key">x-api-key 头</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <Field label="Base URL" hint="填 /v1 结尾或域名根均可">
                <Input
                  value={settings.llm.baseUrl}
                  onChange={(e) => set((s) => { s.llm.baseUrl = e.target.value; })}
                  placeholder="https://api.openai.com/v1"
                />
              </Field>
              <Field label="API Key">
                <Input
                  type="password" autoComplete="off"
                  value={settings.llm.apiKey}
                  onChange={(e) => set((s) => { s.llm.apiKey = e.target.value; })}
                  placeholder="sk-..."
                />
              </Field>
              <Field label="模型名" hint="如 gpt-4o-mini / deepseek-chat / claude-sonnet-4-5">
                <Input
                  value={settings.llm.model}
                  onChange={(e) => set((s) => { s.llm.model = e.target.value; })}
                  placeholder="gpt-4o-mini"
                />
              </Field>
              <ToggleRow
                title="关闭思考模式"
                hint="推理模型（如 Dots dots3）不关会耗尽 token 导致正文为空；不支持的网关自动忽略"
                checked={settings.llm.disableThinking !== false}
                onChange={(v) => set((s) => { s.llm.disableThinking = v; })}
              />
              <ToggleRow
                title="允许本地/内网地址"
                hint="自建模型如 Ollama http://localhost:11434；默认关闭"
                checked={!!settings.llm.allowPrivateHosts}
                onChange={(v) => set((s) => { s.llm.allowPrivateHosts = v; })}
              />
              <Button variant="outline" onClick={testLlm}>测试连通性</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="asr">
          <Card>
            <CardHeader>
              <CardTitle>语音识别（ASR）</CardTitle>
              <CardDescription>
                自动模式按页面环境选择：https 优先浏览器内置，http 走扩展自有链，失败逐级降级。
                录音统一转码为 WAV 后直连你配置的服务。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label="识别引擎">
                <Select value={settings.asr.mode} onValueChange={(v) => set((s) => { s.asr.mode = v; })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">自动（按页面环境选择，推荐）</SelectItem>
                    <SelectItem value="webspeech">浏览器内置（Web Speech，零配置）</SelectItem>
                    <SelectItem value="api">自备转写服务（OpenAI 兼容 /v1/audio/transcriptions）</SelectItem>
                    <SelectItem value="llm-multimodal">LLM 多模态直转写（复用 LLM 配置）</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              {settings.asr.mode === 'auto' && (
                <Field label="自动优先级">
                  <Select value={settings.asr.prefer} onValueChange={(v) => set((s) => { s.asr.prefer = v; })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="browser-first">浏览器优先（https 用内置，http 用自有服务）</SelectItem>
                      <SelectItem value="service-first">自有服务优先（配置了转写服务时）</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              )}
              {settings.asr.mode !== 'webspeech' && (
                <>
                  <Separator />
                  <Field label="转写 Base URL" hint="如 https://api.openai.com/v1">
                    <Input
                      value={settings.asr.baseUrl}
                      onChange={(e) => set((s) => { s.asr.baseUrl = e.target.value; })}
                      placeholder="https://api.openai.com/v1"
                    />
                  </Field>
                  <Field label="转写 API Key">
                    <Input
                      type="password" autoComplete="off"
                      value={settings.asr.apiKey}
                      onChange={(e) => set((s) => { s.asr.apiKey = e.target.value; })}
                      placeholder="sk-..."
                    />
                  </Field>
                  <Field label="转写模型名" hint="如 whisper-1">
                    <Input
                      value={settings.asr.model}
                      onChange={(e) => set((s) => { s.asr.model = e.target.value; })}
                      placeholder="whisper-1"
                    />
                  </Field>
                  <ToggleRow
                    title="转写服务允许本地/内网地址"
                    hint="内网部署的转写服务；默认关闭"
                    checked={!!settings.asr.allowPrivateHosts}
                    onChange={(v) => set((s) => { s.asr.allowPrivateHosts = v; })}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="voice">
          <Card>
            <CardHeader>
              <CardTitle>语音交互</CardTitle>
              <CardDescription>朗读与流转行为，随时可在问卷面板上临时切换</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <ToggleRow
                title="朗读题目"
                hint={"关闭则点麦克风后直接聆听作答；说「重复」仍可听题"}
                checked={settings.voice.readQuestion !== false}
                onChange={(v) => set((s) => { s.voice.readQuestion = v; })}
              />
              <ToggleRow
                title="朗读题目时同时朗读选项"
                checked={settings.voice.readOptions}
                onChange={(v) => set((s) => { s.voice.readOptions = v; })}
              />
              <ToggleRow
                title="单选/量表说完自动进入下一题"
                checked={settings.voice.autoAdvanceSingle}
                onChange={(v) => set((s) => { s.voice.autoAdvanceSingle = v; })}
              />
              <ToggleRow
                title="多选说完自动进入下一题"
                hint={"关闭则需说「完成」"}
                checked={settings.voice.autoAdvanceMultiple}
                onChange={(v) => set((s) => { s.voice.autoAdvanceMultiple = v; })}
              />
              <ToggleRow
                title="在页面上高亮当前题目"
                hint="读题琥珀色 / 作答绿色"
                checked={settings.voice.highlight}
                onChange={(v) => set((s) => { s.voice.highlight = v; })}
              />
              <Separator />
              <ToggleRow
                title="论述题 AI 整理"
                hint="说完后请求 LLM 整理成书面语（先预览、可编辑、可改用原文）"
                checked={settings.essay.autoClean}
                onChange={(v) => set((s) => { s.essay.autoClean = v; })}
              />
              <Field label="识别语言">
                <Select value={settings.voice.lang} onValueChange={(v) => set((s) => { s.voice.lang = v; })}>
                  <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="zh-CN">中文（普通话）</SelectItem>
                    <SelectItem value="zh-HK">中文（粤语）</SelectItem>
                    <SelectItem value="en-US">English (US)</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="朗读语速" hint="0.5 – 2">
                <Input
                  type="number" step="0.1" min="0.5" max="2" className="w-28"
                  value={settings.voice.rate}
                  onChange={(e) => set((s) => { s.voice.rate = parseFloat(e.target.value) || 1; })}
                />
              </Field>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="sticky bottom-4 mt-6 flex items-center gap-3 rounded-xl border bg-background p-3 shadow-lg">
        <Button onClick={save} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />} 保存设置
        </Button>
        <span className="text-xs text-muted-foreground">
          保存时会为 LLM / 转写服务域名申请访问权限（浏览器弹窗）
        </span>
      </div>
    </div>
  );
}

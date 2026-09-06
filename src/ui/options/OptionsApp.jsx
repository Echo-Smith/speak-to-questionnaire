import React, { useEffect, useState } from 'react';
import { Mic, KeyRound, Speech, Volume2, Loader2, CheckCircle2, XCircle, Languages } from 'lucide-react';
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
const t = (...a) => globalThis.STQ_I18N.t(...a);

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
  const [micState, setMicState] = useState({ text: '', ok: null, granted: false });
  const [testState, setTestState] = useState({ text: '', ok: null });
  const [saveState, setSaveState] = useState({ text: '', ok: null });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    stq.load().then((s) => {
      globalThis.STQ_I18N_APPLY(s.ui && s.ui.lang);
      setSettings(s);
    });
    // 麦克风授权状态探测：已授权则隐藏按钮、显示确认徽章
    navigator.permissions.query({ name: 'microphone' })
      .then((st) => setMicState({ granted: st.state === 'granted' }))
      .catch(() => {});
  }, []);

  if (!settings) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> {t('ui.micRequesting')}
      </div>
    );
  }

  const set = (fn) => setSettings((s) => {
    const next = structuredClone(s);
    fn(next);
    return next;
  });

  async function grantMic() {
    setMicState({ text: t('ui.micRequesting'), ok: null });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      setMicState({ text: t('ui.micOk'), ok: true, granted: true });
    } catch (e) {
      setMicState({ text: e.message, ok: false });
    }
  }

  async function testLlm() {
    setTestState({ text: '…', ok: null });
    const check = stq.validateBaseUrl(settings.llm.baseUrl, { allowPrivate: settings.llm.allowPrivateHosts });
    if (!check.ok) return setTestState({ text: 'Base URL: ' + check.error, ok: false });
    if (!settings.llm.apiKey.trim()) return setTestState({ text: t('ui.needKey'), ok: false });
    if (!settings.llm.model.trim()) return setTestState({ text: t('ui.needModel'), ok: false });
    const p = await stq.requestOriginPermission(check.url, settings.llm.allowPrivateHosts);
    if (!p.ok) return setTestState({ text: p.error, ok: false });
    const resp = await chrome.runtime.sendMessage({
      type: 'stq-llm-chat',
      payload: {
        messages: [{ role: 'user', content: 'reply with "ok"' }],
        temperature: 0,
        override: { ...settings.llm, baseUrl: check.url },
      },
    });
    if (resp && resp.ok) setTestState({ text: t('ui.testOk'), ok: true });
    else setTestState({ text: (resp && resp.error) || 'failed', ok: false });
  }

  async function save() {
    setSaving(true);
    setSaveState({ text: '', ok: null });
    try {
      const llmFilled = [settings.llm.baseUrl, settings.llm.apiKey, settings.llm.model].filter((x) => x.trim());
      if (llmFilled.length > 0) {
        if (!settings.llm.baseUrl.trim()) throw new Error(t('ui.needBaseUrl'));
        if (!settings.llm.apiKey.trim()) throw new Error(t('ui.needKey'));
        if (!settings.llm.model.trim()) throw new Error(t('ui.needModel'));
      }
      const llmCheck = stq.validateBaseUrl(settings.llm.baseUrl, { allowPrivate: settings.llm.allowPrivateHosts });
      if (!llmCheck.ok) throw new Error('Base URL: ' + llmCheck.error);

      const next = structuredClone(settings);
      next.llm.baseUrl = llmCheck.url;

      if (next.asr.mode === 'api' || (next.asr.mode === 'auto' && next.asr.baseUrl.trim())) {
        const asrCheck = stq.validateBaseUrl(next.asr.baseUrl, { allowPrivate: next.asr.allowPrivateHosts });
        if (!asrCheck.ok) throw new Error('ASR Base URL: ' + asrCheck.error);
        if (!next.asr.apiKey.trim()) throw new Error(t('ui.needAsrKey'));
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
      setSaveState({ text: t('ui.saved'), ok: true });
    } catch (e) {
      setSaveState({ text: e.message, ok: false });
    } finally {
      setSaving(false);
    }
  }

  function switchLang(v) {
    set((s) => { s.ui.lang = v; });
    globalThis.STQ_I18N_APPLY(v);
  }

  const banner = saveState.text || testState.text || micState.text;
  const bannerOk = saveState.text ? saveState.ok : testState.text ? testState.ok : micState.ok;

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="text-xl font-bold tracking-tight">{t('ui.optTitle')}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t('ui.optSubtitle')}</p>

      {banner && (
        <Alert variant={bannerOk === false ? 'destructive' : bannerOk ? 'success' : 'default'} className="mt-4">
          {bannerOk === false ? <XCircle className="h-4 w-4" /> : bannerOk ? <CheckCircle2 className="h-4 w-4" /> : null}
          <AlertDescription>{banner}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="llm" className="mt-6">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="mic"><Mic className="h-4 w-4" /><span className="ml-1 hidden sm:inline">{t('ui.tabMic')}</span></TabsTrigger>
          <TabsTrigger value="llm"><KeyRound className="h-4 w-4" /><span className="ml-1 hidden sm:inline">{t('ui.tabLlm')}</span></TabsTrigger>
          <TabsTrigger value="asr"><Speech className="h-4 w-4" /><span className="ml-1 hidden sm:inline">{t('ui.tabAsr')}</span></TabsTrigger>
          <TabsTrigger value="voice"><Volume2 className="h-4 w-4" /><span className="ml-1 hidden sm:inline">{t('ui.tabVoice')}</span></TabsTrigger>
          <TabsTrigger value="lang"><Languages className="h-4 w-4" /></TabsTrigger>
        </TabsList>

        <TabsContent value="mic">
          <Card>
            <CardHeader>
              <CardTitle>{t('ui.micTitle')}</CardTitle>
              <CardDescription>{t('ui.micDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center gap-3">
              {micState.granted ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-emerald-600/40 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" /> {t('ui.micOk')}
                </span>
              ) : (
                <Button onClick={grantMic}><Mic className="h-4 w-4" /> {t('ui.micBtn')}</Button>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="llm">
          <Card>
            <CardHeader>
              <CardTitle>{t('ui.llmTitle')}</CardTitle>
              <CardDescription>{t('ui.llmDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label={t('ui.protocol')}>
                  <Select value={settings.llm.protocol} onValueChange={(v) => set((s) => { s.llm.protocol = v; })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="openai">{t('ui.protocolOpenai')}</SelectItem>
                      <SelectItem value="anthropic">{t('ui.protocolAnthropic')}</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label={t('ui.authStyle')}>
                  <Select value={settings.llm.authStyle} onValueChange={(v) => set((s) => { s.llm.authStyle = v; })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">{t('ui.authAuto')}</SelectItem>
                      <SelectItem value="bearer">{t('ui.authBearer')}</SelectItem>
                      <SelectItem value="api-key">{t('ui.authApiKey')}</SelectItem>
                      <SelectItem value="x-api-key">{t('ui.authXApiKey')}</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <Field label={t('ui.baseUrl')} hint={t('ui.baseUrlHint')}>
                <Input value={settings.llm.baseUrl} onChange={(e) => set((s) => { s.llm.baseUrl = e.target.value; })} placeholder="https://api.openai.com/v1" />
              </Field>
              <Field label={t('ui.apiKey')}>
                <Input type="password" autoComplete="off" value={settings.llm.apiKey} onChange={(e) => set((s) => { s.llm.apiKey = e.target.value; })} placeholder="sk-..." />
              </Field>
              <Field label={t('ui.model')}>
                <Input value={settings.llm.model} onChange={(e) => set((s) => { s.llm.model = e.target.value; })} placeholder="gpt-4o-mini" />
              </Field>
              <ToggleRow title={t('ui.disableThinking')} hint={t('ui.disableThinkingHint')} checked={settings.llm.disableThinking !== false} onChange={(v) => set((s) => { s.llm.disableThinking = v; })} />
              <ToggleRow title={t('ui.allowPrivate')} hint={t('ui.allowPrivateHint')} checked={!!settings.llm.allowPrivateHosts} onChange={(v) => set((s) => { s.llm.allowPrivateHosts = v; })} />
              <Button variant="outline" onClick={testLlm}>{t('ui.test')}</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="asr">
          <Card>
            <CardHeader>
              <CardTitle>{t('ui.asrTitle')}</CardTitle>
              <CardDescription>{t('ui.asrDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label={t('ui.asrEngine')}>
                <Select value={settings.asr.mode} onValueChange={(v) => set((s) => { s.asr.mode = v; })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">{t('ui.asrAuto')}</SelectItem>
                    <SelectItem value="webspeech">{t('ui.asrWebspeech')}</SelectItem>
                    <SelectItem value="api">{t('ui.asrApi')}</SelectItem>
                    <SelectItem value="llm-multimodal">{t('ui.asrMultimodal')}</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              {settings.asr.mode === 'auto' && (
                <Field label={t('ui.asrPrefer')}>
                  <Select value={settings.asr.prefer} onValueChange={(v) => set((s) => { s.asr.prefer = v; })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="browser-first">{t('ui.preferBrowser')}</SelectItem>
                      <SelectItem value="service-first">{t('ui.preferService')}</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              )}
              {settings.asr.mode === 'llm-multimodal' && (
                <Alert className="border-primary/30 bg-primary/5">
                  <AlertDescription>{t('ui.asrMultimodalNote')}</AlertDescription>
                </Alert>
              )}
              {settings.asr.mode !== 'llm-multimodal' && settings.asr.mode !== 'webspeech' && (
                <>
                  <Separator />
                  <Field label={t('ui.asrBaseUrl')}>
                    <Input value={settings.asr.baseUrl} onChange={(e) => set((s) => { s.asr.baseUrl = e.target.value; })} placeholder="https://api.openai.com/v1" />
                  </Field>
                  <Field label={t('ui.asrKey')}>
                    <Input type="password" autoComplete="off" value={settings.asr.apiKey} onChange={(e) => set((s) => { s.asr.apiKey = e.target.value; })} placeholder="sk-..." />
                  </Field>
                  <Field label={t('ui.asrModel')} hint={t('ui.asrModelHint')}>
                    <Input value={settings.asr.model} onChange={(e) => set((s) => { s.asr.model = e.target.value; })} placeholder="whisper-1" />
                  </Field>
                  <ToggleRow title={t('ui.asrPrivate')} checked={!!settings.asr.allowPrivateHosts} onChange={(v) => set((s) => { s.asr.allowPrivateHosts = v; })} />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="voice">
          <Card>
            <CardHeader>
              <CardTitle>{t('ui.voiceTitle')}</CardTitle>
              <CardDescription>{t('ui.voiceDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <ToggleRow title={t('ui.readQuestion')} hint={t('ui.readQuestionHint')} checked={settings.voice.readQuestion !== false} onChange={(v) => set((s) => { s.voice.readQuestion = v; })} />
              <ToggleRow title={t('ui.readOptions')} checked={settings.voice.readOptions} onChange={(v) => set((s) => { s.voice.readOptions = v; })} />
              <ToggleRow title={t('ui.autoSingle')} checked={settings.voice.autoAdvanceSingle} onChange={(v) => set((s) => { s.voice.autoAdvanceSingle = v; })} />
              <ToggleRow title={t('ui.autoMulti')} hint={t('ui.autoMultiHint')} checked={settings.voice.autoAdvanceMultiple} onChange={(v) => set((s) => { s.voice.autoAdvanceMultiple = v; })} />
              <ToggleRow title={t('ui.highlight')} hint={t('ui.highlightHint')} checked={settings.voice.highlight} onChange={(v) => set((s) => { s.voice.highlight = v; })} />
              <Separator />
              <ToggleRow title={t('ui.essayClean')} hint={t('ui.essayCleanHint')} checked={settings.essay.autoClean} onChange={(v) => set((s) => { s.essay.autoClean = v; })} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="lang">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Languages className="h-4 w-4" /> {t('ui.uiLang')}</CardTitle>
              <CardDescription>
                auto → {globalThis.STQ_I18N.detect() === 'zh' ? 'zh-CN' : 'en'} · voice commands remain Chinese keywords (see README)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Select value={settings.ui.lang || 'auto'} onValueChange={switchLang}>
                <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">{t('ui.langAuto')}</SelectItem>
                  <SelectItem value="zh">{t('ui.langZh')}</SelectItem>
                  <SelectItem value="en">{t('ui.langEn')}</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="sticky bottom-4 mt-6 flex items-center gap-3 rounded-xl border bg-background p-3 shadow-lg">
        <Button onClick={save} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />} {t('ui.save')}
        </Button>
        <span className="text-xs text-muted-foreground">{t('ui.saveHint')}</span>
      </div>
    </div>
  );
}

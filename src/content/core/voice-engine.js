/**
 * 语音交互状态机
 *
 * 状态：
 *   idle        未启动
 *   speaking    正在朗读题目（此期间 ASR 暂停，避免识别到扬声器里的读题声）
 *   listening   等待作答/指令（ASR 活跃）
 *   dictate     论述题听写中（仅"结束作答/说完了/写完了/完成作答/回答完毕"结束）
 *   essay       论述题整理预览（等待"确认/用原文/重说"）
 *   finished    全部答完，等待"提交/上一题"
 *
 * 防串题机制：每道题一个会话纪元（epoch），presentQuestion 时 ASR 重启，
 * 上一题残留的音频块与识别结果全部作废，杜绝"上一题的话答到下一题"。
 */
(function () {
  'use strict';
  const STQ = globalThis.STQ;

  class VoiceEngine {
    constructor(survey, ui, settings) {
      this.survey = survey;
      this.ui = ui; // overlay 接口 { setState, setTranscript, setQuestion, showEssay, hideEssay, setMicOn }
      this.settings = settings;
      this.state = 'idle';
      this.questions = [];
      this.idx = 0;
      this.asrCtl = null;
      this.epoch = 0;        // 题目会话纪元：换题即失效
      this.lastSeg = '';     // 听写去重：ASR 对同一段话常回传两次 final
      this.dictation = '';
      this.essayOriginal = '';
      this.essayCleaned = '';
      this.busy = false;
    }

    /* ---------------- 生命周期 ---------------- */

    async start() {
      if (this.state !== 'idle') return;
      this.ui.setState('正在识别页面题目…', 'busy');
      this.questions = await this.survey.list();
      if (!this.questions.length) {
        this.ui.setState('未识别到题目（SPA 页面可稍后点麦克风重试）', 'error');
        this.ui.setMicOn(false);
        return;
      }
      this.idx = 0;
      this.presentQuestion();
    }

    stop() {
      this.state = 'idle';
      this.epoch++;
      clearTimeout(this.asrWatch);
      this.pauseASR();
      STQ.TTS.cancel();
      if (STQ.Focus) STQ.Focus.hide();
      this.ui.hideEssay();
      this.ui.setTranscript('');
      this.ui.setState('已停止', 'idle');
      this.ui.setMicOn(false);
    }

    /* ---------------- ASR 会话管理 ---------------- */

    /** 开启新一轮识别（每道题一次；旧会话的缓冲音频与结果全部作废） */
    restartASR() {
      this.epoch++;
      if (this.asrCtl) { this.asrCtl.stop(); this.asrCtl = null; }
      this.beginListening();
    }

    /** 朗读期间暂停识别（防止把扬声器里的读题声识别成回答） */
    pauseASR() {
      if (this.asrCtl) { this.asrCtl.stop(); this.asrCtl = null; }
      this.ui.setMicOn(false);
    }

    beginListening() {
      if (this.asrCtl) return;
      const myEpoch = this.epoch;
      this.lastAsrEventAt = Date.now();
      clearTimeout(this.asrWatch);
      // 静默 watchdog：20 秒无任何识别事件（多为麦克风授权缺失/识别方式不通），给出可操作提示
      this.asrWatch = setTimeout(() => {
        if (myEpoch !== this.epoch || this.state === 'idle' || this.asrCtl == null) return;
        if (Date.now() - this.lastAsrEventAt < 20000) return;
        this.ui.setState('20 秒未收到语音数据：请确认①设置页已「授权麦克风」②识别方式配置有效（面板左侧为当前引擎）', 'error');
      }, 20000);
      this.asrCtl = STQ.createASR(this.settings, {
        onPartial: (t) => { if (myEpoch === this.epoch) { this.lastAsrEventAt = Date.now(); this.ui.setTranscript(t); } },
        onFinal: (t) => { if (myEpoch === this.epoch) { this.lastAsrEventAt = Date.now(); this.handleFinal(t); } },
        onError: (e) => {
          if (myEpoch !== this.epoch) return;
          const q = this.currentQuestion();
          if (q && q.el && STQ.Focus && this.settings.voice.highlight) {
            STQ.Focus.focus(q.el, 'error', '识别异常');
          }
          this.ui.setState(e.message + '（点击麦克风重试）', 'error');
        },
      });
      if (this.state !== 'idle') this.ui.setMicOn(true);
    }

    handleFinal(text) {
      if (this.state === 'idle' || this.busy) return;
      this.ui.setTranscript(text);

      // 听写模式
      if (this.state === 'dictate') {
        this.handleDictation(text);
        return;
      }

      // 论述整理预览
      if (this.state === 'essay') {
        this.handleEssayReview(text);
        return;
      }

      // 完成态
      if (this.state === 'finished') {
        this.handleFinished(text);
        return;
      }

      // 聆听中：先查指令，再匹配答案
      if (this.state === 'listening') {
        this.handleListening(text);
      }
    }

    /* ---------------- 题目呈现 ---------------- */

    currentQuestion() { return this.questions[this.idx]; }

    presentQuestion(forceRead) {
      const q = this.currentQuestion();
      if (!q) return;
      STQ.scrollIntoViewCenter(q.el);
      this.ui.setQuestion(`第${q.topic}题 ${q.title}`);

      // 换题：作废旧 ASR 会话（残留音频/结果不再处理）
      this.epoch++;
      this.pauseASR();

      const readAloud = forceRead === true || this.settings.voice.readQuestion !== false;
      if (!readAloud) {
        this.enterAnswerState();
        return;
      }

      let spoken = `第${q.topic}题。${q.title}。`;
      if (q.type === STQ.QTypes.TEXT) {
        spoken += '请直接说出你的回答，说完后说"结束作答"。';
      } else if (this.settings.voice.readOptions && q.options.length) {
        const optText = q.options
          .map((o, i) => `${letterOf(i)}、${STQ.normText(o.label).replace(/^[A-Ja-j]、/, '')}`)
          .join('。');
        spoken += q.type === STQ.QTypes.MULTIPLE
          ? `请选择，可多选：${optText}。选择后说"完成"进入下一题。`
          : `请选择：${optText}。`;
      } else if (q.type === STQ.QTypes.MULTIPLE) {
        spoken += '可多选，选择后说"完成"进入下一题。';
      }
      this.state = 'speaking';
      if (STQ.Focus && this.settings.voice.highlight) {
        STQ.Focus.focus(q.el, 'speaking', `读题中 · 第${q.topic}题`);
      }
      this.ui.setState(`第${q.topic}题（${this.idx + 1}/${this.questions.length}）· 正在朗读`, 'speaking');
      // 朗读期间 ASR 保持暂停，读完自动恢复；epoch 保证跳题后的过期回调不打断新题
      const myEpoch = this.epoch;
      STQ.TTS.speak(spoken, () => {
        if (this.state === 'speaking' && myEpoch === this.epoch) this.enterAnswerState();
      });
    }

    enterAnswerState() {
      const q = this.currentQuestion();
      if (!q) return;
      if (q.type === STQ.QTypes.TEXT) {
        this.state = 'dictate';
        this.dictation = '';
        this.lastSeg = '';
        if (STQ.Focus && this.settings.voice.highlight) {
          STQ.Focus.focus(q.el, 'listening', '听写中 · 请说话');
        }
        this.ui.setState('听写中…说完请说"结束作答"', 'listening');
      } else {
        this.state = 'listening';
        const filled = q.answerText();
        if (STQ.Focus && this.settings.voice.highlight) {
          STQ.Focus.focus(q.el, 'listening', filled ? '请作答 · 补充或修改' : '请作答');
        }
        this.ui.setState(
          filled ? `等待作答（已答：${filled}）` : '聆听中…',
          'listening'
        );
      }
      this.restartASR(); // 进入作答态才开麦（epoch 已在 presentQuestion 自增）
    }

    /* ---------------- 指令处理 ---------------- */

    async handleListening(text) {
      const cmd = STQ.Matcher.detectCommand(text);
      if (cmd) {
        await this.runCommand(cmd.cmd);
        return;
      }
      const q = this.currentQuestion();
      if (!q) return;

      switch (q.type) {
        case STQ.QTypes.SINGLE:
        case STQ.QTypes.DROPDOWN:
        case STQ.QTypes.SCALE:
          await this.answerSingle(q, text);
          break;
        case STQ.QTypes.MULTIPLE:
          await this.answerMultiple(q, text);
          break;
        default:
          if (STQ.Focus && this.settings.voice.highlight) STQ.Focus.focus(q.el, 'error', '暂不支持语音');
          this.ui.setState('该题型暂不支持语音作答，请手动作答后说"下一题"', 'error');
      }
    }

    async runCommand(cmd) {
      switch (cmd) {
        case 'next': await this.goNext(); break;
        case 'prev': await this.goPrev(); break;
        case 'repeat': this.presentQuestion(true); break;
        case 'skip': await this.goNext(true); break;
        case 'submit': await this.trySubmit(); break;
        default: break;
      }
    }

    /* ---------------- 作答 ---------------- */

    async answerSingle(q, text) {
      let i = STQ.Matcher.matchOption(text, q.options);
      if (i < 0) i = await this.llmResolve(q, text);
      if (i === -2) return; // LLM 已按指令处理
      if (i < 0) {
        if (STQ.Focus && this.settings.voice.highlight) STQ.Focus.focus(q.el, 'error', '未匹配，请重说');
        this.ui.setState('没匹配到选项，请再说一次（说"重复"可重听题目）', 'error');
        return;
      }
      q.write([q.options[i].label]);
      const label = STQ.normText(q.options[i].label).replace(/^[A-Ja-j]、/, '');
      this.ui.setState(`已选：${label}`, 'ok');
      STQ.TTS.speak(`已选${label}`);
      if (this.settings.voice.autoAdvanceSingle) {
        await sleep(600);
        await this.goNext();
      } else {
        this.enterAnswerState();
      }
    }

    async answerMultiple(q, text) {
      const { select, deselect } = STQ.Matcher.matchMulti(text, q.options);
      if (!select.length && !deselect.length) {
        const i = await this.llmResolve(q, text);
        if (i === -2) return; // LLM 已按指令处理
        if (i >= 0) select.push(i);
      }
      if (!select.length && !deselect.length) {
        if (STQ.Focus && this.settings.voice.highlight) STQ.Focus.focus(q.el, 'error', '未匹配，请重说');
        this.ui.setState('没匹配到选项，请再说一次（说"完成"可进入下一题）', 'error');
        return;
      }
      const picked = new Set(
        q.options.map((o, i) => (o.input && o.input.checked ? i : -1)).filter((i) => i >= 0)
      );
      for (const i of select) picked.add(i);
      for (const i of deselect) picked.delete(i);

      // write() 是覆盖式写入：先清空再按 picked 写入
      q.clear();
      const labels = [...picked].map((i) => q.options[i].label);
      if (labels.length) q.write(labels);

      const shown = [...picked].map((i) => STQ.normText(q.options[i].label).replace(/^[A-Ja-j]、/, '')).join('、');
      this.ui.setState(
        shown ? `已选：${shown}。说"完成"进入下一题` : '未选择。请说出选项，或说"完成"进入下一题',
        'ok'
      );
      STQ.TTS.speak(shown ? `已选${shown}。说完成进入下一题` : '未选择。说完成进入下一题');
      if (this.settings.voice.autoAdvanceMultiple) {
        await sleep(600);
        await this.goNext();
      } else {
        this.enterAnswerState();
      }
    }

    /* ---------------- 论述题 ---------------- */

    handleDictation(text) {
      const seg = String(text || '').trim();
      if (!seg) return;
      // ASR 对同一段语音常回传两次相同 final（restart 后尤其常见），去重
      if (seg === this.lastSeg) {
        this.ui.setState(`听写中（${this.dictation.length}字）… 说"结束作答"完成`, 'listening');
        return;
      }

      const endPhrase = STQ.Matcher.isDictateEnd(seg);
      if (endPhrase) {
        const tail = seg.replace(new RegExp(endPhrase + '[\\s。.!！]*$'), '').trim();
        if (tail && tail !== this.lastSeg) this.appendDictation(tail);
        this.finishDictation();
        return;
      }
      this.lastSeg = seg;
      this.appendDictation(seg);
      this.ui.setState(`听写中（${this.dictation.length}字）… 说"结束作答"完成`, 'listening');
    }

    /** 追加听写段：只在上一段没有句末标点时补句号，避免"输入后自动加。" */
    appendDictation(seg) {
      if (this.dictation) {
        const prev = this.dictation;
        const needSep = !/[。！？，、；.!?,;\n]$/.test(prev);
        this.dictation = prev + (needSep ? '。' : '') + seg;
      } else {
        this.dictation = seg;
      }
    }

    async finishDictation() {
      const q = this.currentQuestion();
      if (!this.dictation.trim()) {
        this.ui.setState('未听到内容，继续说或说"跳过"', 'error');
        this.state = 'dictate';
        return;
      }
      this.essayOriginal = this.dictation.trim();

      if (this.settings.essay.autoClean && STQ.LLM.available) {
        this.state = 'busy';
        this.ui.setState('正在整理…', 'busy');
        try {
          this.essayCleaned = await STQ.LLM.cleanEssay(this.essayOriginal, q && q.title);
        } catch (e) {
          this.essayCleaned = '';
          this.ui.setState('整理失败（' + e.message + '），可使用原文', 'error');
        }
      } else {
        this.essayCleaned = '';
      }

      this.state = 'essay';
      this.ui.showEssay({
        original: this.essayOriginal,
        cleaned: this.essayCleaned,
        onConfirm: (finalText) => this.confirmEssay(finalText),
        onUseOriginal: () => this.confirmEssay(this.essayOriginal),
        onRetry: () => {
          this.state = 'dictate';
          this.dictation = '';
          this.lastSeg = '';
          this.ui.hideEssay();
          this.ui.setState('听写中…说完请说"结束作答"', 'listening');
        },
      });
      if (this.essayCleaned) {
        STQ.TTS.speak('整理完成，请查看预览。确认请说"确认"，使用原文请说"原文"，重新说请说"重说"。');
      } else {
        STQ.TTS.speak('请查看听写内容。确认请说"确认"，重新说请说"重说"。');
      }
    }

    handleEssayReview(text) {
      const cmd = STQ.Matcher.detectCommand(text);
      if (!cmd) {
        this.ui.setState('请说"确认"写入，"原文"使用原始内容，"重说"重新作答', 'error');
        return;
      }
      if (cmd.cmd === 'confirm') {
        const finalText = this.essayCleaned || this.essayOriginal;
        this.confirmEssay(finalText);
      } else if (cmd.cmd === 'cancel') {
        this.confirmEssay(this.essayOriginal);
      } else if (cmd.cmd === 'skip') {
        this.ui.hideEssay();
        this.goNext(true);
      } else {
        this.ui.hideEssay();
        this.state = 'dictate';
        this.dictation = '';
        this.lastSeg = '';
        this.ui.setState('听写中…说完请说"结束作答"', 'listening');
      }
    }

    async confirmEssay(finalText) {
      const q = this.currentQuestion();
      this.ui.hideEssay();
      if (q) {
        q.write(finalText);
        this.ui.setState(`已作答（${finalText.length}字）`, 'ok');
      }
      await sleep(400);
      await this.goNext();
    }

    /* ---------------- 翻页 / 提交 ---------------- */

    async goNext(skip) {
      if (this.busy) return;
      this.busy = true;
      try {
        if (this.idx < this.questions.length - 1) {
          this.idx += 1;
          this.presentQuestion();
        } else if (this.survey.hasNextPage()) {
          this.ui.setState('正在翻页…', 'busy');
          const r = await this.survey.gotoNextPage();
          if (!r.ok) {
            this.ui.setState(r.error || '翻页失败', 'error');
            STQ.TTS.speak(r.error || '翻页失败');
            this.state = 'listening';
            return;
          }
          this.questions = await this.survey.list();
          this.idx = 0;
          if (!this.questions.length) {
            this.enterFinished();
            return;
          }
          this.presentQuestion();
        } else {
          this.enterFinished();
        }
      } finally {
        this.busy = false;
      }
      if (skip) this.ui.setState('已跳过', 'ok');
    }

    async goPrev() {
      if (this.busy) return;
      this.busy = true;
      try {
        STQ.TTS.cancel();
        if (this.idx > 0) {
          this.idx -= 1;
          this.presentQuestion();
        } else if (this.survey.hasPrevPage()) {
          this.ui.setState('正在返回上一页…', 'busy');
          const r = await this.survey.gotoPrevPage();
          if (!r.ok) {
            this.ui.setState(r.error || '返回失败', 'error');
            this.state = 'listening';
            return;
          }
          this.questions = await this.survey.list();
          this.idx = Math.max(0, this.questions.length - 1);
          this.presentQuestion();
        } else {
          this.ui.setState('已经是第一题了', 'error');
          STQ.TTS.speak('已经是第一题了');
          this.state = 'listening';
        }
      } finally {
        this.busy = false;
      }
    }

    enterFinished() {
      this.state = 'finished';
      this.ui.setState('全部完成。说"提交"提交问卷，或说"上一题"修改', 'ok');
      STQ.TTS.speak('所有题目已完成。确认无误请说"提交"，需要修改请说"上一题"。');
    }

    async handleFinished(text) {
      const cmd = STQ.Matcher.detectCommand(text);
      if (!cmd) return;
      if (cmd.cmd === 'submit' || cmd.cmd === 'confirm') {
        await this.trySubmit();
      } else if (cmd.cmd === 'prev') {
        await this.goPrev();
      }
    }

    async trySubmit() {
      this.ui.setState('正在提交…', 'busy');
      STQ.TTS.cancel();
      this.survey.submit();
      this.stop();
      this.ui.setState('已点击提交，请留意页面结果', 'ok');
    }

    /* ---------------- LLM 兜底 ---------------- */

    async llmResolve(q, text) {
      if (!STQ.LLM.available) return -1;
      this.ui.setState('正在理解…（LLM）', 'busy');
      try {
        const r = await STQ.LLM.resolveUtterance(q, text);
        if (r && r.action === 'answer') {
          const n = parseInt(r.value, 10);
          if (n >= 1 && n <= q.options.length) return n - 1;
        }
        if (r && r.action === 'command') {
          await this.runCommand(r.value);
          return -2; // 已处理指令
        }
      } catch (e) {
        this.ui.setState('LLM 调用失败：' + e.message, 'error');
      }
      return -1;
    }
  }

  function letterOf(i) { return String.fromCharCode(65 + i); }
  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  STQ.VoiceEngine = VoiceEngine;
})();

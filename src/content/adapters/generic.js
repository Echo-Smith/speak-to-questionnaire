/**
 * 通用适配器（experimental）：识别任何结构标准的表单页面
 * （radio/checkbox 按 name 分组、textarea/text/select 单控件）。
 * 通过 popup 的"在本页启用"注入到未适配的问卷平台使用。
 * 题干提取按启发式：label[for] > fieldset legend > aria-label > 临近标题 > 输入框 name。
 */
(function () {
  'use strict';
  const STQ = globalThis.STQ;

  function q(root, sel) { return root.querySelector(sel); }
  function qa(root, sel) { return Array.from(root.querySelectorAll(sel)); }

  function headingNear(el) {
    // 向上找最多 4 层祖先，取其前方的标题类兄弟节点
    let node = el;
    for (let i = 0; i < 4 && node; i++) {
      let sib = node.previousElementSibling;
      for (let j = 0; sib && j < 5; j++) {
        const tag = sib.tagName;
        const cls = String(sib.className || '');
        if (/^H[1-6]$/.test(tag) || /question|title|label|legend|prompt/i.test(cls)) {
          const t = STQ.normText(sib.textContent);
          if (t) return t;
        }
        sib = sib.previousElementSibling;
      }
      node = node.parentElement;
    }
    return '';
  }

  function titleFor(input) {
    if (input.id) {
      const l = q(document, 'label[for="' + CSS.escape(input.id) + '"]');
      if (l && STQ.normText(l.textContent)) return STQ.normText(l.textContent);
    }
    const aria = input.getAttribute('aria-label') || input.getAttribute('placeholder');
    if (aria && STQ.normText(aria)) return STQ.normText(aria);
    const fieldset = input.closest('fieldset');
    if (fieldset) {
      const legend = q(fieldset, 'legend');
      if (legend && STQ.normText(legend.textContent)) return STQ.normText(legend.textContent);
    }
    return headingNear(input) || STQ.normText(input.name) || '未命名题目';
  }

  function containerFor(inputs) {
    const fieldset = inputs[0].closest('fieldset');
    if (fieldset) return fieldset;
    let c = inputs[0].parentElement;
    for (let i = 0; i < 6 && c; i++) {
      if (inputs.every((inp) => c.contains(inp))) return c;
      c = c.parentElement;
    }
    return inputs[0].parentElement;
  }

  function makeChoiceQuestion(inputs, type, index) {
    const options = inputs.map((input, i) => {
      const labelEl = input.closest('label');
      const label = STQ.normText(
        (labelEl ? labelEl.textContent : '') || input.getAttribute('aria-label') || input.value
      ).replace(/^[A-Ja-j]\s*[、\.．]\s*/, '');
      return { value: input.value || String(i + 1), label: label || '选项' + (i + 1), el: labelEl || input.parentElement, input };
    });
    const el = containerFor(inputs);
    return STQ.createQuestion({
      type,
      title: titleFor(inputs[0]),
      required: inputs[0].required || inputs[0].getAttribute('aria-required') === 'true',
      options,
      el,
      answerText() {
        return options.filter((o) => o.input.checked).map((o) => o.label).join('；');
      },
      write(labels) {
        for (const o of options) {
          const want = labels.includes(o.label) || labels.includes(o.value);
          if (o.input.checked !== want) {
            o.input.checked = want;
            STQ.dispatchEvent(o.input, ['input', 'change']);
          }
          if (want) {
            const labelNode = o.input.closest('label');
            if (labelNode) { try { labelNode.click(); } catch (_) { /* ignore */ } }
          }
        }
      },
      clear() {
        for (const o of options) {
          if (o.input.checked) {
            o.input.checked = false;
            STQ.dispatchEvent(o.input, ['input', 'change']);
          }
        }
      },
    });
  }

  function makeTextQuestion(input, index) {
    return STQ.createQuestion({
      type: STQ.QTypes.TEXT,
      title: titleFor(input),
      required: input.required || input.getAttribute('aria-required') === 'true',
      el: input.closest('fieldset') || input.parentElement,
      answerText() { return STQ.normText(input.value); },
      write(text) {
        input.value = text;
        input.focus();
        STQ.dispatchEvent(input, ['input', 'change']);
        input.blur();
      },
      clear() { input.value = ''; STQ.dispatchEvent(input, ['input']); },
    });
  }

  function makeDropdownQuestion(select, index) {
    const options = qa(select, 'option')
      .filter((o) => o.value !== '')
      .map((o, i) => ({ value: o.value, label: STQ.normText(o.textContent), el: o, input: o }));
    return STQ.createQuestion({
      type: STQ.QTypes.DROPDOWN,
      title: titleFor(select),
      required: select.required,
      options,
      el: select.closest('fieldset') || select.parentElement,
      answerText() {
        const cur = select.options[select.selectedIndex];
        return cur ? STQ.normText(cur.textContent) : '';
      },
      write(labels) {
        const hit = options.find((o) => labels.includes(o.label) || labels.includes(o.value));
        if (hit) { select.value = hit.value; STQ.dispatchEvent(select, ['input', 'change']); }
      },
      clear() { select.value = ''; STQ.dispatchEvent(select, ['change']); },
    });
  }

  function collectQuestions() {
    const result = [];
    const claimed = new Set();

    // 1. radio 分组 -> 单选
    const radioGroups = new Map();
    for (const input of qa(document, 'input[type=radio]').filter(STQ.isVisible)) {
      const key = input.name || input.id || 'radio-' + result.length;
      if (!radioGroups.has(key)) radioGroups.set(key, []);
      radioGroups.get(key).push(input);
      claimed.add(input);
    }
    for (const inputs of radioGroups.values()) {
      if (inputs.length >= 2) {
        result.push(makeChoiceQuestion(inputs, STQ.QTypes.SINGLE, result.length));
      }
    }

    // 2. checkbox 分组 -> 多选
    const checkGroups = new Map();
    for (const input of qa(document, 'input[type=checkbox]').filter(STQ.isVisible)) {
      const key = input.name || input.id || 'check-' + result.length;
      if (!checkGroups.has(key)) checkGroups.set(key, []);
      checkGroups.get(key).push(input);
      claimed.add(input);
    }
    for (const inputs of checkGroups.values()) {
      if (inputs.length >= 2) {
        result.push(makeChoiceQuestion(inputs, STQ.QTypes.MULTIPLE, result.length));
      }
    }

    // 3. 下拉
    for (const select of qa(document, 'select').filter(STQ.isVisible)) {
      claimed.add(select);
      result.push(makeDropdownQuestion(select, result.length));
    }

    // 4. 独立文本控件（排除被上面认领的、"其他"补充框等）
    for (const input of qa(
      document,
      'textarea, input[type=text], input[type=number], input[type=email], input[type=tel]'
    ).filter(STQ.isVisible)) {
      if (claimed.has(input)) continue;
      if (input.closest('label') && q(input.closest('label'), 'input[type=radio],input[type=checkbox]')) continue;
      if (/OtherRadioText|other/i.test(input.name || '') ) continue;
      claimed.add(input);
      result.push(makeTextQuestion(input, result.length));
    }

    return result
      .filter(Boolean)
      .sort((a, b) => {
        const pos = a.el.compareDocumentPosition(b.el);
        return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
      })
      .map((question, i) => Object.assign(question, { index: i, topic: question.topic || i + 1 }));
  }

  const NEXT_RE = /^(下一页|下一步|下一题|继续|next|continue)$/i;
  const PREV_RE = /^(上一步|上一页|上一题|previous|back)$/i;
  const SUBMIT_WORD_RE = /提交|交卷|发送|submit|send/i;

  function clickableButtons() {
    return qa(document, 'button, input[type=button], input[type=submit], a[role=button], div[role=button], span[role=button]')
      .filter(STQ.isVisible);
  }
  function btnText(b) { return STQ.normText(b.textContent || b.value || ''); }
  function findButton(re, excludeRe) {
    return clickableButtons().find((b) => {
      const t = btnText(b);
      if (excludeRe && excludeRe.test(t)) return false;
      return re.test(t);
    });
  }

  function collectErrors() {
    const errs = qa(document, '[role=alert], .error, .error-message, .field-error, .invalid-feedback')
      .filter(STQ.isVisible)
      .map((e) => STQ.normText(e.textContent))
      .filter(Boolean);
    return errs.length ? errs.join('；') : '';
  }

  function snapshot(questions) {
    return questions.length + '|' + questions.map((question) => question.title).join('#');
  }
  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  STQ.Registry.register({
    name: 'generic',
    probe() {
      if (location.hostname.endsWith('wjx.cn') || location.hostname.endsWith('sojump.com')) return null;
      const questions = collectQuestions();
      const meaningful = questions.filter(
        (question) =>
          question.type !== STQ.QTypes.UNSUPPORTED &&
          (question.options.length || question.type === STQ.QTypes.TEXT)
      );
      if (!meaningful.length) return null;

      // 向导式多步表单：存在"下一步/继续"类按钮（排除提交词）即按分步处理
      const isWizard = !!findButton(NEXT_RE, SUBMIT_WORD_RE);

      return {
        platform: 'generic',
        mode: isWizard ? 'wizard' : 'all-in-one',
        list() { return collectQuestions(); },

        isSubmitNext() { return !!findButton(SUBMIT_WORD_RE); },

        hasNextPage() { return isWizard && !!findButton(NEXT_RE, SUBMIT_WORD_RE); },

        hasPrevPage() { return isWizard && !!findButton(PREV_RE); },

        async gotoNextPage() {
          const btn = findButton(NEXT_RE, SUBMIT_WORD_RE);
          if (!btn) return { ok: false, error: '未找到"下一步"按钮' };
          const before = snapshot(this.list());
          btn.click();
          for (let i = 0; i < 20; i++) {
            await sleep(200);
            const err = collectErrors();
            if (err) return { ok: false, error: err };
            if (snapshot(this.list()) !== before) return { ok: true };
          }
          const err = collectErrors();
          return err ? { ok: false, error: err } : { ok: false, error: '页面未响应下一步' };
        },

        async gotoPrevPage() {
          const btn = findButton(PREV_RE);
          if (!btn) return { ok: false, error: '未找到"上一步"按钮' };
          const before = snapshot(this.list());
          btn.click();
          for (let i = 0; i < 20; i++) {
            await sleep(200);
            if (snapshot(this.list()) !== before) return { ok: true };
          }
          return { ok: false, error: '页面未响应上一步' };
        },

        collectErrors,

        submit() {
          const btn =
            findButton(SUBMIT_WORD_RE) ||
            q(document, 'form input[type=submit], form button[type=submit]');
          if (btn) btn.click();
        },
      };
    },
  });
})();

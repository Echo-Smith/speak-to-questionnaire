/**
 * 通用适配器（experimental）：面向"框架自绘 + 标准语义"的问卷页面
 * （美团问卷、金数据、腾讯问卷等 React/Vue 应用）。
 *
 * 识别层级（从强到弱）：
 *   A. 标准 input[type=radio/checkbox] 按 name 分组
 *   B. ARIA 自绘选项：[role=radio] / [role=checkbox] / [role=option]（React 组件库常用）
 *   C. select 下拉、textarea/text 输入
 * 写入策略：input 用原生 setter（React value tracker 兼容），自绘节点派发真实 click。
 * 题干提取：label[for] > fieldset legend > aria-label > 临近标题 > name。
 */
(function () {
  'use strict';
  const STQ = globalThis.STQ;

  const NEXT_RE = /^(下一页|下一步|下一题|继续|next|continue)$/i;
  const PREV_RE = /^(上一步|上一页|上一题|previous|back)$/i;
  const SUBMIT_WORD_RE = /提交|交卷|发送|submit|send/i;
  const RENDER_RETRIES = 12; // SPA 动态渲染等待（12 × 250ms = 3s）
  const RENDER_QUIET_ROUNDS = 3;

  function q(root, sel) { return root.querySelector(sel); }
  function qa(root, sel) { return Array.from(root.querySelectorAll(sel)); }

  /* ---------------- 题干提取 ---------------- */

  function headingNear(el) {
    let node = el;
    for (let i = 0; i < 4 && node; i++) {
      let sib = node.previousElementSibling;
      for (let j = 0; sib && j < 6; j++) {
        const cls = String(sib.className && sib.className.baseVal !== undefined ? sib.className.baseVal : sib.className || '');
        if (/^H[1-6]$/.test(sib.tagName) || /question|title|label|legend|prompt|stem/i.test(cls)) {
          const t = STQ.normText(sib.textContent);
          if (t) return t;
        }
        sib = sib.previousElementSibling;
      }
      // 自绘组件题干常是父容器里 role=heading / .title 类的子节点
      const p = node.parentElement;
      if (p) {
        const h = q(p, '[role=heading], .question-title, .title-text, .stem');
        if (h && h.contains(node) === false && STQ.normText(h.textContent)) {
          return STQ.normText(h.textContent);
        }
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
    const aria = input.getAttribute('aria-label');
    if (aria && STQ.normText(aria)) return STQ.normText(aria);
    const fieldset = input.closest('fieldset');
    if (fieldset) {
      const legend = q(fieldset, 'legend');
      if (legend && STQ.normText(legend.textContent)) return STQ.normText(legend.textContent);
    }
    return headingNear(input) || STQ.normText(input.name) || '未命名题目';
  }

  function containerOf(inputs) {
    const fieldset = inputs[0].closest('fieldset');
    if (fieldset) return fieldset;
    let c = inputs[0].parentElement;
    for (let i = 0; i < 8 && c; i++) {
      if (inputs.every((inp) => c.contains(inp))) return c;
      c = c.parentElement;
    }
    return inputs[0].parentElement;
  }

  /* ---------------- A. 标准 input 分组 ---------------- */

  function makeChoiceQuestion(inputs, type) {
    const options = inputs.map((input, i) => {
      const labelEl = input.closest('label');
      const label = STQ.normText(
        (labelEl ? labelEl.textContent : '') || input.getAttribute('aria-label') || input.value
      ).replace(/^[A-Ja-j]\s*[、\.．]\s*/, '');
      return {
        value: input.value || String(i + 1),
        label: label || '选项' + (i + 1),
        el: labelEl || input.parentElement,
        input,
      };
    });
    return STQ.createQuestion({
      type,
      title: titleFor(inputs[0]),
      required: inputs[0].required || inputs[0].getAttribute('aria-required') === 'true',
      options,
      el: containerOf(inputs),
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

  /* ---------------- B. ARIA 自绘选项 ---------------- */

  function ariaChecked(el) {
    return el.getAttribute('aria-checked') === 'true' || el.getAttribute('aria-selected') === 'true';
  }

  function makeAriaQuestion(items, type) {
    const options = items.map((el, i) => ({
      value: el.getAttribute('data-value') || el.getAttribute('value') || String(i + 1),
      label: STQ.normText(el.getAttribute('aria-label') || el.textContent).replace(/^[A-Ja-j]\s*[、\.．]\s*/, '') || '选项' + (i + 1),
      el,
      input: q(el, 'input'),
    }));
    return STQ.createQuestion({
      type,
      title: titleFor(items[0]),
      required: items[0].getAttribute('aria-required') === 'true',
      options,
      el: containerOf(items),
      answerText() {
        return options.filter((o) => ariaChecked(o.el)).map((o) => o.label).join('；');
      },
      async write(labels) {
        for (const o of options) {
          const want = labels.includes(o.label) || labels.includes(o.value);
          if (want !== ariaChecked(o.el)) {
            await STQ.humanClick(o.el);
          }
        }
      },
      async clear() {
        for (const o of options) {
          if (ariaChecked(o.el)) await STQ.humanClick(o.el);
        }
      },
    });
  }

  /* ---------------- C. 文本 / 下拉 ---------------- */

  function makeTextQuestion(input) {
    return STQ.createQuestion({
      type: STQ.QTypes.TEXT,
      title: titleFor(input),
      required: input.required || input.getAttribute('aria-required') === 'true',
      el: input.closest('fieldset') || input.parentElement,
      answerText() { return STQ.normText(input.value); },
      write(text) {
        input.focus();
        STQ.setNativeValue(input, text);
        input.blur();
      },
      clear() { STQ.setNativeValue(input, ''); },
    });
  }

  function makeDropdownQuestion(select) {
    const options = qa(select, 'option')
      .filter((o) => o.value !== '')
      .map((o) => ({ value: o.value, label: STQ.normText(o.textContent), el: o, input: o }));
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
        if (hit) STQ.setNativeValue(select, hit.value);
      },
      clear() { STQ.setNativeValue(select, ''); },
    });
  }

  /* ---------------- 收集 ---------------- */

  function collectQuestions() {
    const result = [];
    const claimed = new Set();

    // A. radio / checkbox 分组
    for (const [sel, type] of [['input[type=radio]', STQ.QTypes.SINGLE], ['input[type=checkbox]', STQ.QTypes.MULTIPLE]]) {
      const groups = new Map();
      for (const input of STQ.deepQueryAll(sel, document).filter(STQ.isVisible)) {
        const key = input.name || input.id || sel + '#' + result.length;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(input);
        claimed.add(input);
      }
      for (const inputs of groups.values()) {
        if (inputs.length >= 2) result.push(makeChoiceQuestion(inputs, type));
      }
    }

    // B. ARIA 自绘（未包含真实 input 的）
    for (const [sel, type] of [['[role=radio]', STQ.QTypes.SINGLE], ['[role=checkbox]', STQ.QTypes.MULTIPLE]]) {
      const items = STQ.deepQueryAll(sel, document).filter(
        (el) => STQ.isVisible(el) && !claimed.has(el) && !q(el, 'input[type=radio],input[type=checkbox]')
      );
      if (items.length >= 2) {
        items.forEach((el) => claimed.add(el));
        result.push(makeAriaQuestion(items, type));
      }
    }

    // C. 下拉与文本
    for (const select of STQ.deepQueryAll('select', document).filter(STQ.isVisible)) {
      claimed.add(select);
      result.push(makeDropdownQuestion(select));
    }
    for (const input of STQ.deepQueryAll(
      'textarea, input[type=text], input[type=number], input[type=email], input[type=tel]',
      document
    ).filter((i) => STQ.isVisible(i) && !claimed.has(i))) {
      if (input.closest('label') && q(input.closest('label'), 'input[type=radio],input[type=checkbox]')) continue;
      if (/OtherRadioText|other/i.test(input.name || '')) continue;
      claimed.add(input);
      result.push(makeTextQuestion(input));
    }

    return result
      .filter(Boolean)
      .sort((a, b) => (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
      .map((question, i) => Object.assign(question, { index: i, topic: question.topic || i + 1 }));
  }

  /** 等待 SPA 渲染稳定（连续数轮题目集合不变） */
  async function stableQuestions() {
    let prev = '';
    let quiet = 0;
    for (let i = 0; i < RENDER_RETRIES; i++) {
      const snap = collectQuestions().map((x) => x.title).join('#');
      if (snap && snap === prev) {
        quiet += 1;
        if (quiet >= RENDER_QUIET_ROUNDS) break;
      } else {
        quiet = 0;
        prev = snap;
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    return collectQuestions();
  }

  /* ---------------- 按钮 / 错误 ---------------- */

  function clickableButtons() {
    return STQ.deepQueryAll(
      'button, input[type=button], input[type=submit], a[role=button], div[role=button], span[role=button]',
      document
    ).filter(STQ.isVisible);
  }
  function btnText(b) { return STQ.normText(b.textContent || b.value || ''); }
  function findButton(re, excludeRe) {
    return clickableButtons().find((b) => {
      const t = btnText(b) + ' ' + (b.getAttribute('aria-label') || '');
      if (excludeRe && excludeRe.test(t)) return false;
      return re.test(t);
    });
  }
  function collectErrors() {
    const errs = STQ.deepQueryAll('[role=alert], .error, .error-message, .field-error, .invalid-feedback', document)
      .filter(STQ.isVisible)
      .map((e) => STQ.normText(e.textContent))
      .filter(Boolean);
    return errs.length ? errs.join('；') : '';
  }
  function snapshot(questions) {
    return questions.length + '|' + questions.map((x) => x.title).join('#');
  }

  STQ.Registry.register({
    name: 'generic',
    probe() {
      if (location.hostname.endsWith('wjx.cn') || location.hostname.endsWith('sojump.com')) return null;
      // 同步探测：首屏无标准表单时不再一票否决，交给 list() 的渲染等待
      const first = collectQuestions();
      const meaningful = first.filter(
        (x) => x.type !== STQ.QTypes.UNSUPPORTED && (x.options.length || x.type === STQ.QTypes.TEXT)
      );

      const isWizard = !!findButton(NEXT_RE, SUBMIT_WORD_RE);

      return {
        platform: 'generic',
        mode: isWizard ? 'wizard' : 'all-in-one',

        async list() {
          if (meaningful.length) return collectQuestions();
          return stableQuestions();
        },

        isSubmitNext() { return !!findButton(SUBMIT_WORD_RE); },
        hasNextPage() { return isWizard && !!findButton(NEXT_RE, SUBMIT_WORD_RE); },
        hasPrevPage() { return isWizard && !!findButton(PREV_RE); },

        async gotoNextPage() {
          const btn = findButton(NEXT_RE, SUBMIT_WORD_RE);
          if (!btn) return { ok: false, error: '未找到"下一步"按钮' };
          const before = snapshot(await this.list());
          await STQ.humanClick(btn);
          for (let i = 0; i < 20; i++) {
            await new Promise((r) => setTimeout(r, 200));
            const err = collectErrors();
            if (err) return { ok: false, error: err };
            if (snapshot(await this.list()) !== before) return { ok: true };
          }
          const err = collectErrors();
          return err ? { ok: false, error: err } : { ok: false, error: '页面未响应下一步' };
        },

        async gotoPrevPage() {
          const btn = findButton(PREV_RE);
          if (!btn) return { ok: false, error: '未找到"上一步"按钮' };
          const before = snapshot(await this.list());
          await STQ.humanClick(btn);
          for (let i = 0; i < 20; i++) {
            await new Promise((r) => setTimeout(r, 200));
            if (snapshot(await this.list()) !== before) return { ok: true };
          }
          return { ok: false, error: '页面未响应上一步' };
        },

        collectErrors,

        submit() {
          const btn = findButton(SUBMIT_WORD_RE) ||
            q(document, 'form input[type=submit], form button[type=submit]');
          if (btn) STQ.humanClick(btn);
        },
      };
    },
  });
})();

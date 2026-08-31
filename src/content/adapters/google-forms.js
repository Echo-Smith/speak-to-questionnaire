/**
 * Google Forms 适配器（docs.google.com/forms/*）
 * 基于 GF 稳定的 role 语义 DOM：题目=div[role=listitem]，选项=div[role=radio]/[role=checkbox]。
 */
(function () {
  'use strict';
  const STQ = globalThis.STQ;

  const SUBMIT_RE = /提交|Submit/i;
  const NEXT_RE = /下一页|下一部分|Next page|Next/i;
  const PREV_RE = /上一页|Previous|Back/i;

  function q(root, sel) { return root.querySelector(sel); }
  function qa(root, sel) { return Array.from(root.querySelectorAll(sel)); }
  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  function buttons(re) {
    return qa(document, 'div[role="button"], span[role="button"]')
      .filter((b) => STQ.isVisible(b) && re.test(STQ.normText(b.textContent) + ' ' + (b.getAttribute('aria-label') || '')));
  }

  function hasRealInput(item) {
    return (
      qa(item, 'div[role="radio"],div[role="checkbox"]').length > 0 ||
      !!q(item, 'input[type=text],input[type=email],input[type=url],input[type=tel],textarea')
    );
  }

  function parseTitle(item) {
    const h = q(item, 'div[role="heading"]');
    if (h) return STQ.stripTopicNo(h.textContent);
    const input = q(item, 'input,textarea');
    return STQ.normText(input && (input.getAttribute('aria-label') || input.placeholder || ''));
  }

  function isRequired(item) {
    const h = q(item, 'div[role="heading"]');
    const label = h ? (h.getAttribute('aria-label') || h.textContent) : '';
    return /必填|\*\s*$/.test(STQ.normText(label));
  }

  function makeRadioQuestion(item, index) {
    const options = qa(item, 'div[role="radio"]').filter(STQ.isVisible).map((el, i) => ({
      value: el.getAttribute('data-value') || String(i + 1),
      label: STQ.normText(el.getAttribute('aria-label') || el.textContent),
      el,
      input: q(el, 'input'),
    }));
    if (!options.length) return null;
    return STQ.createQuestion({
      type: STQ.QTypes.SINGLE,
      title: parseTitle(item),
      required: isRequired(item),
      options,
      el: item,
      answerText() {
        const cur = options.find((o) => o.el.getAttribute('aria-checked') === 'true');
        return cur ? cur.label : '';
      },
      write(labels) {
        for (const o of options) {
          if (labels.includes(o.label) || labels.includes(o.value)) {
            try { o.el.click(); } catch (_) { /* ignore */ }
            STQ.dispatchEvent(o.el, ['click']);
          }
        }
      },
      clear() {
        for (const o of options) {
          if (o.el.getAttribute('aria-checked') === 'true') {
            try { o.el.click(); } catch (_) { /* ignore */ }
          }
        }
      },
    });
  }

  function makeCheckboxQuestion(item, index) {
    const options = qa(item, 'div[role="checkbox"]').filter(STQ.isVisible).map((el, i) => ({
      value: el.getAttribute('data-value') || String(i + 1),
      label: STQ.normText(el.getAttribute('aria-label') || el.textContent),
      el,
      input: q(el, 'input'),
    }));
    if (!options.length) return null;
    return STQ.createQuestion({
      type: STQ.QTypes.MULTIPLE,
      title: parseTitle(item),
      required: isRequired(item),
      options,
      el: item,
      answerText() {
        return options
          .filter((o) => o.el.getAttribute('aria-checked') === 'true')
          .map((o) => o.label)
          .join('；');
      },
      write(labels) {
        for (const o of options) {
          const want = labels.includes(o.label) || labels.includes(o.value);
          if (want !== (o.el.getAttribute('aria-checked') === 'true')) {
            try { o.el.click(); } catch (_) { /* ignore */ }
          }
        }
      },
      clear() { this.write([]); },
    });
  }

  function makeTextQuestion(item, index) {
    const input = qa(item, 'input[type=text],input[type=email],input[type=url],input[type=tel],textarea')
      .filter((i) => !i.closest('div[role="radio"],div[role="checkbox"]'))
      .find(STQ.isVisible);
    if (!input) return null;
    return STQ.createQuestion({
      type: STQ.QTypes.TEXT,
      title: parseTitle(item),
      required: isRequired(item),
      el: item,
      answerText() { return STQ.normText(input.value); },
      write(text) {
        input.focus();
        STQ.setNativeValue(input, text);
        input.blur();
      },
      clear() { STQ.setNativeValue(input, ''); },
    });
  }

  function makeSurvey() {
    return {
      platform: 'google-forms',
      mode: 'per-page',

      list() {
        const items = qa(document, 'div[role="listitem"]').filter(hasRealInput).filter(STQ.isVisible);
        return items
          .map((item, i) =>
            makeRadioQuestion(item, i) || makeCheckboxQuestion(item, i) || makeTextQuestion(item, i)
          )
          .filter(Boolean)
          .map((question, i) => {
            question.index = i;
            if (!question.topic) question.topic = i + 1;
            return question;
          });
      },

      isSubmitNext() { return buttons(SUBMIT_RE).length > 0; },
      hasNextPage() { return !this.isSubmitNext() && buttons(NEXT_RE).length > 0; },
      hasPrevPage() { return buttons(PREV_RE).length > 0; },

      async gotoNextPage() {
        const btn = buttons(NEXT_RE)[0];
        if (!btn) return { ok: false, error: '未找到"下一页"按钮' };
        const before = this.list().length + '|' + STQ.normText((this.list()[0] || {}).title || '');
        btn.click();
        await sleep(800);
        for (let i = 0; i < 15; i++) {
          await sleep(200);
          const after = this.list().length + '|' + STQ.normText((this.list()[0] || {}).title || '');
          if (after !== before) {
            const err = this.collectErrors();
            return err ? { ok: false, error: err } : { ok: true };
          }
        }
        const err = this.collectErrors();
        return err ? { ok: false, error: err } : { ok: false, error: '页面未翻动' };
      },

      async gotoPrevPage() {
        const btn = buttons(PREV_RE)[0];
        if (!btn) return { ok: false, error: '未找到"上一页"按钮' };
        btn.click();
        await sleep(800);
        return { ok: true };
      },

      collectErrors() {
        const errs = qa(document, '[role="alert"]')
          .filter(STQ.isVisible)
          .map((e) => STQ.normText(e.textContent))
          .filter(Boolean);
        return errs.length ? errs.join('；') : '';
      },

      submit() {
        const btn = buttons(SUBMIT_RE)[0];
        if (btn) btn.click();
      },
    };
  }

  STQ.Registry.register({
    name: 'google-forms',
    probe() {
      if (!location.hostname.endsWith('docs.google.com')) return null;
      if (!location.pathname.includes('/forms/')) return null;
      const items = qa(document, 'div[role="listitem"]').filter(hasRealInput).filter(STQ.isVisible);
      if (!items.length) return null;
      return makeSurvey();
    },
  });
})();

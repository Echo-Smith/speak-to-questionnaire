/**
 * 问卷星（wjx.cn / wjx.top / sojump.com）适配器
 *
 * 页面结构（基于 2026-08 实测 https://www.wjx.cn/jq/2330896.aspx 归纳）：
 *   题目容器: div.field.ui-field-contain  属性 topic(题号) req(必填) type(题型码)
 *   题干:     .field-label .topichtml
 *   单选:     .ui-radio，内含隐藏 input[type=radio]（value=序号）与 .label（for= input id）
 *   多选:     .ui-checkbox（同构）
 *   填空:     textarea（id q{n}）或 input[type=text]；.OtherRadioText 是"其他"选项的补充输入，忽略
 *   翻页:     #ctlNext（文本"下一页/提交"），#ctlPrev（上一页）
 *   校验错误: 题目容器内 .errorMessage
 */
(function () {
  'use strict';
  const STQ = globalThis.STQ;

  const FIELD_SEL = 'div.field.ui-field-contain';
  const SUBMIT_RE = /提交|交卷/;

  function q(root, sel) { return root.querySelector(sel); }
  function qa(root, sel) { return Array.from(root.querySelectorAll(sel)); }

  function fieldVisible(f) { return STQ.isVisible(f); }

  function parseTitle(field) {
    const el = q(field, '.topichtml') || q(field, '.field-label');
    return STQ.stripTopicNo(el ? el.textContent : '');
  }

  function optionLabel(radioLike) {
    const label = q(radioLike, '.label') || radioLike;
    return STQ.normText(label.textContent);
  }

  function parseSingleOrMultiple(field, type) {
    const sel = type === STQ.QTypes.SINGLE ? '.ui-radio' : '.ui-checkbox';
    const items = qa(field, sel);
    if (!items.length) return null;
    const options = items.map((el, i) => {
      const input = q(el, 'input[type=radio],input[type=checkbox]');
      return { value: input ? input.value : String(i + 1), label: optionLabel(el), el, input };
    });
    return STQ.createQuestion({
      type,
      title: parseTitle(field),
      required: field.getAttribute('req') === '1',
      options,
      el: field,
      answerText() {
        const picked = options.filter((o) => o.input && o.input.checked);
        return picked.map((o) => o.label).join('；');
      },
      write(labels) {
        for (const o of options) {
          const want = labels.includes(o.label) || labels.includes(o.value);
          if (!o.input) continue;
          if (want !== o.input.checked) {
            const labelEl = q(o.el, '.label') || o.el;
            try { labelEl.click(); } catch (_) { /* ignore */ }
            o.input.checked = want;
          }
          if (want) STQ.dispatchEvent(o.input, ['input', 'change']);
        }
      },
      clear() {
        for (const o of options) {
          if (o.input && o.input.checked) {
            o.input.checked = false;
            STQ.dispatchEvent(o.input, ['input', 'change']);
          }
        }
      },
    });
  }

  function parseText(field) {
    const input =
      q(field, 'textarea') ||
      qa(field, 'input[type=text],input[type=number]').find(
        (i) => !/OtherRadioText/.test(i.className || '')
      );
    if (!input) return null;
    return STQ.createQuestion({
      type: STQ.QTypes.TEXT,
      title: parseTitle(field),
      required: field.getAttribute('req') === '1',
      el: field,
      answerText() { return STQ.normText(input.value); },
      write(text) {
        input.value = text;
        STQ.dispatchEvent(input, ['input', 'change']);
      },
      clear() {
        input.value = '';
        STQ.dispatchEvent(input, ['input', 'change']);
      },
      textInput: input,
    });
  }

  function parseDropdown(field) {
    const select = q(field, 'select');
    if (!select) return null;
    const options = qa(select, 'option')
      .filter((o) => o.value !== '')
      .map((o, i) => ({ value: o.value, label: STQ.normText(o.textContent), el: o, input: o }));
    return STQ.createQuestion({
      type: STQ.QTypes.DROPDOWN,
      title: parseTitle(field),
      required: field.getAttribute('req') === '1',
      options,
      el: field,
      answerText() {
        const cur = select.options[select.selectedIndex];
        return cur ? STQ.normText(cur.textContent) : '';
      },
      write(labels) {
        const hit = options.find((o) => labels.includes(o.label) || labels.includes(o.value));
        if (hit) {
          select.value = hit.value;
          STQ.dispatchEvent(select, ['input', 'change']);
        }
      },
      clear() { select.value = ''; STQ.dispatchEvent(select, ['change']); },
    });
  }

  function parseScale(field) {
    // 实验性支持：.rate-table 每行一个分值
    const rows = qa(field, '.rate-table .rate-tr, .rate-table tr').filter((r) => STQ.normText(r.textContent));
    if (!rows.length) return null;
    const options = rows.map((el, i) => ({
      value: el.getAttribute('data-score') || String(i + 1),
      label: STQ.normText(el.textContent),
      el,
    }));
    return STQ.createQuestion({
      type: STQ.QTypes.SCALE,
      title: parseTitle(field),
      required: field.getAttribute('req') === '1',
      options,
      el: field,
      answerText() { return ''; },
      write(labels) {
        const hit = options.find((o) => labels.includes(o.label) || labels.includes(o.value));
        if (hit) {
          try { hit.el.click(); } catch (_) { /* ignore */ }
          STQ.dispatchEvent(hit.el, ['click']);
        }
      },
      clear() {},
    });
  }

  function parseField(field, index) {
    let question =
      parseSingleOrMultiple(field, STQ.QTypes.SINGLE) ||
      parseSingleOrMultiple(field, STQ.QTypes.MULTIPLE) ||
      parseText(field) ||
      parseDropdown(field) ||
      parseScale(field);
    if (!question) {
      question = STQ.createQuestion({
        type: STQ.QTypes.UNSUPPORTED,
        title: parseTitle(field),
        required: field.getAttribute('req') === '1',
        el: field,
      });
    }
    question.id = field.id || 'q-' + index;
    question.topic = parseInt(field.getAttribute('topic') || String(index + 1), 10) || index + 1;
    question.index = index;
    return question;
  }

  function nextButton() { return q(document, '#ctlNext'); }
  function prevButton() { return q(document, '#ctlPrev'); }

  function makeSurvey() {
    const survey = {
      platform: 'wjx',
      mode: 'all-in-one',

      list() {
        const fields = qa(document, FIELD_SEL).filter(fieldVisible);
        return fields.map(parseField);
      },

      isSubmitNext() {
        const btn = nextButton();
        return !!btn && SUBMIT_RE.test(STQ.normText(btn.textContent || btn.value || ''));
      },

      hasNextPage() {
        const btn = nextButton();
        return !!btn && !btn.disabled && !this.isSubmitNext();
      },

      hasPrevPage() {
        const btn = prevButton();
        return !!btn && !btn.disabled;
      },

      async gotoNextPage() {
        const btn = nextButton();
        if (!btn) return { ok: false };
        const before = STQ.normText((this.list()[0] || {}).title || '') + '|' + qa(document, FIELD_SEL).length;
        btn.click();
        // 等待页面题目变化或出现校验错误
        for (let i = 0; i < 20; i++) {
          await sleep(200);
          const err = this.collectErrors();
          if (err) return { ok: false, error: err };
          const after = STQ.normText((this.list()[0] || {}).title || '') + '|' + qa(document, FIELD_SEL).length;
          if (after !== before) return { ok: true };
        }
        return { ok: false, error: '页面未响应，可能被浏览器拦截或网络较慢' };
      },

      async gotoPrevPage() {
        const btn = prevButton();
        if (!btn) return { ok: false };
        const before = STQ.normText((this.list()[0] || {}).title || '') + '|' + qa(document, FIELD_SEL).length;
        btn.click();
        for (let i = 0; i < 20; i++) {
          await sleep(200);
          const after = STQ.normText((this.list()[0] || {}).title || '') + '|' + qa(document, FIELD_SEL).length;
          if (after !== before) return { ok: true };
        }
        return { ok: false, error: '返回上一页未成功' };
      },

      collectErrors() {
        const errs = qa(document, FIELD_SEL)
          .filter(fieldVisible)
          .map((f) => (q(f, '.errorMessage') || {}).textContent)
          .map(STQ.normText)
          .filter(Boolean);
        return errs.length ? errs.join('；') : '';
      },

      submit() {
        const btn = nextButton();
        if (btn) btn.click();
      },
    };

    const fields = qa(document, FIELD_SEL).filter(fieldVisible);
    survey.mode = fields.length > 1 ? 'all-in-one' : 'per-page';
    return survey;
  }

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  STQ.Registry.register({
    name: 'wjx',
    probe() {
      if (!/^(www\.)?([a-z0-9-]+\.)?(wjx\.cn|wjx\.top|sojump\.com)$/.test(location.hostname)) return null;
      const fields = qa(document, FIELD_SEL).filter(fieldVisible);
      if (!fields.length || !nextButton()) return null;
      return makeSurvey();
    },
  });
})();

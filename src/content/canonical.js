/**
 * 统一题目模型（Canonical Question Model）
 * 各平台适配器把页面 DOM 归一化成这里的结构，语音引擎只面向该模型工作。
 */
(function () {
  'use strict';
  const STQ = (globalThis.STQ = globalThis.STQ || {});

  STQ.QTypes = {
    SINGLE: 'single',     // 单选
    MULTIPLE: 'multiple', // 多选
    TEXT: 'text',         // 填空/论述
    SCALE: 'scale',       // 量表/打分
    DROPDOWN: 'dropdown', // 下拉
    UNSUPPORTED: 'unsupported',
  };

  STQ.normText = function normText(s) {
    return String(s || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  /** 去掉题干里 "1." / "12、" 这类序号前缀 */
  STQ.stripTopicNo = function stripTopicNo(s) {
    return STQ.normText(s).replace(/^\d+\s*[\.、．:：]?\s*/, '').replace(/[：:]\s*$/, '');
  };

  STQ.isVisible = function isVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  STQ.scrollIntoViewCenter = function scrollIntoViewCenter(el) {
    if (el && el.scrollIntoView) {
      try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) { /* ignore */ }
    }
  };

  STQ.dispatchEvent = function dispatchEvent(el, types) {
    for (const t of types) {
      el.dispatchEvent(new Event(t, { bubbles: true, cancelable: true }));
    }
  };

  /**
   * 构造一个题目对象
   * write/read/clear 由适配器按平台 DOM 实现，这里只提供公共骨架与默认滚动定位。
   */
  STQ.createQuestion = function createQuestion(spec) {
    return Object.assign(
      {
        id: '',
        topic: 0,
        index: 0,
        type: STQ.QTypes.UNSUPPORTED,
        title: '',
        required: false,
        options: [], // [{ value, label, el, input? }]
        el: null,
        answerText() { return ''; },
        write() {},
        clear() {},
      },
      spec
    );
  };
})();

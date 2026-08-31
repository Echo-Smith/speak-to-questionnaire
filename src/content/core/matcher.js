/**
 * 规则匹配器：指令识别与选项匹配的本地兜底（LLM 可用时做增强，不可用时也能工作）。
 */
(function () {
  'use strict';
  const STQ = (globalThis.STQ = globalThis.STQ || {});

  const COMMANDS = [
    ['next', ['下一题', '下一个', '下一条', '继续']],
    ['prev', ['上一题', '上一个', '返回', '回上一题']],
    ['repeat', ['重复', '再说一遍', '重复题目', '再读一遍']],
    ['skip', ['跳过', '不答', '略过']],
    ['done', ['完成', '好了', '可以了', '答完了', '选完了']],
    ['submit', ['提交', '提交问卷', '交卷']],
    ['confirm', ['确认', '确定', '是的', '对']],
    ['cancel', ['取消', '不对', '错了', '重说']],
    ['stopread', ['停止朗读', '别读了', '停', '安静']],
  ];

  // 论述题听写模式下，只有这些短语会结束听写（避免正文里出现"下一题"误触发）
  const DICTATE_END = ['结束作答', '完成作答', '说完了', '写完了', '回答完毕'];

  const CN_NUM = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
  const LETTERS = 'abcdefghij';

  function norm(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/[\s,，。.、;；!！?？'"'""·:：]/g, '')
      .trim();
  }

  function stripOptionPrefix(label) {
    // "A、男" / "B." / "3、" -> "男"
    return norm(label).replace(/^[a-j]\s*[、\.．]/, '').replace(/^\d+\s*[、\.．]/, '');
  }

  function cnToDigit(word) {
    if (/^[0-9]+$/.test(word)) return parseInt(word, 10);
    if (word.length === 1 && word in CN_NUM) return CN_NUM[word];
    if (/^十[一二三四五六七八九]?$/.test(word)) {
      return word === '十' ? 10 : 10 + CN_NUM[word[1]];
    }
    if (/^[一二三四五六七八九]十$/.test(word)) return CN_NUM[word[0]] * 10;
    return NaN;
  }

  STQ.Matcher = {
    /** 是否为听写结束短语 */
    isDictateEnd(text) {
      const t = norm(text);
      return DICTATE_END.find((p) => t === p || t.endsWith(p)) || null;
    },

    /** 指令识别（非听写模式）；返回 {cmd} 或 null */
    detectCommand(text) {
      const t = norm(text);
      if (!t) return null;
      for (const [cmd, words] of COMMANDS) {
        for (const w of words) {
          if (t === w) return { cmd };
        }
      }
      // 带修饰的说法：给我上一题 / 请重复一遍
      for (const [cmd, words] of COMMANDS) {
        for (const w of words) {
          if (t.length <= 6 && t.includes(w)) return { cmd };
        }
      }
      return null;
    },

    /** 单选/量表/下拉：口述 -> 选项下标（0 基）。失败返回 -1 */
    matchOption(text, options) {
      const t = norm(text);
      if (!t || !options.length) return -1;

      // 1) 字母：a / 选项b / 选c / b选项
      const letter = t.match(/(?:选项|选|第)?([a-j])(?:个)?(?:选项)?$/);
      if (letter) {
        const i = LETTERS.indexOf(letter[1]);
        if (i >= 0 && i < options.length) return i;
      }

      // 2) 序数：第2个 / 第二个 / 2 / 二
      const ord = t.match(/第?\s*([0-9一二两三四五六七八九十]+)\s*个?(?:选项)?$/);
      if (ord) {
        const n = cnToDigit(ord[1]);
        if (n >= 1 && n <= options.length) return n - 1;
      }

      // 3) 选项文本包含
      for (let i = 0; i < options.length; i++) {
        const bare = stripOptionPrefix(options[i].label);
        if (bare.length >= 2 && (t.includes(bare) || bare.includes(t))) return i;
      }
      return -1;
    },

    /** 多选：口述 -> {select:[i], deselect:[i]} */
    matchMulti(text, options) {
      const t = norm(text);
      const res = { select: [], deselect: [] };
      if (!t) return res;
      const negate = /不选|取消|排除|去掉|不要/.test(t);
      const clean = t.replace(/不选|取消|排除|去掉|不要|选项|选|第|个|和|跟|还有|以及/g, '');

      const targets = new Set();
      for (const ch of clean) {
        const li = LETTERS.indexOf(ch);
        if (li >= 0 && li < options.length) targets.add(li);
      }
      const numMatch = clean.match(/[0-9]+/g);
      if (numMatch) {
        for (const m of numMatch) {
          const n = parseInt(m, 10);
          if (n >= 1 && n <= options.length) targets.add(n - 1);
        }
      }
      for (const cn of Object.keys(CN_NUM)) {
        if (clean.includes(cn)) {
          const n = CN_NUM[cn];
          if (n >= 1 && n <= options.length) targets.add(n - 1);
        }
      }
      for (let i = 0; i < options.length; i++) {
        const bare = stripOptionPrefix(options[i].label);
        if (bare.length >= 2 && t.includes(bare)) targets.add(i);
      }

      (negate ? res.deselect : res.select).push(...targets);
      return res;
    },
  };
})();

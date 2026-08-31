/**
 * 共享设置模块：内容脚本、popup、options、service worker 通用。
 * 设置存储于 chrome.storage.local（API Key 不走 sync，避免同步到账号）。
 */
(function (global) {
  'use strict';

  global.STQ_DEFAULTS = {
    enabled: true,
    llm: {
      baseUrl: '',        // 例如 https://api.openai.com/v1
      apiKey: '',
      model: '',
      temperature: 0.2,
    },
    voice: {
      lang: 'zh-CN',
      rate: 1.0,
      readOptions: true,          // 朗读题目时是否朗读选项
      autoAdvanceSingle: true,    // 单选/量表说完自动下一题
      autoAdvanceMultiple: false, // 多选说完自动下一题（默认停留，需说"完成"）
    },
    essay: {
      autoClean: false, // 论述题说完后是否请求 LLM 整理（始终先展示预览，可改回原文）
    },
  };

  global.stqDeepMerge = function stqDeepMerge(base, patch) {
    if (!patch || typeof patch !== 'object') return base;
    for (const k of Object.keys(patch)) {
      const v = patch[k];
      if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object') {
        stqDeepMerge(base[k], v);
      } else if (v !== undefined) {
        base[k] = v;
      }
    }
    return base;
  };

  global.stqLoadSettings = function stqLoadSettings() {
    return chrome.storage.local
      .get({ settings: {} })
      .then((r) => global.stqDeepMerge(structuredClone(global.STQ_DEFAULTS), r.settings));
  };

  global.stqSaveSettings = function stqSaveSettings(settings) {
    return chrome.storage.local.set({ settings });
  };

  /** 校验 BYOK Base URL：仅允许 http/https 协议 */
  global.stqValidateBaseUrl = function stqValidateBaseUrl(raw) {
    const url = String(raw || '').trim();
    if (!url) return { ok: false, error: 'Base URL 为空' };
    let u;
    try {
      u = new URL(url);
    } catch {
      return { ok: false, error: 'Base URL 格式无效' };
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return { ok: false, error: '仅允许 http/https 协议' };
    }
    return { ok: true, url: url.replace(/\/+$/, '') };
  };
})(typeof window !== 'undefined' ? window : globalThis);

/**
 * 共享设置模块：内容脚本、popup、options、service worker、offscreen 通用。
 * 设置存储于 chrome.storage.local（API Key 不走 sync，避免同步到账号）。
 */
(function (global) {
  'use strict';

  global.STQ_DEFAULTS = {
    enabled: true,
    llm: {
      protocol: 'openai',   // openai | anthropic
      authStyle: 'auto',    // auto | bearer | api-key | x-api-key
      baseUrl: '',          // 例如 https://api.openai.com/v1 或 https://dots.example.com
      apiKey: '',
      model: '',
      temperature: 0.2,
      maxTokens: 1024,      // anthropic 协议必填
      allowPrivateHosts: false, // 显式放行本地/内网地址（如 Ollama）
    },
    asr: {
      mode: 'auto',         // auto | webspeech | api | llm-multimodal
      prefer: 'browser-first', // auto 模式下的优先级：browser-first | service-first
      baseUrl: '',          // OpenAI 兼容转写服务（…/v1）
      apiKey: '',
      model: 'whisper-1',
      allowPrivateHosts: false,
    },
    voice: {
      lang: 'zh-CN',
      rate: 1.0,
      readQuestion: true,         // 是否朗读题目（关闭则直接进入聆听作答）
      readOptions: true,          // 朗读题目时是否朗读选项
      autoAdvanceSingle: true,    // 单选/量表说完自动下一题
      autoAdvanceMultiple: false, // 多选说完自动下一题（默认停留，需说"完成"）
      highlight: true,            // 页面上高亮当前题目（读题/作答阶段变色）
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

  /** 是否为本地/环回/私有/保留地址主机名（客户端侧，仅按字面判断，不做 DNS 解析） */
  global.stqIsPrivateHost = function stqIsPrivateHost(hostname) {
    const h = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
    if (!h) return true;
    if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
    if (h === '::1' || h === '::' || h === '0:0:0:0:0:0:0:1') return true;
    const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (v4) {
      const a = +v4[1];
      const b = +v4[2];
      if (a === 0 || a === 10 || a === 127) return true;
      if (a === 169 && b === 254) return true;      // link-local（含云元数据 169.254.169.254）
      if (a === 172 && b >= 16 && b <= 31) return true;
      if (a === 192 && b === 168) return true;
      if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
      if (a === 198 && (b === 18 || b === 19)) return true;
      if (a >= 224) return true;                    // 组播/保留
      return false;
    }
    if (/^f[cd][0-9a-f]{2}:/.test(h)) return true;  // fc00::/7
    if (/^fe[89ab][0-9a-f]:/.test(h)) return true;  // fe80::/10
    return false;
  };

  /**
   * 校验 BYOK Base URL：
   *  - 仅允许 http/https
   *  - 默认拒绝 localhost/环回/私有/保留地址；opts.allowPrivate=true 时放行（用户显式开启，用于本地模型）
   */
  global.stqValidateBaseUrl = function stqValidateBaseUrl(raw, opts) {
    const allowPrivate = !!(opts && opts.allowPrivate);
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
    if (!allowPrivate && global.stqIsPrivateHost(u.hostname)) {
      return { ok: false, error: '本地/内网地址默认被拦截；如使用本机模型（如 Ollama），请在设置中开启"允许本地/内网地址"' };
    }
    return { ok: true, url: url.replace(/\/+$/, '') };
  };
})(typeof window !== 'undefined' ? window : globalThis);

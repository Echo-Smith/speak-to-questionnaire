/**
 * LLM 协议适配层（可插拔）
 * 新增一种协议 = 在 STQ_PROTOCOLS 里加一个对象，background 与引擎无需改动。
 *
 * 目前支持：
 *  - openai    OpenAI 兼容 /chat/completions（OpenAI/DeepSeek/Moonshot/Ollama/Dots…）
 *  - anthropic Anthropic 兼容 /v1/messages（Anthropic/Dots…）
 */
(function (global) {
  'use strict';

  /** 拼接端点：容忍 base 带 /v1 或已带完整端点路径的写法 */
  function joinUrl(base, suffix) {
    const b = String(base || '').replace(/\/+$/, '');
    if (/\/(chat\/completions|messages)$/.test(b)) return b;
    if (/\/v\d+[a-z]*$/.test(b)) return b + '/' + suffix;
    return b + '/v1/' + suffix;
  }

  /**
   * 鉴权头。authStyle=auto 时按协议给默认组合：
   *  - anthropic: x-api-key + api-key + anthropic-version（兼容官方 Anthropic 与 Dots 的 api-key 头）
   *  - openai:    Authorization Bearer + api-key（兼容 OpenAI 与 Dots）
   */
  function buildHeaders(llm) {
    const h = { 'Content-Type': 'application/json' };
    const style = llm.authStyle || 'auto';
    if (style === 'bearer') {
      h['Authorization'] = 'Bearer ' + llm.apiKey;
    } else if (style === 'api-key') {
      h['api-key'] = llm.apiKey;
    } else if (style === 'x-api-key') {
      h['x-api-key'] = llm.apiKey;
      h['anthropic-version'] = '2023-06-01';
    } else if (llm.protocol === 'anthropic') {
      h['x-api-key'] = llm.apiKey;
      h['api-key'] = llm.apiKey;
      h['anthropic-version'] = '2023-06-01';
    } else {
      h['Authorization'] = 'Bearer ' + llm.apiKey;
      h['api-key'] = llm.apiKey;
    }
    return h;
  }

  function toAnthropicMessages(messages) {
    const system = [];
    const msgs = [];
    for (const m of messages) {
      if (m.role === 'system') system.push(typeof m.content === 'string' ? m.content : JSON.stringify(m.content));
      else msgs.push({ role: m.role, content: m.content });
    }
    return { system: system.join('\n') || undefined, messages: msgs };
  }

  global.STQ_PROTOCOLS = {
    openai: {
      buildRequest(settings, payload) {
        const llm = settings.llm;
        const body = {
          model: llm.model,
          messages: payload.messages,
          stream: false,
        };
        if (typeof payload.temperature === 'number') body.temperature = payload.temperature;
        else if (typeof llm.temperature === 'number') body.temperature = llm.temperature;
        if (payload.json) body.response_format = { type: 'json_object' };
        // 推理模型（Dots dots3 等）思考会耗尽 max_tokens 导致正文为空；不支持该字段的网关通常忽略之
        if (llm.disableThinking !== false) body.chat_template_kwargs = { enable_thinking: false };
        return { url: joinUrl(llm.baseUrl, 'chat/completions'), headers: buildHeaders(llm), body };
      },
      parseResponse(data) {
        const msg = data && data.choices && data.choices[0] && data.choices[0].message;
        if (!msg) return '';
        let c = msg.content;
        if (Array.isArray(c)) c = c.filter((b) => b.type === 'text').map((b) => b.text || '').join('');
        if (typeof c !== 'string') return '';
        return c;
      },
    },

    anthropic: {
      buildRequest(settings, payload) {
        const llm = settings.llm;
        const { system, messages } = toAnthropicMessages(payload.messages);
        const body = {
          model: llm.model,
          max_tokens: llm.maxTokens || 1024,
          stream: false,
          messages,
        };
        if (system) body.system = system;
        if (typeof payload.temperature === 'number') body.temperature = payload.temperature;
        else if (typeof llm.temperature === 'number') body.temperature = llm.temperature;
        return { url: joinUrl(llm.baseUrl, 'messages'), headers: buildHeaders(llm), body };
      },
      parseResponse(data) {
        const c = data && data.content;
        if (typeof c === 'string') return c;
        if (Array.isArray(c)) return c.filter((b) => b.type === 'text').map((b) => b.text || '').join('');
        return '';
      },
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);

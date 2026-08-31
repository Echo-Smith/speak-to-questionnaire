/**
 * 适配器注册表：probe 找到第一个可用的平台适配器，返回统一 survey 对象。
 */
(function () {
  'use strict';
  const STQ = (globalThis.STQ = globalThis.STQ || {});

  STQ.Registry = {
    adapters: [],

    register(adapter) {
      this.adapters.push(adapter);
    },

    probe() {
      for (const adapter of this.adapters) {
        try {
          const survey = adapter.probe();
          if (survey) return survey;
        } catch (e) {
          console.warn('[STQ] adapter probe failed:', adapter.name, e);
        }
      }
      return null;
    },
  };
})();

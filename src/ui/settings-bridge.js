/**
 * 设置页/popup 与 React UI 的桥：包装原生 settings.js（globalThis 上的 stq* 函数）。
 * React 组件内不直接摸 chrome.storage，便于测试与替换。
 */
globalThis.stqSettingsBridge = {
  load: () => globalThis.stqLoadSettings(),
  save: (s) => globalThis.stqSaveSettings(s),
  validateBaseUrl: (raw, opts) => globalThis.stqValidateBaseUrl(raw, opts),
  requestOriginPermission: async (rawUrl, allowPrivate) => {
    const check = globalThis.stqValidateBaseUrl(rawUrl, { allowPrivate: !!allowPrivate });
    if (!check.ok) return check;
    const origin = new URL(check.url).origin + '/*';
    try {
      await chrome.permissions.request({ origins: [origin] });
      return { ok: true };
    } catch (_) {
      return { ok: false, error: '未授予 ' + origin + ' 域名权限，无法调用' };
    }
  },
};

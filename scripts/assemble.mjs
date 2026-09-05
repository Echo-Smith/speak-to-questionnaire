/**
 * 构建后组装：把 vite 产物装配成可加载的扩展目录 dist/
 *
 * dist/
 *   manifest.json          （content_scripts 的 UI 部分指向 panel.js）
 *   content.js             （含 panel.js：悬浮面板 React 产物）
 *   settings-bridge.js     （React UI 与原生 settings 层的桥）
 *   src/...                （引擎与适配器，原样拷贝）
 *   options.html / popup.html（壳）+ ui/options.js ui/popup.js ui/*.css
 */
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const dist = join(root, 'dist');
const uiBuild = join(dist, 'ui');

rmSync(join(dist, 'app'), { recursive: true, force: true });
mkdirSync(join(dist, 'app'), { recursive: true });
mkdirSync(join(dist, 'app/ui'), { recursive: true });

// 1. 引擎与适配器（原生 JS，不打包）
cpSync(join(root, 'src'), join(dist, 'app/src'), { recursive: true });

// 2. UI 构建产物
for (const f of readdirSync(uiBuild)) {
  copyFileSync(join(uiBuild, f), join(dist, 'app/ui', f));
}

// 3. manifest：content_scripts 用单文件 content.js（= panel.js），UI 纯展示层
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf-8'));
const cs = manifest.content_scripts[0];
// panel.js 已含 createOverlay，替换 overlay.js 旧文件
cs.js = cs.js.filter((f) => f !== 'src/content/overlay.js').concat(['content.js']);
// options/popup 指向构建产物
manifest.options_page = 'options.html';
manifest.action.default_popup = 'popup.html';
writeFileSync(join(dist, 'app/manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

// 4. content.js：直接使用 panel.js 产物（IIFE，内含 createOverlay）
copyFileSync(join(dist, 'app/ui/panel.js'), join(dist, 'app/content.js'));

// 5. 壳页面
writeFileSync(join(dist, 'app/options.html'), `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>语音问卷助手 · 设置</title>
  <script src="src/shared/settings.js"></script>
  <script type="module" src="ui/options.js"></script>
</head>
<body>
  <div id="root"></div>
</body>
</html>
`);
writeFileSync(join(dist, 'app/popup.html'), `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <script src="src/shared/settings.js"></script>
  <script type="module" src="ui/popup.js"></script>
  <style>body{min-width:300px;margin:0}</style>
</head>
<body>
  <div id="root"></div>
</body>
</html>
`);

// 6. 附加资源
copyFileSync(join(root, 'README.md'), join(dist, 'app/README.md'));
copyFileSync(join(root, 'LICENSE'), join(dist, 'app/LICENSE'));

console.log('✓ dist/app 组装完成：加载 dist/app 即为可运行扩展');

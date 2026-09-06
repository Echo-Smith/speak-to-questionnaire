#!/usr/bin/env bash
# 发布脚本：校验 → 构建 → 打 zip → 提示创建 GitHub Release
# 用法：./scripts/release.sh 0.6.4
set -euo pipefail

VERSION="${1:?用法: ./scripts/release.sh <版本号，如 0.6.4>}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# 1. 工作区必须干净
if [ -n "$(git status --porcelain)" ]; then
  echo "✗ 工作区有未提交的改动，请先提交"; exit 1
fi

# 2. 版本号写入 package.json 与 manifest.json
node -e "
const fs = require('fs');
for (const f of ['package.json', 'manifest.json']) {
  const m = JSON.parse(fs.readFileSync(f, 'utf8'));
  m.version = '$VERSION';
  fs.writeFileSync(f, JSON.stringify(m, null, 2) + '\n');
}
console.log('版本号 → $VERSION');
"

# 3. 构建与打包
npm ci --no-audit --no-fund >/dev/null 2>&1 || npm install --no-audit --no-fund >/dev/null
npm run build
ZIP="speak-to-questionnaire-v$VERSION.zip"
rm -f "$ZIP"
# 注意：manifest.json 必须位于压缩包根目录（Edge/Chrome 商店校验要求）
(cd dist/app && zip -rq "../../$ZIP" . -x '*.DS_Store')
echo "✓ $ZIP 打包完成（manifest 位于根目录）"

# 4. 提交版本号并打 tag
git add package.json manifest.json
git -c user.name="${GIT_AUTHOR:-$(git config user.name || echo Echo-Smith)}" \
    -c user.email="${GIT_EMAIL:-$(git config user.email || echo 85275804+Echo-Smith@users.noreply.github.com)}" \
    commit -m "chore: release v$VERSION" || echo "（版本号无变化，跳过提交）"
git tag "v$VERSION"
git push && git push origin "v$VERSION"

# 5. 创建 Release（需要 gh 或 GITHUB_TOKEN）
if command -v gh >/dev/null 2>&1; then
  gh release create "v$VERSION" "$ZIP" --title "v$VERSION" --generate-notes
else
  echo "未安装 gh CLI。请手动完成最后一步："
  echo "  1. GitHub → Releases → Draft a new release → 选择 tag v$VERSION"
  echo "  2. 上传 $ZIP"
  echo "  或用 API：见 README 开发章节"
fi
echo "✓ v$VERSION 发布完成"

#!/bin/sh
set -eu

OUT="ss2_support_bundle_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$OUT"

# 1) 構成一覧
if command -v tree >/dev/null 2>&1; then
  tree -a -I "node_modules|.git|dist|.next|out|build|.parcel-cache|.turbo|coverage|.DS_Store" -L 3 > "$OUT/01_tree_L3.txt" || true
fi
git ls-files > "$OUT/02_git_ls-files.txt" || true

# 2) バージョン情報
{
  echo "# versions"
  (node -v 2>/dev/null || true)
  (npm -v 2>/dev/null || true)
  (pnpm -v 2>/dev/null || true)
  (yarn -v 2>/dev/null || true)
} > "$OUT/03_tool_versions.txt"

# 3) すべての package.json と lock を収集
mkdir -p "$OUT/packages"
git ls-files | grep -E '/?package\.json$' | while IFS= read -r p; do
  d=$(dirname "$p")
  mkdir -p "$OUT/packages/$d"
  cp "$p" "$OUT/packages/$d/" 2>/dev/null || true
  for lock in package-lock.json pnpm-lock.yaml yarn.lock; do
    [ -f "$d/$lock" ] && cp "$d/$lock" "$OUT/packages/$d/" || true
  done
done

# 4) ルート直下の主要設定ファイル
mkdir -p "$OUT/config_root"
for pat in \
  "docker-compose.yml" \
  ".nvmrc" ".node-version" \
  "vite.config.ts" "vite.config.js" \
  "tsconfig.json" "jsconfig.json" \
  ".eslintrc" ".eslintrc.json" ".eslintrc.js" ".eslintrc.cjs" ".eslintrc.yaml" ".eslintrc.yml" \
  ".prettierrc" ".prettierrc.json" ".prettierrc.js" ".prettierrc.cjs" ".prettierrc.yaml" ".prettierrc.yml" \
  "postcss.config.js" "postcss.config.cjs" "postcss.config.mjs" \
  "tailwind.config.js" "tailwind.config.cjs" "tailwind.config.mjs"
do
  for f in $pat; do
    [ -f "$f" ] && cp "$f" "$OUT/config_root/" || true
  done
done

# 5) apps 配下の各種設定ファイルを収集
find apps -type f \( \
  -name package.json -o -name vite.config.js -o -name vite.config.ts -o \
  -name tsconfig.json -o -name jsconfig.json \
\) 2>/dev/null | while IFS= read -r f; do
  mkdir -p "$OUT/$(dirname "$f")"
  cp "$f" "$OUT/$f" 2>/dev/null || true
done

# 6) .env 類はサンプル化（値は伏せる）
mkdir -p "$OUT/env_samples"
git ls-files | grep -E '\.env(\..+)?$' | while IFS= read -r e; do
  d=$(dirname "$e")
  mkdir -p "$OUT/env_samples/$d"
  # キー名だけ残して値を <REDACTED> に
  awk -F= 'BEGIN{OFS="="} /^[[:space:]]*#/ {print; next} NF>=1 {gsub(/\r/,""); if($1!=""){print $1,"<REDACTED>"}}' "$e" > "$OUT/env_samples/$e.example"
done

# 7) DB スキーマ系
mkdir -p "$OUT/db"
git ls-files | grep -E '\.(sql|ddl)$' | while IFS= read -r f; do
  mkdir -p "$OUT/$(dirname "$f")"
  cp "$f" "$OUT/$f" 2>/dev/null || true
done

# 8) Backend ルーター/設定（js/ts/json のみ）
collect_backend_path () {
  base="$1"
  if [ -d "$base" ]; then
    find "$base" -type f \( -name '*.js' -o -name '*.ts' -o -name '*.json' \) 2>/dev/null | while IFS= read -r f; do
      mkdir -p "$OUT/$(dirname "$f")"
      cp "$f" "$OUT/$f" 2>/dev/null || true
    done
  fi
}
collect_backend_path "backend/config"
# apps/**/backend/routes と apps/**/backend/*.js
find apps -type d -path '*/backend/routes' 2>/dev/null | while IFS= read -r dir; do
  collect_backend_path "$dir"
done
find apps -type d -path '*/backend' 2>/dev/null | while IFS= read -r dir; do
  find "$dir" -maxdepth 1 -type f -name '*.js' 2>/dev/null | while IFS= read -r f; do
    mkdir -p "$OUT/$(dirname "$f")"
    cp "$f" "$OUT/$f" 2>/dev/null || true
  done
done

# 9) Frontend の主要 src（画像など大物は除外）
collect_front_src () {
  root="$1"
  if [ -d "$root" ]; then
    find "$root" -type f \( \
      -path '*/src/main.*' -o -path '*/src/App.*' -o \
      -path '*/src/routes/*' -o -path '*/src/pages/*' -o -path '*/src/components/*' \
    \) ! -name '*.png' ! -name '*.jpg' ! -name '*.jpeg' ! -name '*.webp' ! -name '*.svg' 2>/dev/null | while IFS= read -r f; do
      mkdir -p "$OUT/$(dirname "$f")"
      cp "$f" "$OUT/$f" 2>/dev/null || true
    done
  fi
}
find apps -type d -path '*/frontend' 2>/dev/null | while IFS= read -r fe; do
  collect_front_src "$fe"
done

# 10) まとめ
tar -czf "$OUT.tar.gz" "$OUT"
echo "Created: $OUT.tar.gz"

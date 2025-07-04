# ベースイメージ
FROM node:18

# 作業ディレクトリ作成
WORKDIR /app

# package.jsonをコピーして依存関係をインストール
COPY package*.json ./
RUN npm install

# アプリケーションの全ファイルをコピー
COPY . .

# ポートを開放（Express）
EXPOSE 3000

# サーバー起動
CMD ["node", "server.js"]

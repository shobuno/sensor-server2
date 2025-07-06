# ベースイメージ
FROM node:18

# タイムゾーンをJSTに設定
ENV TZ=Asia/Tokyo
RUN ln -snf /usr/share/zoneinfo/Asia/Tokyo /etc/localtime && echo Asia/Tokyo > /etc/timezone

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


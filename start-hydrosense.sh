#!/bin/bash

SESSION_NAME="hydrosense"

# 既にセッションがあるなら削除
tmux has-session -t $SESSION_NAME 2>/dev/null
if [ $? -eq 0 ]; then
  tmux kill-session -t $SESSION_NAME
fi

# 新しいセッションを開始
tmux new-session -d -s $SESSION_NAME

# Cloudflare Tunnel
tmux rename-window -t $SESSION_NAME:0 'tunnel'
tmux send-keys -t $SESSION_NAME:0 'cloudflared tunnel --config ~/.cloudflared/config.yml run' C-m

# サーバー + React自動ビルド
tmux new-window -t $SESSION_NAME:1 -n 'server'
tmux send-keys -t $SESSION_NAME:1 'cd /Volumes/USB4_2TB/webApps/sensor-server' C-m
tmux send-keys -t $SESSION_NAME:1 'npm run --prefix apps/hydro-sense/frontend build' C-m
tmux send-keys -t $SESSION_NAME:1 'node server.js' C-m

# 自動でセッションにアタッチ
tmux attach-session -t $SESSION_NAME

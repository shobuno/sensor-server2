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

# Backend (APIサーバ)
tmux new-window -t $SESSION_NAME:1 -n 'backend'
tmux send-keys -t $SESSION_NAME:1 'cd /Volumes/USB4_2TB/webApps/sensor-server' C-m
tmux send-keys -t $SESSION_NAME:1 'node server.js' C-m

# Frontend (React - ビルド済みの表示)
tmux new-window -t $SESSION_NAME:2 -n 'frontend'
tmux send-keys -t $SESSION_NAME:2 'cd /Volumes/USB4_2TB/webApps/sensor-server/apps/hydro-sense/frontend' C-m
tmux send-keys -t $SESSION_NAME:2 'npx serve -s dist -l 5173' C-m

# 自動でセッションにアタッチ
tmux attach-session -t $SESSION_NAME

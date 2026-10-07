#!/bin/zsh
cd "$(dirname "$0")"
exec /opt/homebrew/bin/node --env-file-if-exists=.env server.mjs

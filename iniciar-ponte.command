#!/bin/bash
cd "$(dirname "$0")"
[ -d node_modules ] || npm install --no-audit --no-fund
open http://localhost:3777
node ponte.js

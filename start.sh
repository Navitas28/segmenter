#!/bin/bash

echo "🚀 Starting all servers..."

# Start main server (current folder)
echo "Starting Main Server..."
npm run dev &
MAIN_PID=$!

# Start UI server
echo "Starting UI Server..."
cd src/ui
npm run dev &
UI_PID=$!
cd ../..


echo "✅ All servers started!"
echo "Main PID: $MAIN_PID"
echo "UI PID: $UI_PID"
echo "Family PID: $FAMILY_PID"

# Wait for all processes
wait
# Start the Node.js backend server
Start-Process node -ArgumentList "index.js" -WorkingDirectory "C:\chatapp\chat-app\server" -WindowStyle Minimized

# Wait for server to start
Start-Sleep -Seconds 3

# Start the Vite frontend dev server
Start-Process npx -ArgumentList "vite" -WorkingDirectory "C:\chatapp\chat-app\client" -WindowStyle Minimized

Write-Host "All services started:"
Write-Host "  - Node.js backend: http://localhost:3001"
Write-Host "  - Vite dev server: http://localhost:5173"
Write-Host "  - Vite proxy: /api -> :3001, /socket.io -> :3001"
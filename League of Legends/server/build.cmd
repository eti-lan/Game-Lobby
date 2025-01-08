cd /d "%~dp0"
del server.exe
rem npm install -g pkg
pkg server.js --targets node16-win-x64 --output server.exe

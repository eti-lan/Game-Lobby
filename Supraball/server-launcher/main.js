const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  mainWindow.setMenu(null);
  mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.on('start-server', (event, data) => {
  const selectedMap = data.map;
  const timeLimit = data.timeLimit;
  const maxPlayers = data.maxPlayers;
  const serverName = data.serverName;
  const args = [
    "server",
    `${selectedMap}?timelimit=${timeLimit}?MaxPlayers=${maxPlayers}?MaxSpectators=6?Matchtitle=${serverName}?bMatchmaking=false?AdminPassword=password?MatchName=${serverName}?MatchDescription=LAN?bShouldAdvertise=0?bRanked=false?bIsLanMatch=true?bAllowJoinInProgress=true?bAllowJoinViaPresence=true`
  ];
  const executablePath = path.join(process.cwd(), "..", "Binaries", "Win64", "UDK.exe");
  const serverProcess = spawn(executablePath, args, { cwd: process.cwd() });
  serverProcess.stdout.on('data', (data) => {
    console.log(`stdout: ${data}`);
  });
  serverProcess.stderr.on('data', (data) => {
    console.error(`stderr: ${data}`);
  });
  serverProcess.on('close', (code) => {
    console.log(`Child process exited with code ${code}`);
  });
});

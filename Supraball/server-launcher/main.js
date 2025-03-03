// Date: 2025-02-08
// Purpose: Electron main process for the Supraball Server Launcher with extended options

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

// Listen for the 'start-server' message from the renderer process with extended options
ipcMain.on('start-server', (event, data) => {
  const selectedMap = data.map;
  const maxPlayers = data.maxPlayers;
  const serverName = data.serverName;
  let params = `${selectedMap}`;

  // Depending on the game mode, use either Time Limit or Goal Score
  if (data.mode === 'time') {
    params += `?timelimit=${data.timeLimit}`;
  } else if (data.mode === 'goal') {
    params += `?GoalScore=${data.goalScore}`;
  }

  // Additional parameters for the server
  params += `?MaxPlayers=${maxPlayers}`;
  params += "?MaxSpectators=6";
  params += `?Matchtitle=${serverName}`;
  params += "?bMatchmaking=true";
  params += "?AdminPassword=password";
  params += `?MatchName=${serverName}`;
  params += "?MatchDescription=LAN";
  params += "?bShouldAdvertise=0";
  params += "?bRanked=false";
  params += "?bIsLanMatch=true";
  params += "?bAllowJoinInProgress=true";
  params += "?bAllowJoinViaPresence=true";

  // If bots are activated, add the corresponding parameters
  if (data.botsActive) {
    params += "?bAutoNumBots=false";
    // Set a default value for NumPlay (e.g., 6) so that bots are added if there are not enough human players
    params += "?NumPlay=2";
    params += "?bAutoBotSkill=false";
    params += `?BotSkill=${data.botSkill}`;
  }

  const args = [
    "server",
    params
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

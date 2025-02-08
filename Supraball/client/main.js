const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 600,
    height: 500,
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
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

ipcMain.on('connect-server', (event, serverIP) => {
  const args = [`${serverIP}:7777?ReadUp=1?ConfirmConnect=0?bTravel=0`];
  const executablePath = path.join(process.cwd(), "..", "Binaries", "Win32", "UDK.exe");
  const clientProcess = spawn(executablePath, args, { cwd: process.cwd() });
  clientProcess.stdout.on('data', (data) => console.log(`stdout: ${data}`));
  clientProcess.stderr.on('data', (data) => console.error(`stderr: ${data}`));
  clientProcess.on('close', (code) => console.log(`Client process exited with code ${code}`));
});

ipcMain.on('start-training', (event, trainingMap) => {
  const args = [`${trainingMap}?Training=1`];
  const executablePath = path.join(process.cwd(), "..", "Binaries", "Win32", "UDK.exe");
  const clientProcess = spawn(executablePath, args, { cwd: process.cwd() });
  clientProcess.stdout.on('data', (data) => console.log(`stdout: ${data}`));
  clientProcess.stderr.on('data', (data) => console.error(`stderr: ${data}`));
  clientProcess.on('close', (code) => console.log(`Training process exited with code ${code}`));
});

ipcMain.on('start-combined-training', (event) => {
  const args = [`db-smallpitch?ReadUp=1?ConfirmConnect=0?bTravel=0`];
  const executablePath = path.join(process.cwd(), "..", "Binaries", "Win32", "UDK.exe");
  const clientProcess = spawn(executablePath, args, { cwd: process.cwd() });
  clientProcess.stdout.on('data', (data) => console.log(`stdout: ${data}`));
  clientProcess.stderr.on('data', (data) => console.error(`stderr: ${data}`));
  clientProcess.on('close', (code) => console.log(`Combined training client exited with code ${code}`));
});

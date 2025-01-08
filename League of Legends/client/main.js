const { app, BrowserWindow, ipcMain, Menu } = require('electron');  // Import Menu
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

let mainWindow;

app.on('ready', () => {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 850,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false, // Disable Context Isolation
    },
  });

  mainWindow.loadFile('index.html');
  Menu.setApplicationMenu(null);
});

// IPC Listener for Starting the Game
ipcMain.on('start-game', (event, { commandLine, gameDirectory }) => {
  console.log('Game start command in main process:', commandLine);

  // Check if the file exists
  if (!fs.existsSync(path.join(gameDirectory, 'League of Legends.exe'))) {
    console.error(`Game not found at: ${gameDirectory}`);
    event.reply('game-start-error', `Game not found at: ${gameDirectory}`);
    return;
  }

  // Start the game with exec and set the working directory to the game's home directory
  exec(commandLine, { cwd: gameDirectory }, (err, stdout, stderr) => {
    if (err) {
      console.error('Error starting the game:', err.message);
      event.reply('game-start-error', err.message);
      return;
    }

    if (stderr) {
      console.error('Error starting the game:', stderr);
      event.reply('game-start-error', stderr);
      return;
    }

    console.log('Game started successfully.');
    event.reply('game-start-success');
  });
});

// Close the application when all windows are closed
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

/*
Date: 03.03.2025
Purpose: Main process for the Electron-based GZDoom Launcher with hidden menu bar.
Description: This script creates the main window with a hidden default menu bar, listens for IPC messages from the renderer process,
             and launches GZDoom with the provided parameters.
*/

const { app, BrowserWindow, ipcMain } = require('electron');
const { spawn } = require('child_process');
const path = require('path');

function createWindow() {
    const win = new BrowserWindow({
        width: 1100,
        height: 800,
        autoHideMenuBar: true, // Hides the default menu bar
        webPreferences: {
            nodeIntegration: true,      // Enable Node.js integration in the renderer process
            contextIsolation: false     // For easier access (consider security implications)
        }
    });
    win.loadFile('index.html');
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});

// IPC Listener: Launches the GZDoom process with the provided parameters
ipcMain.on('start-game', (event, gameParams) => {
    let args = [];
    if (gameParams.mode === "host") {
        args.push("-host", gameParams.numPlayers.toString(), gameParams.port.toString());
    } else if (gameParams.mode === "join") {
        args.push("-join", gameParams.ipAddress, "-port", gameParams.port.toString());
    }
    // Add the IWAD and optional addon
    args.push("-iwad", gameParams.iwad);
    if (gameParams.addon && gameParams.addon !== "") {
        args.push(gameParams.addon);
    }
    if (gameParams.skill) {
        args.push("-skill", gameParams.skill.toString());
    }
    if (gameParams.map) {
        args.push("+map", gameParams.map);
    }
    if (gameParams.cheats !== undefined) {
        args.push("+sv_cheats", gameParams.cheats.toString());
    }
    if (gameParams.playerClass && gameParams.playerClass !== "") {
        args.push(gameParams.playerClass);
    }
    
    console.log("Launching GZDoom with the following parameters:", args);
    
    // Launch GZDoom (Note: Adjust the path to gzdoom.exe if necessary)
    const gzdoom = spawn('gzdoom.exe', args, { shell: true });
    
    gzdoom.stdout.on('data', (data) => {
        console.log(`stdout: ${data}`);
    });
    
    gzdoom.stderr.on('data', (data) => {
        console.error(`stderr: ${data}`);
    });
    
    gzdoom.on('close', (code) => {
        console.log(`GZDoom process exited with code ${code}`);
    });
});

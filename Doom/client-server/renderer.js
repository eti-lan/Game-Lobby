/*
Date: 03.03.2025
Purpose: Renderer script for the Electron-based GZDoom Launcher with dynamic IP display for host mode and updated mode selection.
Description: This script handles user interactions in the GUI. It automatically populates the map selection based on the chosen IWAD,
             updates the game cover image based on the selected game, manages the mode selection via clickable buttons, and displays
             the local IP address when 'Host' mode is selected.
*/

const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');

// DOM elements
const iwadSelect = document.getElementById('iwad');
const mapSelect = document.getElementById('map');
const launcherForm = document.getElementById('launcherForm');
const gameCover = document.getElementById('gameCover');
const modeSelectHidden = document.getElementById('mode');
const joinOptions = document.getElementById('joinOptions');
const modeHostButton = document.getElementById('modeHost');
const modeJoinButton = document.getElementById('modeJoin');
const hostIpDisplay = document.getElementById('hostIpDisplay'); // Element for displaying IP address

// Mapping of IWAD values to cover image paths
const covers = {
    "doom_complete.pk3": "images/doom.png",
    "heretic.wad": "images/heretic.png",
    "hexen.wad": "images/hexen.png",
    "strife1.wad": "images/strife.png",
    "hacx.wad": "images/hacx.png",
    "chex.wad": "images/chex.png",
    "wolf3d.ipk3": "images/wolfenstein.png"
};

// Function to update the game cover based on selected IWAD
function updateGameCover(selectedIWAD) {
    const coverPath = covers[selectedIWAD] || "images/doom.png";
    gameCover.src = coverPath;
}

// Function to load maps from maps.json based on the selected IWAD
function loadMapsForIWAD(selectedIWAD) {
    const mapsFilePath = path.join(__dirname, 'maps.json');
    fs.readFile(mapsFilePath, 'utf8', (err, data) => {
        if (err) {
            console.error("Error reading maps configuration:", err);
            return;
        }
        try {
            const mapsConfig = JSON.parse(data);
            const maps = mapsConfig[selectedIWAD] || [];
            // Clear existing options in the map select element
            mapSelect.innerHTML = '';
            if (maps.length === 0) {
                const option = document.createElement('option');
                option.value = '';
                option.textContent = '-- No maps available --';
                mapSelect.appendChild(option);
            } else {
                maps.forEach(mapName => {
                    const option = document.createElement('option');
                    option.value = mapName;
                    option.textContent = mapName;
                    mapSelect.appendChild(option);
                });
            }
        } catch (parseErr) {
            console.error("Error parsing maps configuration:", parseErr);
        }
    });
}

// Function to get the local IP address
function getLocalIPAddress() {
    const interfaces = os.networkInterfaces();
    for (let iface in interfaces) {
        for (let alias of interfaces[iface]) {
            if (alias.family === 'IPv4' && !alias.internal) {
                return alias.address;
            }
        }
    }
    return '127.0.0.1';
}

// Initialize UI elements on DOM content loaded
document.addEventListener('DOMContentLoaded', () => {
    // Set initial game cover and map selection based on default IWAD
    const defaultIWAD = iwadSelect.value;
    updateGameCover(defaultIWAD);
    loadMapsForIWAD(defaultIWAD);
    // If default mode is host, display the local IP address
    if (modeSelectHidden.value === 'host' && hostIpDisplay) {
        hostIpDisplay.style.display = 'block';
        hostIpDisplay.textContent = "Your IP: " + getLocalIPAddress();
    }
});

// Event listener: When the IWAD selection changes, update cover and load maps
iwadSelect.addEventListener('change', () => {
    const selectedIWAD = iwadSelect.value;
    updateGameCover(selectedIWAD);
    loadMapsForIWAD(selectedIWAD);
});

// Mode button click handling for Host mode
modeHostButton.addEventListener('click', () => {
    modeSelectHidden.value = "host";
    modeHostButton.classList.add('selected');
    modeJoinButton.classList.remove('selected');
    joinOptions.style.display = 'none';
    if (hostIpDisplay) {
         hostIpDisplay.style.display = 'block';
         hostIpDisplay.textContent = "Your IP: " + getLocalIPAddress();
    }
});

// Mode button click handling for Join mode
modeJoinButton.addEventListener('click', () => {
    modeSelectHidden.value = "join";
    modeJoinButton.classList.add('selected');
    modeHostButton.classList.remove('selected');
    joinOptions.style.display = 'block';
    if (hostIpDisplay) {
         hostIpDisplay.style.display = 'none';
    }
});

// Form submission: Collect values and send t

const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

const basePath = path.join(process.cwd(), "..");
const mapsDir = path.join(basePath, "UDKGame", "CookedPC", "Deathball", "Maps");
const imagesDir = path.join(basePath, "images");

let selectedMap = "";
const mapsContainer = document.getElementById('mapsContainer');
const excludedMaps = ["DB-FrontEndMap", "DB-Skill", "DB-Tutorial", "DB-TrainingPitch"];

if (fs.existsSync(mapsDir)) {
  let files = fs.readdirSync(mapsDir);
  let mapFiles = files.filter(file => file.toLowerCase().endsWith('.udk'));
  mapFiles.forEach(file => {
    let mapName = path.basename(file, path.extname(file));
    if (excludedMaps.includes(mapName)) return;
    let mapBox = document.createElement('div');
    mapBox.classList.add('map-box');
    mapBox.dataset.mapName = mapName;
    let imgPath = path.join(imagesDir, mapName + ".jpg");
    let imgElement = document.createElement('img');
    if (fs.existsSync(imgPath)) {
      imgElement.src = imgPath;
    } else {
      imgElement.src = "";
    }
    mapBox.appendChild(imgElement);
    let label = document.createElement('div');
    label.classList.add('map-label');
    label.textContent = mapName;
    mapBox.appendChild(label);
    mapBox.addEventListener('click', () => {
      document.querySelectorAll('.map-box').forEach(box => box.classList.remove('selected'));
      mapBox.classList.add('selected');
      selectedMap = mapName;
    });
    mapsContainer.appendChild(mapBox);
  });
} else {
  alert("Maps directory not found: " + mapsDir);
}

const timeLimitInput = document.getElementById('timeLimit');
const maxPlayersInput = document.getElementById('maxPlayers');
const serverNameInput = document.getElementById('serverName');
const startButton = document.getElementById('startButton');
const cancelButton = document.getElementById('cancelButton');

startButton.addEventListener('click', () => {
  if (!selectedMap) {
    alert("Please select a map.");
    return;
  }
  const timeLimit = parseInt(timeLimitInput.value, 10);
  if (isNaN(timeLimit)) {
    alert("Please enter a valid number for the time limit.");
    return;
  }
  const maxPlayers = parseInt(maxPlayersInput.value, 10);
  if (isNaN(maxPlayers)) {
    alert("Please enter a valid number for max players.");
    return;
  }
  const serverName = serverNameInput.value.trim();
  if (!serverName) {
    alert("Please enter a server name.");
    return;
  }
  ipcRenderer.send('start-server', { 
    map: selectedMap, 
    timeLimit: timeLimit,
    maxPlayers: maxPlayers,
    serverName: serverName,
  });
});

cancelButton.addEventListener('click', () => {
  window.close();
});

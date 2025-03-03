// Date: 2025-02-08
// Purpose: Renderer process for the Supraball Server Launcher with UI interactions and extended options

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

const timeLimitGroup = document.getElementById('timeLimitGroup');
const goalScoreGroup = document.getElementById('goalScoreGroup');
const timeLimitInput = document.getElementById('timeLimit');
const goalScoreInput = document.getElementById('goalScore');
const maxPlayersInput = document.getElementById('maxPlayers');
const serverNameInput = document.getElementById('serverName');
const startButton = document.getElementById('startButton');
const cancelButton = document.getElementById('cancelButton');

const modeTimeRadio = document.getElementById('modeTime');
const modeGoalRadio = document.getElementById('modeGoal');

// Toggle the corresponding input fields based on the selected game mode
modeTimeRadio.addEventListener('change', () => {
  if (modeTimeRadio.checked) {
    timeLimitGroup.style.display = "flex";
    goalScoreGroup.style.display = "none";
  }
});
modeGoalRadio.addEventListener('change', () => {
  if (modeGoalRadio.checked) {
    timeLimitGroup.style.display = "none";
    goalScoreGroup.style.display = "flex";
  }
});

const botsCheckbox = document.getElementById('botsCheckbox');
const botSkillGroup = document.getElementById('botSkillGroup');
const botSkillSlider = document.getElementById('botSkill');
const botSkillValue = document.getElementById('botSkillValue');

// Show or hide the bot skill slider based on the bots checkbox status
botsCheckbox.addEventListener('change', () => {
  if (botsCheckbox.checked) {
    botSkillGroup.style.display = "flex";
  } else {
    botSkillGroup.style.display = "none";
  }
});

// Update the displayed value of the bot skill slider in real time
botSkillSlider.addEventListener('input', () => {
  botSkillValue.textContent = botSkillSlider.value;
});

startButton.addEventListener('click', () => {
  if (!selectedMap) {
    alert("Please select a map.");
    return;
  }

  // Determine the game mode and validate the input
  let mode;
  let timeLimit, goalScore;
  if (modeTimeRadio.checked) {
    mode = 'time';
    timeLimit = parseInt(timeLimitInput.value, 10);
    if (isNaN(timeLimit)) {
      alert("Please enter a valid number for the Time Limit.");
      return;
    }
  } else if (modeGoalRadio.checked) {
    mode = 'goal';
    goalScore = parseInt(goalScoreInput.value, 10);
    if (isNaN(goalScore)) {
      alert("Please enter a valid number for the Goal Score.");
      return;
    }
  }

  const maxPlayers = parseInt(maxPlayersInput.value, 10);
  if (isNaN(maxPlayers)) {
    alert("Please enter a valid number for Max Players.");
    return;
  }

  const serverName = serverNameInput.value.trim();
  if (!serverName) {
    alert("Please enter a server name.");
    return;
  }

  // Check if bots are activated and retrieve the bot skill value if needed
  const botsActive = botsCheckbox.checked;
  let botSkill = 0;
  if (botsActive) {
    botSkill = parseInt(botSkillSlider.value, 10);
    if (isNaN(botSkill)) {
      alert("Please enter a valid value for Bot Skill.");
      return;
    }
  }

  // Send the collected data to the main process
  ipcRenderer.send('start-server', {
    map: selectedMap,
    mode: mode,
    timeLimit: timeLimit,
    goalScore: goalScore,
    maxPlayers: maxPlayers,
    serverName: serverName,
    botsActive: botsActive,
    botSkill: botSkill
  });
});

cancelButton.addEventListener('click', () => {
  window.close();
});

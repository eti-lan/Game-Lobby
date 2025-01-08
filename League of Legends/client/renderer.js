// eti GameLobby Client
// renderer.js (Electron Frontend)

document.addEventListener('DOMContentLoaded', async () => {
  // Required modules
  const fs = require('fs');
  const path = require('path');
  const { ipcRenderer } = require('electron'); // Import ipcRenderer for communication with the Main Process
  const os = require('os');                   // For checking platform in ping function
  const child_process = require('child_process'); // For pinging on Windows

  // Directory where the .exe is executed
  const executablePath = process.cwd();

  // Paths to the configuration files
  const playerDataFilePath = path.join(executablePath, 'player-data.json');
  const configFilePath = path.join(executablePath, 'client-config.json');

  // HTML elements
  const nameInput = document.getElementById('name');
  const championSelect = document.getElementById('champion');
  const spellSelect = document.getElementById('spell');
  const leaveButton = document.getElementById('leave');
  const countdownDiv = document.getElementById('countdown');
  const countdownTimer = document.getElementById('countdown-timer');

  const readyButton = document.getElementById('ready');
  const teamRedButton = document.getElementById('team-red');
  const teamBlueButton = document.getElementById('team-blue');
  const chatInput = document.getElementById('chat-input');
  const chatSendButton = document.getElementById('chat-send');
  const adminButton = document.getElementById('admin-button');
  const adminPasswordInput = document.getElementById('admin-password');
  const playerList = document.getElementById('player-list');
  const chatMessages = document.getElementById('chat-messages');
  const teamRedPlayers = document.getElementById('team-red-players');
  const teamBluePlayers = document.getElementById('team-blue-players');
  const statusLine = document.getElementById('status-line');
  const championIconDisplay = document.getElementById('champion-icon'); // Element for the champion icon

  // New elements for Game Settings
  const gamesettingsButton = document.getElementById('gamesettings-button');
  const gamesettingsModal = document.getElementById('gamesettings-modal');
  const closeGamesettingsButton = document.getElementById('close-gamesettings');
  const saveGamesettingsButton = document.getElementById('save-gamesettings');
  const cancelGamesettingsButton = document.getElementById('cancel-gamesettings');

  const manaCostsEnabledCheckbox = document.getElementById('mana-costs-enabled');
  const cooldownsEnabledCheckbox = document.getElementById('cooldowns-enabled');
  const minionSpawnsEnabledCheckbox = document.getElementById('minion-spawns-enabled');
  const tickRateInput = document.getElementById('tick-rate');
  const mapSelect = document.getElementById('map-select');

  // ADDED: Elements for checking server availability (Modal)
  const serverCheckModal = document.getElementById('server-check-modal');
  const serverCheckClose = document.getElementById('server-check-close');
  const newServerInput = document.getElementById('new-server-input');
  const newServerSaveButton = document.getElementById('new-server-save');
  const newServerCancelButton = document.getElementById('new-server-cancel');

  // Variables for network/server information
  let serverHost, httpPort, webSocketPort, socket, reconnectInterval;
  let gameDirectory;
  let gameServerPort;

  // Flags and states
  let isAdmin = false;
  let isGameStarting = false;
  let isGameLaunchedByAdmin = false; // prevents double launch

  // **Important**: ephemeralGameId + countdownFinished for correct flow
  let ephemeralGameId = null;       // Temporary ID from the server for game launch
  let countdownFinished = false;    // Becomes true once the countdown is over

  // List for maps and mapping from Champion -> Class
  let availableMaps = [];
  const championNameToClass = {};

  // -------------------------------
  // Blowfish key / Player data
  // -------------------------------

  // Function to generate the Blowfish key (Base64)
  function generateBlowfishKey() {
    const crypto = require('crypto');
    const key = crypto.randomBytes(16);
    return key.toString('base64');
  }

  // Load player data or create defaults
  function loadPlayerData() {
    try {
      if (fs.existsSync(playerDataFilePath)) {
        const data = JSON.parse(fs.readFileSync(playerDataFilePath, 'utf8'));
        // If no Blowfish key exists, generate one
        if (!data.blowfish_key) {
          data.blowfish_key = generateBlowfishKey();
          savePlayerData(data);
        }
        return data;
      }
      const defaultData = { name: '', blowfish_key: generateBlowfishKey() };
      savePlayerData(defaultData);
      return defaultData;
    } catch (error) {
      console.error('Error loading player data:', error);
      return { name: '', blowfish_key: generateBlowfishKey() };
    }
  }

  // Save player data to JSON file
  function savePlayerData(data) {
    try {
      fs.writeFileSync(playerDataFilePath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Error saving player data:', error);
    }
  }

  const playerData = loadPlayerData();
  nameInput.value = playerData.name;

  // As soon as the name changes, also save immediately
  nameInput.addEventListener('input', () => {
    playerData.name = nameInput.value.trim();
    savePlayerData(playerData);
  });

  // -------------------------------
  // Helper functions
  // -------------------------------

  function logMessage(message) {
    const messageDiv = document.createElement('div');
    messageDiv.textContent = message;
    messageDiv.classList.add('status-message');
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  // Function to preload icons
  function preloadImages(imagePaths) {
    imagePaths.forEach((src) => {
      const img = new Image();
      img.src = src;
    });
  }

  // -------------------------------------------------
  // ADDED (2025-01-07): Factor out the loading
  // of Champions, Spells, and Maps into a function
  // so it can be re-run after server changes.
  // -------------------------------------------------
  async function loadInitialData() {
    try {
      // Load champions
      const championsResponse = await fetch(`http://${serverHost}:${httpPort}/champions`);
      // Load spells
      const spellsResponse = await fetch(`http://${serverHost}:${httpPort}/spells`);
      // Load maps
      const mapsResponse = await fetch(`http://${serverHost}:${httpPort}/maps`);

      if (!championsResponse.ok || !spellsResponse.ok || !mapsResponse.ok) {
        throw new Error('Error loading champions, spells, or maps');
      }

      const championsData = await championsResponse.json();
      const spellsData = await spellsResponse.json();
      const mapsData = await mapsResponse.json();

      console.log('Champions Data:', championsData);
      console.log('Spells Data:', spellsData);
      console.log('Maps Data:', mapsData);

      // -- Populate Champion Select --
      if (championsData.champions && Array.isArray(championsData.champions)) {
        championSelect.innerHTML = '<option value="" disabled selected>Select Champion</option>';
        const championIcons = ['assets/icons/default-champion.png'];
        championsData.champions.forEach(champion => {
          const option = document.createElement('option');
          option.value = champion.name;
          option.textContent = champion.name;
          championSelect.appendChild(option);
          championIcons.push(`assets/icons/${champion.name}.png`);

          championNameToClass[champion.name] = champion.class;
        });
        // Preload icons
        preloadImages(championIcons);
      }

      // -- Populate Spell Select --
      if (spellsData.spells && Array.isArray(spellsData.spells)) {
        spellSelect.innerHTML = '<option value="" disabled selected>Select Spell</option>';
        spellsData.spells.forEach(spell => {
          const option = document.createElement('option');
          option.value = spell;
          option.textContent = spell;
          spellSelect.appendChild(option);
        });
      }

      // -- Populate Maps --
      if (mapsData.maps && Array.isArray(mapsData.maps)) {
        availableMaps = mapsData.maps;
        console.log('Maps received from the server:', availableMaps);

        mapSelect.innerHTML = '';
        availableMaps.forEach(map => {
          const option = document.createElement('option');
          option.value = map.id;
          option.textContent = `${map.name} (${map.description})`;
          mapSelect.appendChild(option);
        });
        console.log('Maps loaded into the dropdown.');
      }

      logMessage('Champions, Spells, and Maps loaded successfully.');
    } catch (error) {
      console.error('Error loading champions, spells, or maps:', error);
      logMessage('Error loading champions, spells, or maps: ' + error.message);
    }
  }

  // -------------------------------------------------
  // ADDED (2025-01-07): Ping check for Windows only
  // and reloading data afterward
  // -------------------------------------------------
  /**
   * Checks if the server is available via "ping -n 1 -w 5000" on Windows.
   * If the ping fails, the modal is shown to let the user enter a new server address.
   * If success, load data and then connect.
   */
  function checkServerAvailability() {
    // Only run on Windows
    if (os.platform() !== 'win32') {
      console.log('Server check is only implemented for Windows. Skipping ping...');
      // If not Windows, proceed to load data and connect immediately
      loadInitialData().then(() => {
        connect();
      });
      return;
    }

    const pingCommand = `ping -n 1 -w 5000 ${serverHost}`;
    console.log(`Pinging server: ${serverHost} with command: ${pingCommand}`);

    child_process.exec(pingCommand, async (error, stdout, stderr) => {
      if (error) {
        console.warn('Ping failed or server not reachable within 5 seconds:', error.message);
        // Show modal to let the user enter new IP / Host
        showServerCheckModal();
      } else {
        // If ping successful, load data first, then connect
        console.log('Ping successful. Proceeding to load data and connect...');
        try {
          await loadInitialData();
        } catch (err) {
          console.error('Error loading initial data after ping:', err);
        }
        connect();
      }
    });
  }

  // Show the server-check modal
  function showServerCheckModal() {
    serverCheckModal.style.display = 'block';
  }

  // Hide the server-check modal
  function hideServerCheckModal() {
    serverCheckModal.style.display = 'none';
  }

  // If the user clicks on (x) in the modal
  serverCheckClose.addEventListener('click', () => {
    hideServerCheckModal();
  });

  // If the user clicks on "Cancel" in the modal
  newServerCancelButton.addEventListener('click', () => {
    hideServerCheckModal();
    // Do nothing more
  });

  // If the user clicks on "Save" in the modal
  newServerSaveButton.addEventListener('click', () => {
    const newServerAddress = newServerInput.value.trim();
    if (!newServerAddress) {
      logMessage('Please enter a valid server address.');
      return;
    }
    // Overwrite the serverHost with the new address
    serverHost = newServerAddress;
    hideServerCheckModal();

    // Attempt to ping again -> if success => load data and connect
    checkServerAvailability();
  });

  // -------------------------------------------------
  // Establish WebSocket connection
  // -------------------------------------------------
  async function connect() {
    // If there is no Blowfish key, cancel
    if (!playerData.blowfish_key || playerData.blowfish_key.trim() === '') {
      console.error('No Blowfish key available. Connection aborted.');
      logMessage('No Blowfish key available. Please restart the application.');
      return;
    }

    const wsUrl = `ws://${serverHost}:${webSocketPort}`;
    try {
      console.log(`Attempting to connect to: ${wsUrl}`);
      socket = new WebSocket(wsUrl);

      socket.addEventListener('open', () => {
        console.log('WebSocket connected:', wsUrl);
        statusLine.textContent = `Connected to ${wsUrl}`;
        clearInterval(reconnectInterval);

        // Upon connecting, the client sends its name + Blowfish key
        socket.send(JSON.stringify({
          type: 'register',
          name: playerData.name,
          blowfish_key: playerData.blowfish_key,
        }));
      });

      socket.addEventListener('close', () => {
        console.log('WebSocket disconnected');
        statusLine.textContent = 'Connection disconnected';
        reconnectInterval = setInterval(connect, 5000);
      });

      socket.addEventListener('error', (err) => {
        console.error('WebSocket error:', err);
        statusLine.textContent = 'Connection error';
      });

      // ---------------------------------------
      // Process incoming events here
      // ---------------------------------------
      socket.addEventListener('message', (event) => {
        const data = JSON.parse(event.data);
        console.log('Message received:', data);

        if (data.type === 'playerUpdate') {
          updateTeamDisplay(data.players);
        }

        if (data.type === 'chat') {
          addChatMessage(`${data.sender}: ${data.message}`);
        }

        // gameLaunch from server -> we start the countdown
        if (data.type === 'gameLaunch') {
          if (isAdmin && isGameStarting) {
            console.log('Admin has already started the game, no further action needed.');
            isGameStarting = false;
            logMessage('The game has been started by the admin.');
          } else if (!isGameLaunchedByAdmin) {
            startGameWithCountdown(data.gameConfig);
            isGameLaunchedByAdmin = true;
          }
        }

        // Game Settings were updated by admin
        if (data.type === 'gameSettingsUpdate') {
          logMessage('Game Settings have been updated by the admin.');
        }

        // This event assigns IDs
        if (data.type === 'assignIDs') {
          // assignedIDs: { blowfish_key_xyz: ephemeralId, ... }
          const myKey = playerData.blowfish_key;
          if (data.assignedIDs && data.assignedIDs[myKey]) {
            ephemeralGameId = data.assignedIDs[myKey];
            console.log(`Server has assigned us the ID ${ephemeralGameId}.`);
            logMessage(`Server has assigned us the ID ${ephemeralGameId}.`);

            // If the countdown is already finished, start immediately
            if (countdownFinished) {
              openGame(ephemeralGameId);
            }
          }
        }

        // Admin authentication
        if (data.type === 'adminAuthenticated') {
          console.log(`Admin ${data.playerName} has been authenticated.`);
          isAdmin = true;
          toggleAdminFeatures();
          logMessage('Admin authentication successful.');
        }
      });

    } catch (err) {
      console.error('Error establishing the connection:', err);
    }
  }

  // -------------------------------
  // Displaying chat messages
  // -------------------------------
  function addChatMessage(message) {
    const messageDiv = document.createElement('div');
    messageDiv.textContent = message;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  // -------------------------------
  // Update team display
  // -------------------------------
  function updateTeamDisplay(players) {
    const uniquePlayers = Array.from(new Set(players.map(p => JSON.stringify(p)))).map(p => JSON.parse(p));

    const teamRed = uniquePlayers.filter(p => p.team === 'Red');
    const teamBlue = uniquePlayers.filter(p => p.team === 'Blue');

    // Red Team
    teamRedPlayers.innerHTML = teamRed.map(p =>
        `<div>
        ${p.name} (${p.champion || 'No Champion'} 
          ${p.champion ? `<img src="assets/icons/${p.champion}.png" alt="${p.champion} Icon" class="champion-icon-xs">` : ''}
        )
        <span style="color: ${p.ready ? 'green' : 'gray'};">
          ${p.ready ? '✔️' : '❌'}
        </span>
      </div>`).join('') || 'No players yet';

    // Blue Team
    teamBluePlayers.innerHTML = teamBlue.map(p =>
        `<div>
        ${p.name} (${p.champion || 'No Champion'} 
          ${p.champion ? `<img src="assets/icons/${p.champion}.png" alt="${p.champion} Icon"  class="champion-icon-xs">` : ''}
        )
        <span style="color: ${p.ready ? 'green' : 'gray'};">
          ${p.ready ? '✔️' : '❌'}
        </span>
      </div>`).join('') || 'No players yet';

    // List of all players
    playerList.innerHTML = uniquePlayers.map(p =>
        `<div>
        ${p.name}
      </div>`).join('');
  }

  // -------------------------------
  // Countdown / Game start
  // -------------------------------
  function startGameWithCountdown(gameConfig) {
    console.log('Game will start in 10 seconds...');
    logMessage('Game will start in 10 seconds...');
    startCountdown(10);
  }

  function startCountdown(seconds) {
    let remaining = seconds;
    countdownTimer.textContent = remaining;
    countdownDiv.style.display = 'block';
    countdownFinished = false; // reset each time

    const countdownInterval = setInterval(() => {
      remaining -= 1;
      countdownTimer.textContent = remaining;

      if (remaining <= 0) {
        clearInterval(countdownInterval);
        countdownDiv.style.display = 'none';
        countdownFinished = true;

        // Only start the game if we have an ephemeralGameId
        if (ephemeralGameId) {
          openGame(ephemeralGameId);
        }
      }
    }, 1000);
  }

  // Function to actually open the game
  function openGame(ephemeralId) {
    console.log(`Opening the game after countdown (ID = ${ephemeralId})`);
    logMessage('Launching the game...');

    const gamePath = path.join(gameDirectory, 'League of Legends.exe');
    const serverInfo = `${serverHost} ${gameServerPort} ${playerData.blowfish_key} ${ephemeralId}`;
    const args = ['', '', '', serverInfo]; // Four empty strings and then the server info

    const commandLine = `start "" "${gamePath}" "${args[0]}" "${args[1]}" "${args[2]}" "${args[3]}`;
    console.log('Game Start Command:', commandLine);

    if (!fs.existsSync(gamePath)) {
      console.error(`Game not found: ${gamePath}`);
      logMessage(`Game not found: ${gamePath}`);
      return;
    }

    // Ask the main process to start the game
    ipcRenderer.send('start-game', { commandLine, gameDirectory });
  }

  // Reaction to success/error when starting the game
  ipcRenderer.on('game-start-success', () => {
    console.log('Game started successfully.');
    logMessage('Game started successfully.');
  });

  ipcRenderer.on('game-start-error', (event, errorMessage) => {
    console.error('Error starting the game:', errorMessage);
    logMessage(`Error starting the game: ${errorMessage}`);
  });

  // -------------------------------
  // Buttons & Events
  // -------------------------------

  // Leave team
  leaveButton.addEventListener('click', async () => {
    const name = playerData.name.trim();
    if (!name) {
      logMessage('Please enter a name.');
      return;
    }

    try {
      const response = await fetch(`http://${serverHost}:${httpPort}/leaveTeam`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });

      if (!response.ok) {
        const error = await response.json();
        logMessage(`Error leaving the team: ${error.error}`);
        return;
      }

      logMessage('Team left successfully.');
      const data = await response.json();
      updateTeamDisplay(data.players);
    } catch (error) {
      console.error('Error leaving the team:', error.message);
      logMessage(`Error leaving the team: ${error.message}`);
    }
  });

  // Ready status
  readyButton.addEventListener('click', () => {
    const isReady = !readyButton.classList.contains('ready');
    readyButton.classList.toggle('ready', isReady);
    readyButton.textContent = isReady ? 'Not Ready' : 'Ready';

    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: 'readyToggle',
        name: playerData.name,
        ready: isReady,
      }));
    } else {
      console.error('WebSocket not connected. Could not send ready status.');
      logMessage('Connection to server lost. Please check your connection.');
    }
  });

  // Update champion class
  function updateChampionClass(champion) {
    const championClass = championNameToClass[champion] || '';
    document.getElementById('champion-class').textContent = championClass;
  }

  // Champion selection
  championSelect.addEventListener('change', () => {
    const champion = championSelect.value;
    if (champion && champion.trim() !== '') {
      championIconDisplay.src = `assets/icons/${champion}.png`;
      updateChampionClass(champion);
    } else {
      championIconDisplay.src = 'assets/icons/default-champion.png';
      updateChampionClass('');
    }

    championIconDisplay.onerror = () => {
      console.error(`Champion icon not found: assets/icons/${champion}.png`);
      championIconDisplay.src = 'assets/icons/default-champion.png';
      updateChampionClass('');
    };
    championIconDisplay.style.display = 'inline';

    const spell = spellSelect.value;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: 'updatePlayer',
        name: playerData.name,
        champion,
        spell,
      }));
    } else {
      console.error('WebSocket not connected.');
    }
  });

  // Spell selection
  spellSelect.addEventListener('change', () => {
    const champion = championSelect.value;
    const spell = spellSelect.value;

    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: 'updatePlayer',
        name: playerData.name,
        champion,
        spell,
      }));
    } else {
      console.error('WebSocket not connected.');
    }
  });

  // Chat
  chatSendButton.addEventListener('click', () => {
    const message = chatInput.value.trim();
    if (!message) {
      logMessage('Please enter a message.');
      return;
    }
    const sender = playerData.name.trim();
    if (!sender) {
      logMessage('Please enter a name.');
      return;
    }

    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: 'chat',
        sender,
        message,
      }));
      chatInput.value = '';
    } else {
      console.error('WebSocket not connected. Message could not be sent.');
    }
  });

  // Switch teams
  teamRedButton.addEventListener('click', () => {
    selectTeam('Red');
  });
  teamBlueButton.addEventListener('click', () => {
    selectTeam('Blue');
  });

  async function selectTeam(team) {
    const name = playerData.name.trim();
    if (!name) {
      logMessage('Please enter a name.');
      return;
    }

    try {
      const response = await fetch(`http://${serverHost}:${httpPort}/team`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, team })
      });

      if (!response.ok) {
        throw new Error('Error switching teams.');
      }
      const data = await response.json();
      logMessage(`Switched to Team ${team}.`);
      updateTeamDisplay(data.players);
    } catch (error) {
      console.error('Error switching teams:', error);
      logMessage(`Error switching teams: ${error.message}`);
    }
  }

  // -------------------------------
  // Admin / GameSettings functions
  // -------------------------------

  adminButton.addEventListener('click', async function adminButtonClickHandler() {
    // If not yet authenticated, this is an admin login
    if (!isAdmin) {
      const password = adminPasswordInput.value.trim();
      if (!password) {
        console.error('No password entered');
        logMessage('Please enter the admin password.');
        return;
      }

      try {
        const response = await fetch(`http://${serverHost}:${httpPort}/admin`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password, playerName: playerData.name }),
        });

        if (!response.ok) {
          const error = await response.json();
          console.error('Admin authentication error:', error);
          logMessage(`Admin error: ${error.error}`);
          return;
        }

        console.log('Admin authenticated successfully');
        logMessage('Admin authentication successful.');
        isAdmin = true;
        toggleAdminFeatures();
        adminButton.textContent = 'Start!';
        // Change button handler -> game start
        adminButton.removeEventListener('click', adminButtonClickHandler);
        adminButton.addEventListener('click', startGameHandler);

      } catch (error) {
        console.error('Error with the admin request:', error.message);
        logMessage(`Admin authentication error: ${error.message}`);
      }
    }
  });

  // Admin starts the game
  async function startGameHandler() {
    console.log('Game start initiated by admin');
    try {
      if (!gameServerPort) {
        console.error('Error: gameServerPort is not set.');
        logMessage('Error: gameServerPort is not set.');
        return;
      }

      isGameStarting = true;
      const response = await fetch(`http://${serverHost}:${httpPort}/startGame`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPasswordInput.value.trim() }),
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('Error starting the game:', error);
        logMessage(`Start error: ${error.error}`);
        isGameStarting = false;
        return;
      }

      const data = await response.json();
      logMessage('Game start triggered successfully.');
      console.log('Game start successful.');

      // Countdown is started, ephemeralGameId is expected in assignIDs
      startCountdown(10);
    } catch (error) {
      console.error('Error with the game start request:', error.message);
      logMessage(`Error starting the game: ${error.message}`);
      isGameStarting = false;
    }
  }

  // Show/hide admin features
  function toggleAdminFeatures() {
    if (isAdmin) {
      gamesettingsButton.style.display = 'inline-block';
    } else {
      gamesettingsButton.style.display = 'none';
    }
  }

  // Gamesettings button -> open modal
  gamesettingsButton.addEventListener('click', async () => {
    try {
      const response = await fetch(`http://${serverHost}:${httpPort}/gameSettings`);
      if (!response.ok) {
        throw new Error('Error retrieving the game settings.');
      }
      const data = await response.json();
      const settings = data.gameSettings || {};

      manaCostsEnabledCheckbox.checked =
          settings.MANACOSTS_ENABLED !== undefined ? settings.MANACOSTS_ENABLED : true;
      cooldownsEnabledCheckbox.checked =
          settings.COOLDOWNS_ENABLED !== undefined ? settings.COOLDOWNS_ENABLED : true;
      minionSpawnsEnabledCheckbox.checked =
          settings.MINION_SPAWNS_ENABLED !== undefined ? settings.MINION_SPAWNS_ENABLED : true;
      tickRateInput.value = settings.TICK_RATE || 60;
      mapSelect.value = settings.map || (availableMaps.length > 0 ? availableMaps[0].id : '');

      gamesettingsModal.style.display = 'block';
    } catch (error) {
      console.error('Error retrieving the current game settings:', error);
      logMessage('Error retrieving the current game settings.');
    }
  });

  // Close modal (Button X)
  closeGamesettingsButton.addEventListener('click', () => {
    gamesettingsModal.style.display = 'none';
  });

  // Close modal (Button Cancel)
  cancelGamesettingsButton.addEventListener('click', () => {
    gamesettingsModal.style.display = 'none';
  });

  // Saving game settings
  saveGamesettingsButton.addEventListener('click', async () => {
    const newSettings = {
      MANACOSTS_ENABLED: manaCostsEnabledCheckbox.checked,
      COOLDOWNS_ENABLED: cooldownsEnabledCheckbox.checked,
      MINION_SPAWNS_ENABLED: minionSpawnsEnabledCheckbox.checked,
      TICK_RATE: parseInt(tickRateInput.value, 10),
      map: parseInt(mapSelect.value, 10)
    };

    if (isNaN(newSettings.TICK_RATE) || newSettings.TICK_RATE < 1 || newSettings.TICK_RATE > 100) {
      logMessage('Tick Rate must be a number between 1 and 100.');
      return;
    }

    const selectedMap = availableMaps.find(m => m.id === newSettings.map);
    if (!selectedMap) {
      logMessage('Selected map is invalid.');
      return;
    }

    try {
      const response = await fetch(`http://${serverHost}:${httpPort}/updateGameSettings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: adminPasswordInput.value.trim(),
          ...newSettings
        })
      });

      if (!response.ok) {
        const error = await response.json();
        logMessage(`Error updating game settings: ${error.error}`);
        return;
      }

      const data = await response.json();
      logMessage('Game settings updated successfully.');
      gamesettingsModal.style.display = 'none';
      console.log('Game settings updated:', data.settings);
    } catch (error) {
      console.error('Error updating game settings:', error.message);
      logMessage(`Error updating game settings: ${error.message}`);
    }
  });

  // Close modal if user clicks outside
  window.addEventListener('click', (event) => {
    if (event.target === gamesettingsModal) {
      gamesettingsModal.style.display = 'none';
    }
  });

  // -------------------------------
  // Load configuration and start
  // -------------------------------
  try {
    if (!fs.existsSync(configFilePath)) {
      throw new Error(`client-config.json not found: ${configFilePath}`);
    }

    const configData = fs.readFileSync(configFilePath, 'utf8');
    const config = JSON.parse(configData);

    serverHost = config.serverHost;
    httpPort = config.httpPort;
    webSocketPort = config.webSocketPort;
    gameServerPort = config.gameServerPort;
    gameDirectory = config.gameDirectory;

    console.log('Loaded client-config.json:', config);
    console.log('Server Host:', serverHost);
    console.log('HTTP Port:', httpPort);
    console.log('WebSocket Port:', webSocketPort);
    console.log('Game Server Port:', gameServerPort);
    console.log('Game Directory:', gameDirectory);

    // -----------------------------------------------------
    // Instead of calling connect() or loading data
    // directly here, we first check server availability
    // which will:
    //   1) Ping the server
    //   2) If successful => loadInitialData() => connect()
    //   3) If fails => show modal to let user change server
    // -----------------------------------------------------
    checkServerAvailability();

  } catch (error) {
    console.error('Error loading champions, spells, or maps:', error);
    logMessage('Error loading champions, spells, or maps: ' + error.message);
  }
});

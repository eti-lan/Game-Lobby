// eti GameLobby Server
// server.js

const express = require('express');
const bodyParser = require('body-parser');
const WebSocket = require('ws');
const fs = require('fs');
const cors = require('cors');
const path = require('path');
const { spawn } = require('child_process');

// Paths
const configPath = path.join(__dirname, 'server-config.json');
const runesConfigPath = path.join(__dirname, 'runes.json');
const championsPath = path.join(__dirname, 'champions.json');
const spellsPath = path.join(__dirname, 'spells.json');
const mapsPath = path.join(__dirname, 'maps.json'); // Path to maps.json

// Load configuration
let config;
try {
  const configData = fs.readFileSync(configPath, 'utf8');
  config = JSON.parse(configData);
  console.log("Configuration file loaded successfully.");
  console.log(`GameInfoPath: ${config.gameInfoPath}`);
} catch (error) {
  console.error(`Error loading the configuration file: ${error.message}`);
  process.exit(1);
}

// Load runes
let runesConfig;
try {
  const runesData = fs.readFileSync(runesConfigPath, 'utf8');
  runesConfig = JSON.parse(runesData);
  console.log("Runes configuration loaded successfully.");
} catch (error) {
  console.error(`Error loading runes.json: ${error.message}`);
  process.exit(1);
}

// Load champions
let champions;
try {
  const championsData = fs.readFileSync(championsPath, 'utf8');
  champions = JSON.parse(championsData).champions;
  console.log("Champions loaded successfully.");
} catch (error) {
  console.error(`Error loading champions.json: ${error.message}`);
  process.exit(1);
}

// Load spells
let spells;
try {
  const spellsData = fs.readFileSync(spellsPath, 'utf8');
  spells = JSON.parse(spellsData).spells;
  console.log("Spells loaded successfully.");
} catch (error) {
  console.error(`Error loading spells.json: ${error.message}`);
  process.exit(1);
}

// Load maps
let maps;
try {
  const mapsData = fs.readFileSync(mapsPath, 'utf8');
  maps = JSON.parse(mapsData).maps;
  console.log("Maps loaded successfully.");
} catch (error) {
  console.error(`Error loading maps.json: ${error.message}`);
  process.exit(1);
}

const app = express();
app.use(bodyParser.json());
app.use(cors({ origin: '*' }));

// Lobby data
const lobby = {
  // Players are now ONLY identified by their Blowfish key.
  // IDs are not assigned until the game starts.
  players: [], // { name, champion, spell, team, ready, lastPing, ws, blowfish_key, summoner1, summoner2, rank }
  isGameStarted: false
};

// Logging function
function log(message) {
  console.log(message);
  fs.appendFileSync(config.logFile, `${new Date().toISOString()} - ${message}\n`);
}

// Reset lobby (after the game starts)
function resetLobby() {
  lobby.players.forEach(player => {
    player.team = "-";
    player.ready = false;
  });
  lobby.isGameStarted = false;
  log("Lobby reset after game start.");
  broadcast({ type: 'playerUpdate', players: lobby.players });
}

// Initialize WebSocket server
const wss = new WebSocket.Server({ port: config.webSocketPort });

// Link WebSocket -> Player
const wsToPlayerMap = new Map();

// Create a set of champion names for quick lookup
const championNamesSet = new Set(champions.map(champ => champ.name));

wss.on('connection', (ws, req) => {
  const clientIp = req.socket.remoteAddress;
  log(`New client connected. IP: ${clientIp}`);

  ws.isAlive = true;

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (message) => {
    log(`WebSocket message received: ${message}`);
    try {
      const data = JSON.parse(message);

      // The client MUST have a Blowfish key!
      if (data.type === 'register') {
        if (!data.blowfish_key || typeof data.blowfish_key !== 'string' || data.blowfish_key.trim() === '') {
          ws.send(JSON.stringify({ type: 'error', message: 'No valid Blowfish key provided. Connection refused.' }));
          ws.close();
          return;
        }
        // Name is also required (for display)
        if (!data.name || typeof data.name !== 'string') {
          ws.send(JSON.stringify({ type: 'error', message: 'Invalid or missing player name.' }));
          return;
        }

        // Check if player already exists
        let player = lobby.players.find(p => p.blowfish_key === data.blowfish_key);

        if (!player) {
          // New player
          player = {
            name: data.name,
            champion: "Unknown",
            spell: "SummonerFlash",
            team: "-",
            ready: false,
            lastPing: Date.now(),
            ws: ws,
            blowfish_key: data.blowfish_key,
            summoner1: "SummonerFlash",
            summoner2: "SummonerHeal",
            rank: "UNRANKED"
          };
          lobby.players.push(player);
          log(`New player: ${data.name}, Blowfish key: ${data.blowfish_key}`);
        } else {
          // Player exists -> disconnect the old socket if still active
          if (player.ws && player.ws !== ws) {
            log(`Player ${data.name} has an old connection, terminating it.`);
            player.ws.terminate();
          }
          // Update data
          player.name = data.name;
          player.blowfish_key = data.blowfish_key;
          player.ws = ws;
          player.lastPing = Date.now();
          player.ready = false;
          log(`Player reconnected: ${data.name} (Blowfish key: ${data.blowfish_key})`);
        }

        wsToPlayerMap.set(ws, player);

        // We do NOT send a permanent ID back,
        // just an info that registration was successful:
        ws.send(JSON.stringify({ type: 'system', message: 'Registration successful.' }));
        broadcast({ type: 'playerUpdate', players: lobby.players });
      }

      // Chat
      else if (data.type === 'chat') {
        if (!data.sender || !data.message) {
          ws.send(JSON.stringify({ type: 'error', message: 'Invalid chat format.' }));
          return;
        }
        log(`Chat message from ${data.sender}: ${data.message}`);
        broadcast({ type: 'chat', sender: data.sender, message: data.message });
      }

      // Player update (Champion/Spell)
      else if (data.type === 'updatePlayer') {
        const player = wsToPlayerMap.get(ws);
        if (!player) {
          ws.send(JSON.stringify({ type: 'error', message: 'Player not found or not registered.' }));
          return;
        }

        let updated = false;
        if (data.champion && typeof data.champion === 'string') {
          if (championNamesSet.has(data.champion)) {
            player.champion = data.champion;
            updated = true;
          } else {
            log(`Invalid champion: ${data.champion}`);
            ws.send(JSON.stringify({ type: 'error', message: `Invalid champion: ${data.champion}` }));
          }
        }

        if (data.spell && typeof data.spell === 'string') {
          if (spells.includes(data.spell)) {
            player.spell = data.spell;
            updated = true;
          } else {
            log(`Invalid spell: ${data.spell}`);
            ws.send(JSON.stringify({ type: 'error', message: `Invalid spell: ${data.spell}` }));
          }
        }

        if (updated) {
          log(`Player ${player.name} updated: Champion=${player.champion}, Spell=${player.spell}`);
          broadcast({ type: 'playerUpdate', players: lobby.players });
        }
      }

      // Ready status
      else if (data.type === 'readyToggle') {
        const { name, ready } = data;
        if (typeof ready !== 'boolean' || !name) {
          ws.send(JSON.stringify({ type: 'error', message: 'Invalid readyToggle format.' }));
          return;
        }
        const player = lobby.players.find(p => p.name === name);
        if (!player) {
          ws.send(JSON.stringify({ type: 'error', message: `Player ${name} not found.` }));
          return;
        }
        player.ready = ready;
        log(`Player ${name} sets Ready to ${ready}.`);
        broadcast({ type: 'playerUpdate', players: lobby.players });
      }

      else {
        log(`Unknown message type: ${data.type}`);
        ws.send(JSON.stringify({ type: 'error', message: `Unknown message type: ${data.type}` }));
      }
    } catch (err) {
      log(`Error processing a WebSocket message: ${err.message}`);
      ws.send(JSON.stringify({ type: 'error', message: `Error in message: ${err.message}` }));
    }
  });

  ws.on('close', () => {
    log(`WebSocket connection closed: IP=${clientIp}`);
    const player = wsToPlayerMap.get(ws);
    if (player) {
      log(`Removing player from lobby: Name=${player.name}, Blowfish key=${player.blowfish_key}`);
      lobby.players = lobby.players.filter(p => p.blowfish_key !== player.blowfish_key);
      wsToPlayerMap.delete(ws);
      broadcast({ type: 'playerUpdate', players: lobby.players });
    } else {
      log(`No player found for the closed WebSocket: IP=${clientIp}`);
    }
  });

  ws.on('error', (error) => {
    log(`WebSocket error: ${error.message}`);
  });

  ws.send(JSON.stringify({ type: 'system', message: 'Welcome to the lobby!' }));
});

// Broadcast helper
function broadcast(data) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

// Champions API
app.get('/champions', (req, res) => {
  try {
    res.json({ champions });
  } catch (error) {
    log(`Error sending champions: ${error.message}`);
    res.status(500).json({ error: "Error sending champions." });
  }
});

// Spells API
app.get('/spells', (req, res) => {
  try {
    res.json({ spells });
  } catch (error) {
    log(`Error sending spells: ${error.message}`);
    res.status(500).json({ error: "Error sending spells." });
  }
});

// Maps API
app.get('/maps', (req, res) => {
  try {
    res.json({ maps });
  } catch (error) {
    log(`Error sending maps: ${error.message}`);
    res.status(500).json({ error: "Error sending maps." });
  }
});

// Admin auth
app.post('/admin', (req, res) => {
  const { password, playerName } = req.body;
  if (password !== config.adminPassword) {
    return res.status(403).json({ error: "Invalid password" });
  }
  log(`Admin ${playerName} successfully authenticated.`);
  broadcast({ type: 'adminAuthenticated', playerName });
  res.json({ message: `Admin ${playerName} authenticated` });
});

// Start game
app.post('/startGame', (req, res) => {
  const { password } = req.body;
  if (password !== config.adminPassword) {
    return res.status(403).json({ error: "Invalid password" });
  }

  // Check if all players (at least those in a team) are ready
  if (lobby.players.filter(p => p.team !== "-").some(p => !p.ready)) {
    return res.status(400).json({ error: "Not all team players are ready." });
  }

  // Current game settings
  const gameSettings = config.gameSettings || {
    MANACOSTS_ENABLED: true,
    COOLDOWNS_ENABLED: true,
    MINION_SPAWNS_ENABLED: true,
    TICK_RATE: 60,
    map: 1
  };

  // Only players with team != "-" get an ID
  const teamPlayers = lobby.players.filter(p => p.team !== "-");
  // IDs are assigned here (only for this game)
  let currentId = 1;
  const blowfishToIdMap = {}; // Map of blowfish_key -> ephemeral ID

  // Build the gameInfo structure
  const gameInfo = {
    gameId: Date.now(), // or use a custom counter
    game: {
      map: gameSettings.map,
      gameMode: "CLASSIC",
      mutators: ["", "", "", "", "", "", "", ""]
    },
    gameInfo: {
      TICK_RATE: gameSettings.TICK_RATE,
      FORCE_START_TIMER: 60,
      USE_CACHE: false,
      IS_DAMAGE_TEXT_GLOBAL: false,
      ENABLE_CONTENT_LOADING_LOGS: false,
      SUPRESS_SCRIPT_NOT_FOUND_LOGS: true,
      CHEATS_ENABLED: false,
      MANACOSTS_ENABLED: gameSettings.MANACOSTS_ENABLED,
      COOLDOWNS_ENABLED: gameSettings.COOLDOWNS_ENABLED,
      MINION_SPAWNS_ENABLED: gameSettings.MINION_SPAWNS_ENABLED,
      LOG_IN_PACKETS: false,
      LOG_OUT_PACKETS: false,
      CONTENT_PATH: "../../../gameclient",
      ENDGAME_HTTP_POST_ADDRESS: "",
      scriptAssemblies: ["ScriptsCore", "CBProject-Converted", "Chronobreak-Scripts"]
    },
    players: teamPlayers.map((player) => {
      // Assign ephemeral ID
      const ephemeralId = currentId++;
      blowfishToIdMap[player.blowfish_key] = ephemeralId;

      return {
        playerId: ephemeralId,
        blowfishKey: player.blowfish_key,
        rank: player.rank || "UNRANKED",
        name: player.name,
        champion: player.champion || "Unknown",
        team: player.team || "-",
        skin: 0,
        summoner1: player.summoner1 || "SummonerFlash",
        summoner2: player.summoner2 || "SummonerHeal",
        ribbon: 2,
        icon: 0,
        runes: { ...runesConfig.runes },
        talents: { ...runesConfig.talents }
      };
    })
  };

  // Debug info
  log("Player info before writing GameInfo.json:");
  lobby.players.forEach(player => {
    log(`Name: ${player.name}, Champion: ${player.champion}, Team: ${player.team}`);
  });

  // Write GameInfo.json
  fs.writeFile(config.gameInfoPath, JSON.stringify(gameInfo, null, 2), (err) => {
    if (err) {
      log(`Error writing GameInfo.json: ${err.message}`);
      return res.status(500).json({ error: "Error writing GameInfo.json." });
    }

    log("GameInfo.json written successfully.");

    // Start GameServerConsole.cmd
    const gameServerCmdPath = path.resolve(__dirname, '..', 'gameserver', 'GameServerConsole', 'bin', 'GameServerConsole.cmd');
    const child = spawn('cmd.exe', ['/c', gameServerCmdPath], {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: false,
      cwd: path.dirname(gameServerCmdPath)
    });

    child.stdout.on('data', (data) => {
      console.log(`stdout: ${data}`);
    });

    child.stderr.on('data', (data) => {
      console.error(`stderr: ${data}`);
    });

    child.on('error', (error) => {
      console.log(`Error starting GameServerConsole.cmd: ${error.message}`);
    });

    child.on('close', (code) => {
      console.log(`GameServerConsole.cmd exited with code ${code}.`);
    });

    child.unref();
    log("GameServerConsole.cmd started successfully.");

    // Broadcast that the game has started
    broadcast({
      type: 'gameLaunch',
      gameConfig: {
        gameServer: config.gameServerPath,
        gamePort: config.gameServerPort,
        gameConfig: gameInfo
      }
    });
    log("Game start message sent to all clients.");

    // Also send a message with the assigned IDs
    broadcast({
      type: 'assignIDs',
      assignedIDs: blowfishToIdMap
    });

    res.json({ message: "Game has been started." });
    lobby.isGameStarted = true;

    // Reset lobby after e.g. 20 seconds
    setTimeout(resetLobby, 20000);
  });
});

// API: set player team
app.post('/team', (req, res) => {
  const { name, team } = req.body;
  const player = lobby.players.find(p => p.name === name);
  if (player) {
    player.team = team;
    log(`Player ${name} switched to team ${team}.`);
    broadcast({ type: 'playerUpdate', players: lobby.players });
    res.json({ message: `${name} switched to team ${team}`, players: lobby.players });
  } else {
    res.status(404).json({ error: "Player not found" });
  }
});

// Ready status via HTTP
app.post('/readyToggle', (req, res) => {
  const { name, ready } = req.body;
  if (typeof ready !== 'boolean' || !name) {
    return res.status(400).json({ error: 'Invalid readyToggle format.' });
  }
  const player = lobby.players.find(p => p.name === name);
  if (!player) {
    return res.status(404).json({ error: 'Player not found.' });
  }
  player.ready = ready;
  log(`Player ${name} sets Ready to ${ready}.`);
  broadcast({ type: 'playerUpdate', players: lobby.players });
  res.json({ players: lobby.players });
});

// Leave team
app.post('/leaveTeam', (req, res) => {
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Player name missing.' });
  }
  const player = lobby.players.find(p => p.name === name);
  if (!player) {
    return res.status(404).json({ error: 'Player not found.' });
  }
  player.team = "-";
  broadcast({ type: 'playerUpdate', players: lobby.players });
  log(`Player ${name} has left the team.`);
  res.json({ players: lobby.players });
});

// Provide current game settings
app.get('/gameSettings', (req, res) => {
  try {
    res.json({ gameSettings: config.gameSettings || {} });
  } catch (error) {
    log(`Error sending game settings: ${error.message}`);
    res.status(500).json({ error: "Error sending game settings." });
  }
});

// Update game settings
app.post('/updateGameSettings', (req, res) => {
  const { password, MANACOSTS_ENABLED, COOLDOWNS_ENABLED, MINION_SPAWNS_ENABLED, TICK_RATE, map } = req.body;
  if (password !== config.adminPassword) {
    return res.status(403).json({ error: "Invalid admin password." });
  }

  if (typeof MANACOSTS_ENABLED !== 'boolean' ||
      typeof COOLDOWNS_ENABLED !== 'boolean' ||
      typeof MINION_SPAWNS_ENABLED !== 'boolean' ||
      typeof TICK_RATE !== 'number' ||
      typeof map !== 'number') {
    return res.status(400).json({ error: "Invalid format for game settings." });
  }

  const selectedMap = maps.find(m => m.id === map);
  if (!selectedMap) {
    return res.status(400).json({ error: "Selected map does not exist." });
  }

  // Update settings
  config.gameSettings = {
    MANACOSTS_ENABLED,
    COOLDOWNS_ENABLED,
    MINION_SPAWNS_ENABLED,
    TICK_RATE,
    map
  };

  // Write to file
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    log(`Game settings updated by admin: ${JSON.stringify(config.gameSettings)}`);
  } catch (error) {
    log(`Error saving game settings: ${error.message}`);
    return res.status(500).json({ error: "Error saving game settings." });
  }

  // Broadcast
  broadcast({ type: 'gameSettingsUpdate', settings: config.gameSettings });
  res.json({ message: "Game settings updated successfully.", settings: config.gameSettings });
});

// Heartbeat interval to disconnect inactive clients
const HEARTBEAT_INTERVAL = 15000;
const heartbeatInterval = setInterval(() => {
  wss.clients.forEach(ws => {
    if (!ws.isAlive) {
      const player = wsToPlayerMap.get(ws);
      const name = player ? player.name : 'Unknown';
      log(`Disconnecting inactive client: Name=${name}`);
      ws.terminate();
      if (player) {
        lobby.players = lobby.players.filter(p => p.blowfish_key !== player.blowfish_key);
        wsToPlayerMap.delete(ws);
        broadcast({ type: 'playerUpdate', players: lobby.players });
      }
      return;
    }
    ws.isAlive = false;
    ws.ping(() => {});
  });
}, HEARTBEAT_INTERVAL);

// Clean up on server shutdown
process.on('SIGINT', () => {
  clearInterval(heartbeatInterval);
  wss.close(() => {
    log('WebSocket server closed.');
    process.exit(0);
  });
});

// Start HTTP server
app.listen(config.httpPort, () => log(`HTTP server running on port ${config.httpPort}`));

// The WebSocket server is running (initialized above)
log(`WebSocket server running on port ${config.webSocketPort}`);

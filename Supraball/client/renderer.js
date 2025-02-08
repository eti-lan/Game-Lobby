const { ipcRenderer } = require('electron');
const dns = require('dns');

const connectButton = document.getElementById('connectButton');
const serverIPInput = document.getElementById('serverIP');
const trainingButton = document.getElementById('trainingButton');

dns.lookup('supraball.servers.lan', (err, address) => {
  if (!err && address) {
    serverIPInput.value = address;
    serverIPInput.disabled = true;
    const info = document.createElement('div');
    info.style.textAlign = 'center';
    info.style.marginBottom = '10px';
    info.style.color = '#0078D7';
    info.textContent = `Server "supraball.servers.lan" found: ${address}`;
    serverIPInput.parentNode.insertBefore(info, serverIPInput);
  }
});

connectButton.addEventListener('click', () => {
  const serverIP = serverIPInput.value.trim();
  if (!serverIP) {
    alert("Please enter a Server IP or Hostname.");
    return;
  }
  ipcRenderer.send('connect-server', serverIP);
});

trainingButton.addEventListener('click', () => {
  const trainingMap = document.querySelector('input[name="trainingMap"]:checked').value;
  if (trainingMap === "combined-training") {
    ipcRenderer.send('start-combined-training');
  } else {
    ipcRenderer.send('start-training', trainingMap);
  }
});

import './style.css';
import { Net } from './net.js';
import { Game } from './game.js';
import { CHARACTERS, charById, BOT_NAMES } from './characters.js';
import { loadAssets } from './entities.js';
import { audio } from './audio.js';

const $ = (id) => document.getElementById(id);
const LENGTHS = { corta: 4200, normal: 7000, epica: 11000 };
const show = (id) => { for (const s of ['menu', 'lobby']) $(s).classList.toggle('hidden', s !== id); };

let net = null, game = null;
let lobby = { players: [], settings: { bots: 3, length: 'normal' } };
let myName = localStorage.getItem('sbr-name') || '';
let myChar = localStorage.getItem('sbr-char') || 'gyro';

// ------------------------------------------------------------------ menú principal
$('name').value = myName;
const getName = () => { myName = ($('name').value.trim() || 'Jinete ' + Math.floor(Math.random() * 900 + 100)).slice(0, 16); localStorage.setItem('sbr-name', myName); return myName; };

function setStatus(msg, err) { const el = $('menu-status'); el.textContent = msg; el.classList.toggle('err', !!err); }

$('btn-solo').onclick = async () => {
  audio.init(); getName();
  net = new Net(); await net.startOffline();
  lobby = { players: [{ id: net.myId, name: myName, char: myChar }], settings: { bots: 5, length: 'normal' }, offline: true };
  enterLobby();
};
$('btn-host').onclick = async () => {
  audio.init(); getName();
  setStatus('Creando sala...');
  net = new Net();
  try {
    const code = await net.host();
    lobby = { players: [{ id: net.myId, name: myName, char: myChar }], settings: { bots: 2, length: 'normal' } };
    setupHostHandlers();
    enterLobby(code);
    setStatus('');
  } catch (e) { setStatus('No se pudo crear la sala: ' + (e.type || e.message || e), true); }
};
$('btn-join').onclick = async () => {
  audio.init(); getName();
  const code = $('code').value.trim().toUpperCase();
  if (code.length < 4) { setStatus('Escribe el código de la sala', true); return; }
  setStatus('Conectando con ' + code + '...');
  net = new Net();
  try {
    await net.join(code);
    setupClientHandlers();
    net.broadcast({ t: 'hello', name: myName, char: myChar });
    enterLobby(code);
    setStatus('');
  } catch (e) { setStatus('No se pudo conectar. ¿Código correcto? (' + (e.type || e.message || e) + ')', true); net.close(); }
};
$('code').addEventListener('keydown', e => { if (e.key === 'Enter') $('btn-join').click(); });

// ------------------------------------------------------------------ red del lobby
function setupHostHandlers() {
  net.on('hello', (m, from) => {
    if (game) { net.sendTo(from, { t: 'busy' }); return; }
    lobby.players = lobby.players.filter(p => p.id !== from);
    lobby.players.push({ id: from, name: String(m.name).slice(0, 16), char: m.char });
    pushLobby();
  });
  net.on('char', (m, from) => { const p = lobby.players.find(p => p.id === from); if (p) { p.char = m.char; pushLobby(); } });
  net.on('leave', (m) => { lobby.players = lobby.players.filter(p => p.id !== m.id); pushLobby(); });
}
function setupClientHandlers() {
  net.on('lobby', (m) => { lobby = m.lobby; renderLobby(); });
  net.on('start', (m) => startGame(m));
  net.on('lobbyback', () => backToLobby());
  net.on('busy', () => { alert('La carrera ya ha empezado en esa sala. Espera a que termine.'); location.reload(); });
  net.on('hostlost', () => { if (!game) { alert('El anfitrión cerró la sala.'); location.reload(); } });
}
function pushLobby() { if (net.offline) { renderLobby(); return; } net.broadcast({ t: 'lobby', lobby }); renderLobby(); }

// ------------------------------------------------------------------ lobby
function enterLobby(code) {
  show('lobby');
  $('lobby-code').textContent = code || 'SOLO';
  $('share').classList.toggle('hidden', !code);
  $('host-controls').classList.toggle('hidden', !net.isHost);
  $('wait-host').classList.toggle('hidden', net.isHost);
  renderCharGrid();
  renderLobby();
}

function renderCharGrid() {
  $('chars').innerHTML = CHARACTERS.map(c => `
    <button class="card ${c.id === myChar ? 'sel' : ''}" data-id="${c.id}" style="--c:${c.color}">
      <div class="portrait"><canvas width="160" height="160" data-portrait="${c.id}"></canvas></div>
      <div class="cn">${c.name}</div>
      <div class="cs">「${c.stand}」</div>
      <div class="ch">🐎 ${c.horse}</div>
    </button>`).join('');
  $('chars').querySelectorAll('.card').forEach(b => b.onclick = () => {
    myChar = b.dataset.id; localStorage.setItem('sbr-char', myChar);
    if (net.isHost) { const me = lobby.players.find(p => p.id === net.myId); if (me) me.char = myChar; pushLobby(); }
    else net.broadcast({ t: 'char', char: myChar });
    renderCharGrid(); renderLobby();
  });
  document.querySelectorAll('[data-portrait]').forEach(cv => drawPortrait(cv, charById(cv.dataset.portrait)));
  const c = charById(myChar);
  $('char-info').innerHTML = `<h3 style="--c:${c.color}">${c.name}</h3><div class="stand">Stand: 「${c.stand}」</div>
    <div class="ab"><b>${c.ability.name}</b> <span>(E)</span><p>${c.ability.desc}</p></div>
    ${stat('Velocidad', c.stats.speed)}${stat('Aceleración', c.stats.accel)}${stat('Estamina', c.stats.stamina)}${stat('Manejo', c.stats.handling)}`;
}
const stat = (n, v) => `<div class="stat"><span>${n}</span><i style="width:${Math.round((v - 0.8) / 0.45 * 100)}%"></i></div>`;

// retrato estilo manga dibujado a mano en canvas
function drawPortrait(cv, c) {
  const x = cv.getContext('2d'), W = cv.width, H = cv.height, L = c.look;
  const hex = (n) => '#' + n.toString(16).padStart(6, '0');
  const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, c.color); g.addColorStop(1, '#1a0630');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.save(); x.globalAlpha = 0.25; x.strokeStyle = '#fff';
  for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; x.beginPath(); x.moveTo(W / 2, H / 2); x.lineTo(W / 2 + Math.cos(a) * W, H / 2 + Math.sin(a) * W); x.lineWidth = i % 2 ? 2 : 6; x.stroke(); }
  x.restore();
  x.fillStyle = hex(L.shirt); x.beginPath(); x.ellipse(W / 2, H + 10, 62, 60, 0, 0, Math.PI * 2); x.fill();
  x.fillStyle = hex(L.skin); x.beginPath(); x.ellipse(W / 2, H * 0.52, 34, 42, 0, 0, Math.PI * 2); x.fill();
  x.lineWidth = 4; x.strokeStyle = '#000'; x.stroke();
  x.fillStyle = hex(L.hair); x.beginPath(); x.ellipse(W / 2, H * 0.4, 38, 24, 0, Math.PI, 0); x.fill();
  // ojos y labios marcados
  x.fillStyle = '#000'; x.fillRect(W / 2 - 20, H * 0.5, 12, 4); x.fillRect(W / 2 + 8, H * 0.5, 12, 4);
  x.fillStyle = c.id === 'valentine' || c.id === 'diego' ? '#a03070' : '#6a2a2a'; x.fillRect(W / 2 - 8, H * 0.66, 16, 4);
  x.fillStyle = hex(L.hatColor);
  if (L.hat === 'wide') { x.fillRect(W / 2 - 58, H * 0.3, 116, 9); x.fillRect(W / 2 - 28, H * 0.12, 56, 30); x.fillStyle = hex(L.accent); x.fillRect(W / 2 - 26, H * 0.26, 52, 6); }
  else if (L.hat === 'beanie' || L.hat === 'cap' || L.hat === 'helmet' || L.hat === 'hood') { x.beginPath(); x.ellipse(W / 2, H * 0.36, 40, 30, 0, Math.PI, 0); x.fill(); x.fillStyle = hex(L.accent); x.font = '22px Bangers, Impact'; x.textAlign = 'center'; x.fillText(L.hat === 'helmet' ? 'D' : L.hat === 'beanie' ? '★' : L.hat === 'hood' ? '✝' : '', W / 2, H * 0.32); if (L.hat === 'cap') x.fillRect(W / 2 - 4, H * 0.34, 46, 6); }
  else if (L.hat === 'curls') { for (let i = 0; i < 9; i++) { x.beginPath(); x.arc(W / 2 - 40 + i * 10, H * 0.34 + Math.sin(i) * 6, 10, 0, Math.PI * 2); x.fill(); } }
  else if (L.hat === 'feather') { x.fillStyle = '#111'; x.fillRect(W / 2 - 40, H * 0.36, 14, 60); x.fillRect(W / 2 + 26, H * 0.36, 14, 60); x.fillStyle = '#fff'; x.beginPath(); x.moveTo(W / 2 + 20, H * 0.32); x.lineTo(W / 2 + 34, H * 0.05); x.lineTo(W / 2 + 40, H * 0.32); x.fill(); }
  x.font = '30px "Dela Gothic One", Impact'; x.fillStyle = 'rgba(200,107,255,0.9)'; x.textAlign = 'left'; x.fillText('ゴ', 8, 34); x.fillText('ゴ', 120, 150);
}

function renderLobby() {
  const isHost = net && net.isHost;
  const s = lobby.settings;
  $('players').innerHTML = lobby.players.map(p => {
    const c = charById(p.char);
    return `<li style="--c:${c.color}"><b>${p.name}</b><span>${c.name}</span>${p.id === (net && net.myId) ? '<em>tú</em>' : ''}</li>`;
  }).join('') + (s.bots ? `<li class="bots">+ ${s.bots} bot${s.bots > 1 ? 's' : ''}</li>` : '');
  $('bots').value = s.bots; $('bots-val').textContent = s.bots;
  $('length').value = s.length;
  $('settings-view').textContent = `Bots: ${s.bots} · Recorrido: ${s.length}`;
  $('bots').disabled = !isHost; $('length').disabled = !isHost;
}
$('bots').oninput = () => { lobby.settings.bots = +$('bots').value; pushLobby(); };
$('length').onchange = () => { lobby.settings.length = $('length').value; pushLobby(); };
$('copy').onclick = () => {
  const url = location.origin + location.pathname + '#' + $('lobby-code').textContent;
  navigator.clipboard?.writeText(url); $('copy').textContent = '¡Copiado!'; setTimeout(() => $('copy').textContent = 'Copiar enlace', 1500);
};
$('btn-leave').onclick = () => { net && net.close(); location.hash = ''; location.reload(); };

$('btn-start').onclick = () => {
  if (!net.isHost) return;
  const seed = Math.floor(Math.random() * 1e9);
  const players = lobby.players.map(p => ({ id: p.id, name: p.name, char: p.char }));
  const used = new Set(players.map(p => p.char));
  const names = BOT_NAMES.slice().sort(() => Math.random() - 0.5);
  for (let i = 0; i < lobby.settings.bots; i++) {
    const free = CHARACTERS.filter(c => !used.has(c.id));
    const c = (free.length ? free : CHARACTERS)[Math.floor(Math.random() * (free.length || CHARACTERS.length))];
    used.add(c.id);
    players.push({ id: 'bot-' + i, name: names[i % names.length], char: c.id, bot: true, skill: 0.92 + Math.random() * 0.09 });
  }
  // mezclamos la parrilla de salida
  players.sort(() => Math.random() - 0.5);
  const msg = { t: 'start', seed, length: LENGTHS[lobby.settings.length] || 7000, players };
  net.broadcast(msg);
  startGame(msg);
};

function startGame(m) {
  audio.init();
  $('lobby').classList.add('hidden');
  $('loading').classList.remove('hidden');
  setTimeout(() => {
    if (game) game.destroy();
    game = new Game(net, { seed: m.seed, length: m.length, players: m.players, myId: net.myId });
    $('loading').classList.add('hidden');
  }, 50);
}
function backToLobby() {
  if (game) { game.destroy(); game = null; }
  if (!net.offline) { if (net.isHost) setupHostHandlers(); else setupClientHandlers(); }
  enterLobby(net.offline ? null : net.code);
}
$('btn-again').onclick = () => { if (!net.isHost) return; net.broadcast({ t: 'lobbyback' }); backToLobby(); };
$('btn-exit').onclick = () => { net && net.close(); location.hash = ''; location.reload(); };
$('btn-quit').onclick = () => { net && net.close(); location.hash = ''; location.reload(); };
$('btn-resume').onclick = () => $('pause').classList.add('hidden');
$('btn-mute').onclick = () => { audio.init(); audio.setMuted(!audio.muted); $('btn-mute').textContent = audio.muted ? '🔇' : '🔊'; };

// ------------------------------------------------------------------ arranque
(async () => {
  $('menu-status').textContent = 'Cargando caballos...';
  await loadAssets();
  $('menu-status').textContent = '';
  $('main-buttons').classList.remove('disabled');
  const hashCode = location.hash.replace('#', '').trim();
  if (hashCode.length >= 4) { $('code').value = hashCode.toUpperCase(); setStatus('Pulsa "Unirse" para entrar en la sala ' + hashCode.toUpperCase()); }
})();

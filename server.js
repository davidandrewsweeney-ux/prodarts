/**
 * ProDarts — WebSocket Server
 * Handles real-time multiplayer room sync.
 * Each room stores game state; all clients in a room
 * receive every state update instantly via WS broadcast.
 */

const express = require('express');
const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// ── In-memory room store ────────────────────────────────
// rooms[code] = { state: {...}, clients: Set<ws> }
const rooms = new Map();

// Clean up rooms older than 4 hours
setInterval(() => {
  const cutoff = Date.now() - 4 * 60 * 60 * 1000;
  for (const [code, room] of rooms) {
    if (room.createdAt < cutoff && room.clients.size === 0) {
      rooms.delete(code);
    }
  }
}, 30 * 60 * 1000);

// ── Static files ────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ── REST: create room ───────────────────────────────────
app.post('/api/room/create', (req, res) => {
  const code = genCode();
  const { mode, players } = req.body;
  rooms.set(code, {
    code,
    createdAt: Date.now(),
    state: {
      mode: mode || '501',
      players: players || [],
      cur: 0,
      round: 1,
      history: [],
      status: 'lobby'
    },
    clients: new Set()
  });
  res.json({ code });
});

// ── REST: get room state ────────────────────────────────
app.get('/api/room/:code', (req, res) => {
  const room = rooms.get(req.params.code.toUpperCase());
  if (!room) return res.status(404).json({ error: 'Room not found' });
  res.json({ code: room.code, state: room.state });
});

// ── REST: health check ──────────────────────────────────
app.get('/api/health', (_, res) => res.json({ ok: true, rooms: rooms.size }));

// ── Catch-all: serve index.html ─────────────────────────
app.get('*', (_, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── WebSocket ───────────────────────────────────────────
wss.on('connection', (ws) => {
  ws.roomCode = null;
  ws.playerName = null;
  ws.isAlive = true;

  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {

      case 'join': {
        const code = (msg.code || '').toUpperCase();
        let room = rooms.get(code);

        if (!room) {
          // Auto-create room if joining with a code that doesn't exist yet
          room = {
            code,
            createdAt: Date.now(),
            state: {
              mode: msg.mode || '501',
              players: [],
              cur: 0, round: 1, history: [],
              status: 'lobby'
            },
            clients: new Set()
          };
          rooms.set(code, room);
        }

        ws.roomCode = code;
        ws.playerName = msg.name || 'Guest';
        room.clients.add(ws);

        // Add player to state if not already in
        const alreadyIn = room.state.players.some(p => p.name === ws.playerName);
        if (!alreadyIn) {
          const startScore = parseInt(room.state.mode) || 501;
          room.state.players.push({
            name: ws.playerName,
            score: startScore,
            legs: 0,
            atcTarget: 1,
            atcHits: Array(22).fill(false),
            totalScore: 0,
            turnCount: 0,
            highTurn: 0
          });
        }

        // Send current state to joining client
        send(ws, { type: 'state', state: room.state });

        // Broadcast player joined to everyone else
        broadcast(room, { type: 'player_joined', name: ws.playerName, players: room.state.players }, ws);
        break;
      }

      case 'start': {
        const room = getRoom(ws);
        if (!room) break;
        room.state.status = 'playing';
        if (msg.mode) room.state.mode = msg.mode;
        if (msg.players) room.state.players = msg.players;
        room.state.cur = 0;
        room.state.round = 1;
        room.state.history = [];
        broadcast(room, { type: 'start', state: room.state });
        break;
      }

      case 'state_update': {
        const room = getRoom(ws);
        if (!room) break;
        // Merge updated fields
        Object.assign(room.state, msg.state);
        broadcast(room, { type: 'state', state: room.state }, ws);
        break;
      }

      case 'ping':
        send(ws, { type: 'pong' });
        break;

      case 'webrtc_offer': {
        const room = getRoom(ws);
        if (!room) break;
        const target = [...room.clients].find(c => c.playerName === msg.to);
        if (target) send(target, { type: 'webrtc_offer', from: ws.playerName, offer: msg.offer });
        break;
      }
      case 'webrtc_answer': {
        const room = getRoom(ws);
        if (!room) break;
        const target = [...room.clients].find(c => c.playerName === msg.to);
        if (target) send(target, { type: 'webrtc_answer', from: ws.playerName, answer: msg.answer });
        break;
      }
      case 'webrtc_ice': {
        const room = getRoom(ws);
        if (!room) break;
        const target = [...room.clients].find(c => c.playerName === msg.to);
        if (target) send(target, { type: 'webrtc_ice', from: ws.playerName, candidate: msg.candidate });
        break;
      }
    }
  });

  ws.on('close', () => {
    const room = rooms.get(ws.roomCode);
    if (room) {
      room.clients.delete(ws);
      broadcast(room, { type: 'player_left', name: ws.playerName });
    }
  });

  ws.on('error', () => {});
});

// Heartbeat — detect stale connections
setInterval(() => {
  wss.clients.forEach(ws => {
    if (!ws.isAlive) { ws.terminate(); return; }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

// ── Helpers ─────────────────────────────────────────────
function send(ws, msg) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function broadcast(room, msg, except = null) {
  const data = JSON.stringify(msg);
  for (const client of room.clients) {
    if (client !== except && client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

function getRoom(ws) {
  return ws.roomCode ? rooms.get(ws.roomCode) : null;
}

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(code));
  return code;
}

// ── Start ────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`ProDarts server running on port ${PORT}`);
});

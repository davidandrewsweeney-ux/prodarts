# ProDarts — AI Camera Darts Scorer

A luxury web app for darts scoring with AI camera detection and real-time multiplayer.

## Features
- **AI Camera Scoring** — point your phone at the board, AI detects where darts landed
- **Real Multiplayer** — WebSocket rooms, play from any device anywhere in the world
- **501 / 301 / Around the Clock** — all major game modes
- **Checkout Strategy** — full 170-dart checkout table with live suggestions
- **Luxury Design** — dark obsidian + champagne gold

---

## Deploy in 5 minutes (free)

### Option A — Render (recommended, free tier)
1. Push this folder to a GitHub repo
2. Go to [render.com](https://render.com) → New → Web Service
3. Connect your GitHub repo
4. Render auto-detects the config from `render.yaml`
5. Your app is live at `https://prodarts-xxxx.onrender.com`

### Option B — Railway
1. Install Railway CLI: `npm install -g @railway/cli`
2. `railway login`
3. `railway init` inside this folder
4. `railway up`
5. Live in ~60 seconds

### Option C — Run locally
```bash
npm install
node server.js
# Open http://localhost:3000
```

---

## How multiplayer works
1. Host opens the app → enables camera → sets up players → turns on Online Multiplayer → Start Game
2. App creates a room and shows a 6-character room code + shareable link
3. Copy the link and send to friends
4. Friends open the link → enter their name → join the room
5. Host sees players appear in the lobby → taps Start
6. All devices sync in real-time via WebSocket

---

## Camera AI scoring
1. Enable camera on the home screen (requires HTTPS — works on Render/Railway automatically)
2. Start a game → camera view opens full-screen
3. Throw your 3 darts
4. Tap **SCAN BOARD** — Claude Vision AI analyses the image
5. Detected scores auto-fill — verify and tap **CONFIRM**
6. Or tap **✏️ Manual** to enter scores yourself

---

## File structure
```
prodarts/
├── server.js          Express + WebSocket server
├── package.json
├── render.yaml        Render deployment config
└── public/
    └── index.html     Full app (HTML + CSS + JS)
```

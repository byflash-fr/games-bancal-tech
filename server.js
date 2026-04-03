const express  = require('express');
const http      = require('http');
const { Server }= require('socket.io');
const path      = require('path');
const gameLogic = require('./gameLogic');
const os        = require('os');
const qrcode    = require('qrcode');

const { PLAYER_DEFAULTS } = gameLogic;

// -----------------------------------------------------------
// IP Detection
// -----------------------------------------------------------
function getLocalIP() {
    const ifaces = os.networkInterfaces();
    for(const name of Object.keys(ifaces)) {
        const n = name.toLowerCase();
        if(n.includes('virtual')||n.includes('vnic')||n.includes('wsl')||n.includes('vethernet')) continue;
        for(const iface of ifaces[name]) {
            if(iface.family==='IPv4' && !iface.internal) return iface.address;
        }
    }
    for(const name of Object.keys(ifaces)) {
        for(const iface of ifaces[name]) {
            if(iface.family==='IPv4' && !iface.internal) return iface.address;
        }
    }
    return 'localhost';
}

const app    = express();
const server = http.createServer(app);
const io     = new Server(server);

const PORT     = process.env.PORT || 3000;
const LOCAL_IP = getLocalIP();
const JOIN_URL = `http://${LOCAL_IP}:${PORT}/mobile.html`;

app.use(express.static(path.join(__dirname, 'public')));

// -----------------------------------------------------------
// Game State
// -----------------------------------------------------------
const gameState = {
    status:       'lobby',   // lobby | skinReveal | playing | victory | defeat
    timeLeft:     480,
    players:      {},
    joinUrl:      JOIN_URL,
    qrCodeDataUrl:'',
    level:        gameLogic.generateLevel(2),
    questProgress:0
};

qrcode.toDataURL(JOIN_URL, { margin:2, scale:6, color:{ dark:'#000000', light:'#ffffff' } }, (err, url) => {
    if(!err) gameState.qrCodeDataUrl = url;
});

// -----------------------------------------------------------
// Game timer (1 s tick)
// -----------------------------------------------------------
setInterval(() => {
    if(gameState.status === 'playing') {
        gameState.timeLeft--;
        if(gameState.timeLeft <= 0) {
            gameState.status = 'defeat';
            io.emit('stateUpdate', gameState);
        }
    }
}, 1000);

// -----------------------------------------------------------
// Physics / logic tick (60 fps)
// -----------------------------------------------------------
const TICK_RATE = 1000 / 60;

setInterval(() => {
    if(gameState.status !== 'playing') return;

    for(const id in gameState.players) {
        const p = gameState.players[id];
        if(p.vx !== 0 || p.vy !== 0) gameLogic.applyPhysics(p, gameState.level);
        if(p.actionBlink > 0) p.actionBlink--;
    }

    gameLogic.updateTriggers(gameState.players, gameState.level);
    gameState.questProgress = gameLogic.getQuestProgress(gameState.level);

    if(gameLogic.checkWinCondition(gameState.players, gameState.level)) {
        gameState.status = 'victory';
    }

    io.emit('stateUpdate', gameState);
}, TICK_RATE);

// -----------------------------------------------------------
// Socket.io
// -----------------------------------------------------------
io.on('connection', socket => {
    console.log(`Connected: ${socket.id}`);

    // ----- Register -----
    socket.on('register', role => {
        if(role === 'player') {
            const pCount = Object.keys(gameState.players).length;
            const shape  = PLAYER_DEFAULTS.SHAPES[pCount % PLAYER_DEFAULTS.SHAPES.length];
            const color  = PLAYER_DEFAULTS.COLORS[pCount % PLAYER_DEFAULTS.COLORS.length];
            const hat    = PLAYER_DEFAULTS.HATS  [pCount % PLAYER_DEFAULTS.HATS.length];

            // Spawn players spread across top area of map
            const cols = 5;
            const col  = pCount % cols;
            const row  = Math.floor(pCount / cols);

            gameState.players[socket.id] = {
                id:          socket.id,
                name:        `Joueur ${pCount + 1}`,
                number:      pCount + 1,
                x:           150 + col * 120,
                y:           150 + row * 120,
                vx:          0,
                vy:          0,
                actionBlink: 0,
                color,
                shape,
                hat
            };

            // Tell this player their own ID + skin
            socket.emit('yourId', {
                id:     socket.id,
                name:   gameState.players[socket.id].name,
                number: gameState.players[socket.id].number,
                color,
                shape,
                hat
            });

            io.emit('stateUpdate', gameState);
        }
    });

    // ----- Start Game -----
    socket.on('startGame', () => {
        if(['lobby','defeat','victory'].includes(gameState.status)) {
            const pCount = Object.keys(gameState.players).length || 2;
            gameState.level     = gameLogic.generateLevel(pCount);
            gameState.timeLeft  = 480;
            gameState.status    = 'skinReveal';
            gameState.questProgress = 0;
            io.emit('stateUpdate', gameState);

            // Auto-transition to playing after skin reveal
            setTimeout(() => {
                if(gameState.status === 'skinReveal') {
                    gameState.status = 'playing';
                    io.emit('stateUpdate', gameState);
                }
            }, 5000); // 5 seconds to show skins
        }
    });

    // ----- Player Input -----
    socket.on('input', data => {
        const player = gameState.players[socket.id];
        if(!player) return;

        if(data.type === 'move') {
            player.vx = data.dx;
            player.vy = data.dy;
        } else if(data.type === 'action') {
            if(data.button === 'B') player.actionBlink = 20;
        }
    });

    // ----- Riddle Answer -----
    socket.on('riddleAnswer', data => {
        if(gameState.status !== 'playing') return;
        const player = gameState.players[socket.id];
        if(!player || !gameState.level) return;

        for(let b of gameState.level.buttons) {
            if(!b.isRiddle || b.riddleAnswered) continue;
            const dx = player.x - b.x, dy = player.y - b.y;
            if(Math.sqrt(dx*dx + dy*dy) < b.r + 60) {
                if(data.answer === b.riddleAnswer) {
                    b.riddleAnswered = true;
                    b.pressed = true;
                    io.emit('riddleResult', { correct: true,  playerId: socket.id });
                } else {
                    io.emit('riddleResult', { correct: false, playerId: socket.id });
                }
                break;
            }
        }
    });

    // ----- Disconnect -----
    socket.on('disconnect', () => {
        console.log(`Disconnected: ${socket.id}`);
        if(gameState.players[socket.id]) {
            delete gameState.players[socket.id];
            io.emit('stateUpdate', gameState);
        }
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🎮 Bancal Server → http://localhost:${PORT}`);
    console.log(`📱 Mobile join  → ${JOIN_URL}`);
});

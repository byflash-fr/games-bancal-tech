const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const gameLogic = require('./gameLogic');
const os = require('os');
const qrcode = require('qrcode');

function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        let n = name.toLowerCase();
        if (n.includes('virtual') || n.includes('vnic') || n.includes('wsl') || n.includes('vethernet')) continue;
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) return iface.address;
        }
    }
    return 'localhost';
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" }, transports: ['websocket'] });

const DEFAULT_PORT = parseInt(process.env.PORT, 10) || 3000;
const BASE_URL = `http://games.bancal.tech`;

app.use(express.static(path.join(__dirname, 'public')));
app.get('/:code([a-zA-Z0-9]{4})', (req, res) => res.redirect(`/?code=${req.params.code.toUpperCase()}`));

const games = {};
const disconnectTimeouts = {};

function generateGameCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code;
    do {
        code = '';
        for (let i = 0; i < 4; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    } while (games[code]);
    return code;
}

function normalizePseudo(rawPseudo, fallback) {
    if (typeof rawPseudo !== 'string') return fallback;
    return rawPseudo.trim().slice(0, 15) || fallback;
}

// ── COMPRESSION RÉSEAU (Maintient la compatibilité client) ────────────────

function buildCompressedPlayers(playersById) {
    const res = {};
    for (const id in playersById) {
        const p = playersById[id];
        // Garde 10 éléments pour la compatibilité avec decompressPlayers() du client
        res[id] = [
            Math.round(p.x * 10) / 10,  // 0
            Math.round(p.y * 10) / 10,  // 1
            Math.round((p.vx || 0) * 10) / 10, // 2
            Math.round((p.vy || 0) * 10) / 10, // 3
            p.hp,                        // 4
            p.isDead ? 1 : 0,            // 5
            Math.ceil(p.invuln || 0),    // 6
            p.actionBlink || 0,          // 7
            p.color,                     // 8
            p.pseudo                     // 9
        ];
    }
    return res;
}

function buildHostPayload(game, full = false) {
    return {
        status: game.status,
        timeLeft: game.timeLeft,
        countdown: game.countdown,
        players: buildCompressedPlayers(game.players),
        level: (full || game.forceFull) ? game.level : {
            buttons: game.level?.buttons,
            doors: game.level?.doors,
            coins: game.level?.coins,
            hearts: game.level?.hearts,
            traps: game.level?.traps,
            quests: game.level?.quests,
            exit: game.level?.exit
        },
        _compressed: true
    };
}

function emitStateUpdate(gameCode, full = false) {
    const game = games[gameCode];
    if (!game) return;
    const payload = buildHostPayload(game, full);
    if (game.hostSocketId) io.to(game.hostSocketId).emit('stateUpdate', payload);
    
    // Pour les mobiles, on garde un format simple
    for (const id in game.players) {
        const p = game.players[id];
        io.to(id).emit('stateUpdate', { status: game.status, timeLeft: game.timeLeft, countdown: game.countdown, hp: p.hp, isDead: p.isDead });
    }
    game.forceFull = false;
}

// ── SOCKET HANDLERS ────────────────────────────────────────

io.on('connection', (socket) => {
    socket.on('createGame', (data, callback) => {
        const code = generateGameCode();
        const hostPseudo = normalizePseudo(data?.pseudo, 'Le Chef');
        games[code] = {
            code, hostName: hostPseudo, hostSocketId: socket.id,
            status: 'lobby', timeLeft: 300, players: {}, joinUrl: `${BASE_URL}/${code}`,
            level: gameLogic.generateLevel(2), netDirty: true, tickAcc: 0
        };
        qrcode.toDataURL(games[code].joinUrl, { margin: 2, scale: 6 }, (err, url) => {
            if (!err) { games[code].qrCodeDataUrl = url; emitStateUpdate(code, true); }
        });
        socket.join(code); socket.gameCode = code; socket.role = 'host';
        callback({ success: true, code });
    });

    socket.on('joinGame', (data, callback) => {
        let code = data.code?.toUpperCase();
        if (!code || !games[code]) return callback({ success: false, message: 'Introuvable' });
        const game = games[code];
        if (game.status !== 'lobby') return callback({ success: false, message: 'Déjà commencée' });

        const playerPseudo = normalizePseudo(data?.pseudo, 'Joueur');
        let player = Object.values(game.players).find(p => p.pseudo === playerPseudo);
        
        if (player) {
            if (disconnectTimeouts[player.id]) { clearTimeout(disconnectTimeouts[player.id]); delete disconnectTimeouts[player.id]; }
            delete game.players[player.id];
            player.id = socket.id;
        } else {
            const pCount = Object.keys(game.players).length;
            const colors = ['#3498db', '#e74c3c', '#2ecc71', '#f1c40f', '#9b59b6'];
            player = {
                id: socket.id, pseudo: playerPseudo, 
                x: game.level ? game.level.spawnX + pCount * 40 : 100, 
                y: game.level ? game.level.spawnY : 100,
                vx: 0, vy: 0, hp: 2, isDead: false, invuln: 0, 
                color: colors[pCount % colors.length], actionBlink: 0
            };
        }
        game.players[socket.id] = player;
        socket.join(code); socket.gameCode = code; socket.role = 'player';
        game.forceFull = true; game.netDirty = true;
        callback({ success: true, code });
    });

    socket.on('input', (data) => {
        const game = games[socket.gameCode];
        if (!game) return;
        const p = game.players[socket.id];
        if (!p || p.isDead) return;

        if (data.type === 'move') {
            const dx = Math.max(-1, Math.min(1, data.dx || 0));
            const dy = Math.max(-1, Math.min(1, data.dy || 0));
            if (p.vx !== dx || p.vy !== dy) { p.vx = dx; p.vy = dy; game.netDirty = true; }
        } else if (data.type === 'action' && data.button === 'B') {
            p.actionBlink = 15; game.netDirty = true;
        }
    });

    socket.on('startGame', () => {
        const game = games[socket.gameCode];
        if (game && socket.role === 'host' && Object.keys(game.players).length >= 2) {
            game.status = 'starting'; game.countdown = 5;
            game.level = gameLogic.generateLevel(Object.keys(game.players).length);
            game.forceFull = true; game.netDirty = true;
        }
    });

    socket.on('disconnect', () => {
        const code = socket.gameCode;
        if (!code || !games[code]) return;
        if (socket.role === 'host') { io.to(code).emit('gameClosed'); delete games[code]; }
        else {
            disconnectTimeouts[socket.id] = setTimeout(() => {
                const g = games[code];
                if (g && g.players[socket.id]) {
                    delete g.players[socket.id];
                    if (Object.keys(g.players).length < 2 && g.status === 'playing') {
                        io.to(code).emit('gameClosed', { reason: 'not-enough-players' });
                        delete games[code];
                    } else {
                        gameLogic.adjustDifficulty(g.level, Object.keys(g.players).length);
                        g.forceFull = true; g.netDirty = true;
                    }
                }
            }, 10000);
        }
    });
});

// ── HIGH-PRECISION GAME LOOP (60Hz Logic / 20Hz Net) ──────────────────

let lastTick = Date.now();
let lastNetSync = Date.now();

function gameLoop() {
    const now = Date.now();
    const dt = Math.min(0.1, (now - lastTick) / 1000); // Clamped delta
    lastTick = now;

    for (const code in games) {
        const game = games[code];
        
        if (game.status === 'starting') {
            game.tickAcc = (game.tickAcc || 0) + dt;
            if (game.tickAcc >= 1) {
                game.countdown--; game.tickAcc = 0; game.netDirty = true;
                if (game.countdown <= 0) {
                    gameLogic.assignerSpawnsJoueurs(game.level, game.players);
                    game.status = 'playing'; game.timeLeft = 300; game.forceFull = true;
                }
            }
        } else if (game.status === 'playing') {
            game.tickAcc = (game.tickAcc || 0) + dt;
            if (game.tickAcc >= 1) {
                game.timeLeft--; game.tickAcc = 0; game.netDirty = true;
                if (game.timeLeft <= 0) game.status = 'defeat';
            }

            // Physics (60Hz)
            for (const id in game.players) {
                const p = game.players[id];
                if (!p.isDead) {
                    const oldX = p.x, oldY = p.y;
                    gameLogic.applyPhysics(p, game.level, dt);
                    if (p.x !== oldX || p.y !== oldY) game.netDirty = true;
                }
                if (p.actionBlink > 0) { p.actionBlink--; game.netDirty = true; }
            }
            
            gameLogic.updateTriggers(game.players, game.level);

            if (gameLogic.checkWinCondition(game.players, game.level)) { game.status = 'victory'; game.netDirty = true; }
            else if (Object.values(game.players).every(p => p.isDead)) { game.status = 'defeat'; game.netDirty = true; }
        }
    }

    // Network Sync at 20Hz
    if (now - lastNetSync >= 50) {
        for (const code in games) {
            if (games[code].netDirty) { emitStateUpdate(code); games[code].netDirty = false; }
        }
        lastNetSync = now;
    }

    setImmediate(gameLoop);
}

setImmediate(gameLoop);

// ── SERVER START ──────────────────────────────────────────────

function startServer(port) {
    server.listen(port, '0.0.0.0', () => console.log(`Bancal Server optimized running at http://localhost:${port}`));
}

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') startServer(DEFAULT_PORT + 1);
    else throw err;
});

startServer(DEFAULT_PORT);
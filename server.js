const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const gameLogic = require('./gameLogic');
const os = require('os');
const qrcode = require('qrcode');

function getLocalIP() {
    const interfaces = os.networkInterfaces();

    // First pass: look for physical adapters
    for (const name of Object.keys(interfaces)) {
        let n = name.toLowerCase();
        if (n.includes('virtual') || n.includes('vnic') || n.includes('wsl') || n.includes('vethernet')) continue;

        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }

    // Second pass: fallback
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const DEFAULT_PORT = parseInt(process.env.PORT, 10) || 3000;
const LOCAL_IP = getLocalIP();
// QR Code should redirect to the IP without the port + /<code_de_la_partie>
// We assume it's deployed on standard 80/443 port for production, but locally we useLOCAL_IP
const BASE_URL = `http://games.bancal.tech`;

app.use(express.static(path.join(__dirname, 'public')));

// Catch /ABCD routes to redirect to landing with the code prefilled
app.get('/:code([a-zA-Z0-9]{4})', (req, res) => {
    res.redirect(`/?code=${req.params.code.toUpperCase()}`);
});

const games = {};
const disconnectTimeouts = {};

function generateGameCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code;
    do {
        code = '';
        for (let i = 0; i < 4; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
    } while (games[code]);
    return code;
}

function normalizePseudo(rawPseudo, fallback) {
    if (typeof rawPseudo !== 'string') return fallback;
    const cleaned = rawPseudo.trim().slice(0, 15);
    return cleaned || fallback;
}

const TICK_RATE = 20; // 50 ticks/s for physics
const NETWORK_TICK_RATE = 50; // 20 updates/s over the wire
const FORCE_SYNC_RATE = 250; // force a periodic sync even when idle

function markGameDirty(gameCode) {
    const game = games[gameCode];
    if (!game) return;
    game.netDirty = true;
}

function buildDynamicState(gameState) {
    const dynamicLevel = gameState.level ? {
        buttons: gameState.level.buttons,
        doors: gameState.level.doors,
        coins: gameState.level.coins,
        hearts: gameState.level.hearts,
        traps: gameState.level.traps,
        exit: gameState.level.exit,
        quests: gameState.level.quests
        // sequenceIndex / sequenceButtons supprimés (feature retirée)
    } : null;

    // ── COMPRESSION DU PAYLOAD (OPTIMISATION) ──────────────────────
    // On évite les objets JSON lourds : chaque joueur est compressé
    // en un tableau compact [x, y, vx, vy, hp, isDead, invuln, actionBlink, color, pseudo].
    // La décompression se fait côté client dans stateUpdate.
    const compressedPlayers = {};
    for (const id in gameState.players) {
        const p = gameState.players[id];
        compressedPlayers[id] = [
            Math.round(p.x * 10) / 10,  // [0] x (1 décimale suffira)
            Math.round(p.y * 10) / 10,  // [1] y
            p.vx,                        // [2] vx
            p.vy,                        // [3] vy
            p.hp,                        // [4] hp
            p.isDead ? 1 : 0,            // [5] isDead (booléen → 0/1)
            p.invuln,                    // [6] invuln (ticks restants)
            p.actionBlink,               // [7] actionBlink
            p.color,                     // [8] color (hex string, changé rarement)
            p.pseudo                     // [9] pseudo
        ];
    }

    return {
        status: gameState.status,
        timeLeft: gameState.timeLeft,
        countdown: gameState.countdown,
        players: compressedPlayers, // tableau compact au lieu d'objet
        level: dynamicLevel,
        _compressed: true  // marqueur pour que le client sache décompresser
    };
}

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    socket.on('createGame', (data, callback) => {
        const code = generateGameCode();
        const joinUrl = `${BASE_URL}/${code}`;
        const hostPseudo = normalizePseudo(data?.pseudo, 'Le Chef');

        games[code] = {
            code: code,
            hostName: hostPseudo,
            status: 'lobby',
            timeLeft: 300,
            players: {},
            joinUrl: joinUrl,
            qrCodeDataUrl: '',
            level: gameLogic.generateLevel(2), // Default level
            netElapsed: 0,
            netForceElapsed: 0,
            netDirty: true
        };

        qrcode.toDataURL(joinUrl, { margin: 2, scale: 6, color: { dark: '#000000', light: '#ffffff' } }, (err, url) => {
            if (!err) {
                games[code].qrCodeDataUrl = url;
                if (games[code]) {
                    io.to(code).emit('stateUpdate', games[code]);
                    markGameDirty(code);
                }
            }
        });

        // The host joins the socket room
        socket.join(code);
        socket.gameCode = code;
        socket.role = 'host';

        callback({ success: true, code: code });
        console.log(`Game created: ${code} by ${hostPseudo}`);
    });

    socket.on('joinGame', (data, callback) => {
        let code = data.code ? data.code.toUpperCase() : null;
        const playerPseudo = normalizePseudo(data?.pseudo, 'Joueur Mobile');
        if (!code || !games[code]) {
            callback({ success: false, message: 'Partie introuvable' });
            return;
        }

        const game = games[code];

        if (game.status !== 'lobby') {
            callback({ success: false, message: 'La partie a déjà commençée !' });
            return;
        }

        const clientIp = socket.handshake.address;
        let reconnected = false;

        // Gestion des reconnexions
        for (const [oldId, player] of Object.entries(game.players)) {
            if (player.pseudo === playerPseudo) {
                // On annule la suppression du personnage si elle était programmée
                if (disconnectTimeouts[oldId]) {
                    clearTimeout(disconnectTimeouts[oldId]);
                    delete disconnectTimeouts[oldId];
                }

                // On transfère l'ancien personnage sur la nouvelle connexion
                player.id = socket.id;
                game.players[socket.id] = player;
                delete game.players[oldId];

                reconnected = true;
                console.log(`Joueur ${player.pseudo} reconnecté avec succès !`);
                break;
            }
        }

        socket.join(code);
        socket.gameCode = code;
        socket.role = 'player';
        socket.clientIp = clientIp;

        // S'il s'est reconnecté, on arrête la fonction ici
        if (reconnected) {
            io.to(code).emit('stateUpdate', game);
            markGameDirty(code);
            callback({ success: true, code: code });
            return;
        }

        const shapes = ['square', 'triangle', 'circle', 'cross', 'star'];
        const colors = ['#3498db', '#e74c3c', '#2ecc71', '#f1c40f', '#9b59b6'];
        const pCount = Object.keys(game.players).length;

        let usedCombos = Object.values(game.players).map(p => p.shape + '_' + p.color);

        let chosenShape = shapes[pCount % shapes.length];
        let chosenColor = colors[pCount % colors.length];

        outer: for (let s of shapes) {
            for (let c of colors) {
                if (!usedCombos.includes(s + '_' + c)) {
                    chosenShape = s;
                    chosenColor = c;
                    break outer;
                }
            }
        }

        const spawnX = (game.level && game.level.spawnX) ? game.level.spawnX + pCount * 55 : 100 + pCount * 55;
        const spawnY = (game.level && game.level.spawnY) ? game.level.spawnY : 100;

        // Création UNIQUE et COMPLÈTE du joueur
        game.players[socket.id] = {
            id: socket.id,
            pseudo: playerPseudo || `Joueur ${pCount + 1}`,
            x: spawnX,
            y: spawnY,
            vx: 0,
            vy: 0,
            actionBlink: 0,
            color: chosenColor,
            shape: chosenShape,
            hp: 2,
            isDead: false,
            invuln: 0
        };

        io.to(code).emit('stateUpdate', game);
        markGameDirty(code);
        callback({ success: true, code: code });
        console.log(`Player ${playerPseudo} joined ${code}`);
    });

    socket.on('startGame', () => {
        const code = socket.gameCode;
        if (code && games[code]) {
            const game = games[code];
            const playerCount = Object.keys(game.players).length;

            if (playerCount < 2) {
                return;
            }

            if (game.status === 'lobby' || game.status === 'defeat' || game.status === 'victory') {
                game.status = 'starting';
                game.countdown = 5;
                game.level = gameLogic.generateLevel(playerCount);
                io.to(code).emit('stateUpdate', game);
                markGameDirty(code);
            }
        }
    });

    socket.on('cancelGame', () => {
        const code = socket.gameCode;
        if (code && games[code] && socket.role === 'host') {
            io.to(code).emit('gameClosed');
            delete games[code];
            console.log(`Game ${code} cancelled by host.`);
        }
    });

    socket.on('returnToLobby', () => {
        const code = socket.gameCode;
        if (!code || !games[code] || socket.role !== 'host') return;

        const game = games[code];
        if (game.status !== 'defeat' && game.status !== 'victory') return;

        game.status = 'lobby';
        game.level = null;
        game.countdown = 5;
        game.timeLeft = 300;

        for (const id in game.players) {
            const p = game.players[id];
            p.vx = 0;
            p.vy = 0;
            p.hp = 2;
            p.isDead = false;
            p.invuln = 0;
            p.actionBlink = 0;
        }

        io.to(code).emit('stateUpdate', game);
        markGameDirty(code);
    });

    socket.on('input', (data) => {
        const code = socket.gameCode;
        if (code && games[code] && socket.role === 'player') {
            const player = games[code].players[socket.id];
            if (!player) return;

            if (data.type === 'move') {
                const oldVx = player.vx;
                const oldVy = player.vy;
                player.vx = data.dx;
                player.vy = data.dy;
                if (oldVx !== player.vx || oldVy !== player.vy) {
                    markGameDirty(code);
                }
            } else if (data.type === 'action') {
                if (data.button === 'B') {
                    player.actionBlink = 15;
                    markGameDirty(code);
                }
            }
        }
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        const code = socket.gameCode;
        if (code && games[code]) {
            if (socket.role === 'host') {
                // L'écran principal a quitté
                io.to(code).emit('gameClosed');
                delete games[code];
                console.log(`Game ${code} closed because host left.`);
            } else if (socket.role === 'player') {
                const player = games[code].players[socket.id];
                if (player) {
                    // On ne supprime pas le joueur de suite, on lui laisse 10 secondes
                    disconnectTimeouts[socket.id] = setTimeout(() => {
                        // S'il n'est pas revenu après 10s, on le supprime pour de bon
                        if (games[code] && games[code].players[socket.id]) {
                            delete games[code].players[socket.id];

                            const currentPlayersCount = Object.keys(games[code].players).length;
                            const gameInProgress = games[code].status === 'starting' || games[code].status === 'playing';

                            if (gameInProgress) {
                                // RÈGLE DES 2 JOUEURS : Si moins de 2 joueurs restants, on coupe tout
                                if (currentPlayersCount < 2) {
                                    console.log(`Game ${code} ended because not enough players left.`);
                                    io.to(code).emit('gameClosed', { reason: 'not-enough-players' });
                                    delete games[code];
                                } else {
                                    // Sinon, on ajuste la difficulté pour ceux qui restent
                                    gameLogic.adjustDifficulty(games[code].level, currentPlayersCount);
                                    io.to(code).emit('stateUpdate', games[code]);
                                    markGameDirty(code);
                                    console.log(`Game ${code} dynamically adjusted for ${currentPlayersCount} players.`);
                                }
                            } else {
                                io.to(code).emit('stateUpdate', games[code]);
                                markGameDirty(code);
                            }
                        }
                    }, 10000); // 10000 millisecondes = 10 secondes
                }
            }
        }
    });
});

// Physics & Game Loop
setInterval(() => {
    for (const code in games) {
        const gameState = games[code];

        let stateChanged = false;
        for (const id in gameState.players) {
            const p = gameState.players[id];
            if (p.vx !== 0 || p.vy !== 0) {
                gameLogic.applyPhysics(p, gameState.level);
                stateChanged = true;
            }
            if (p.actionBlink > 0) {
                p.actionBlink--;
                stateChanged = true;
            }
        }

        gameLogic.updateTriggers(gameState.players, gameState.level);

        if (gameState.status === 'playing') {
            const prevStatus = gameState.status;
            if (gameLogic.checkWinCondition(gameState.players, gameState.level)) {
                gameState.status = 'victory';
            } else {
                const playerList = Object.values(gameState.players);
                const noAlivePlayers = playerList.length > 0 && playerList.every(p => p.isDead);
                if (noAlivePlayers) {
                    gameState.status = 'defeat';
                }
            }
            if (gameState.status !== prevStatus) {
                stateChanged = true;
            }
        }

        if (stateChanged) {
            gameState.netDirty = true;
        }

        gameState.netElapsed += TICK_RATE;
        gameState.netForceElapsed += TICK_RATE;

        if (gameState.netElapsed >= NETWORK_TICK_RATE) {
            const shouldEmit = gameState.netDirty || gameState.netForceElapsed >= FORCE_SYNC_RATE;
            if (shouldEmit) {
                io.to(code).emit('stateUpdate', buildDynamicState(gameState));
                gameState.netDirty = false;
                gameState.netForceElapsed = 0;
            }
            gameState.netElapsed = 0;
        }
    }
}, TICK_RATE);

// Timer loop
setInterval(() => {
    for (const code in games) {
        const gameState = games[code];
        if (gameState.status === 'starting') {
            if (gameState.countdown > 0) {
                gameState.countdown--;
                gameState.netDirty = true;
            }
            if (gameState.countdown <= 0) {
                gameLogic.assignerSpawnsJoueurs(gameState.level, gameState.players);
                gameState.status = 'playing';
                gameState.timeLeft = 300;
                gameState.netDirty = true;
            }
        } else if (gameState.status === 'playing') {
            gameState.timeLeft--;
            gameState.netDirty = true;
            if (gameState.timeLeft <= 0) {
                gameState.status = 'defeat';
                gameState.netDirty = true;
            }
        }
    }
}, 1000);

let currentPort = DEFAULT_PORT;

function startServer(port) {
    currentPort = port;
    server.listen(port, '0.0.0.0', () => {
        console.log(`Bancal Server running at http://localhost:${port}`);
    });
}

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        const fallbackPort = currentPort + 1;
        console.warn(`Port ${currentPort} déjà utilisé. Tentative sur ${fallbackPort}...`);
        startServer(fallbackPort);
        return;
    }
    throw err;
});

startServer(DEFAULT_PORT);
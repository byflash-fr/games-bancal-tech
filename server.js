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
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) return iface.address;
        }
    }
    return 'localhost';
}

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const DEFAULT_PORT = parseInt(process.env.PORT, 10) || 3000;
const LOCAL_IP = getLocalIP();
const BASE_URL = `http://games.bancal.tech`;

app.use(express.static(path.join(__dirname, 'public')));

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
        for (let i = 0; i < 4; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    } while (games[code]);
    return code;
}

function normalizePseudo(rawPseudo, fallback) {
    if (typeof rawPseudo !== 'string') return fallback;
    const cleaned = rawPseudo.trim().slice(0, 15);
    return cleaned || fallback;
}

const TICK_RATE = 20; 
const NETWORK_TICK_RATE = 50; 
const FORCE_SYNC_RATE = 250; 

function markGameDirty(gameCode) {
    const game = games[gameCode];
    if (!game) return;
    game.netDirty = true;
}

// ── DELTA-STATES : État précédent pour comparaison par joueur ────────────
// On ne retransmet que ce qui a réellement changé, économisant jusqu'à
// 80% de la bande passante réseau lors des ticks statiques.
const previousGameStates = new Map(); // gameCode -> Map<playerId, {x,y}>

function getOrCreatePreviousState(gameCode) {
    if (!previousGameStates.has(gameCode)) previousGameStates.set(gameCode, new Map());
    return previousGameStates.get(gameCode);
}

/**
 * Calcule et émet uniquement le delta des positions (joueurs ayant bougé).
 * Retourne true si quelque chose a été envoyé.
 */
function emitDeltaTick(gameCode) {
    const gameState = games[gameCode];
    if (!gameState || !gameState.hostSocketId) return false;

    const prevState = getOrCreatePreviousState(gameCode);
    const delta = {};
    let hasChanges = false;

    for (const id in gameState.players) {
        const p = gameState.players[id];
        const prev = prevState.get(id);
        // Émet si c'est un nouveau joueur ou si x/y ont changé
        if (!prev || prev.x !== p.x || prev.y !== p.y ||
            prev.hp !== p.hp || prev.isDead !== p.isDead ||
            prev.invuln !== p.invuln || prev.actionBlink !== p.actionBlink) {
            delta[id] = buildCompressedPlayers({ [id]: p })[id];
            prevState.set(id, { x: p.x, y: p.y, hp: p.hp, isDead: p.isDead, invuln: p.invuln, actionBlink: p.actionBlink });
            hasChanges = true;
        }
    }

    // Nettoie les joueurs disparus du previousState
    for (const [id] of prevState) {
        if (!gameState.players[id]) prevState.delete(id);
    }

    if (!hasChanges) return false;

    // Payload minimal : seulement le delta + méta-données essentielles
    const payload = {
        status: gameState.status,
        timeLeft: gameState.timeLeft,
        countdown: gameState.countdown,
        players: delta,
        _compressed: true,
        _delta: true
    };
    io.volatile.to(gameState.hostSocketId).emit('stateUpdate', payload);
    return true;
}

function buildCompressedPlayers(playersById) {
    const compressedPlayers = {};
    for (const id in playersById) {
        const p = playersById[id];
        compressedPlayers[id] = [
            Math.round(p.x * 10) / 10,
            Math.round(p.y * 10) / 10,
            p.vx,
            p.vy,
            p.hp,
            p.isDead ? 1 : 0,
            p.invuln,
            p.actionBlink,
            p.color,
            p.pseudo
        ];
    }
    return compressedPlayers;
}

function buildHostDynamicState(gameState) {
    const dynamicLevel = gameState.level ? {
        buttons: gameState.level.buttons,
        doors: gameState.level.doors,
        coins: gameState.level.coins,
        hearts: gameState.level.hearts,
        traps: gameState.level.traps,
        exit: gameState.level.exit,
        quests: gameState.level.quests
    } : null;

    return {
        status: gameState.status,
        timeLeft: gameState.timeLeft,
        countdown: gameState.countdown,
        players: buildCompressedPlayers(gameState.players),
        level: dynamicLevel,
        _compressed: true
    };
}

function buildPlayerDynamicState(gameState, playerId) {
    const me = gameState.players[playerId];
    return {
        status: gameState.status,
        timeLeft: gameState.timeLeft,
        countdown: gameState.countdown,
        players: me ? { [playerId]: me } : {}
    };
}

// OPTIMISATION RESEAU MASSIVE : Utilisation de messages "volatile" pour les updates classiques.
function emitStateUpdate(gameCode, options = {}) {
    const gameState = games[gameCode];
    if (!gameState) return;

    const hostPayload = options.hostFull ? gameState : buildHostDynamicState(gameState);
    if (gameState.hostSocketId) {
        if (options.hostFull) {
            io.to(gameState.hostSocketId).emit('stateUpdate', hostPayload);
        } else {
            // Un paquet volatil est abandonné si la connexion réseau ne suit pas, évitant un buffer overflow NodeJS
            io.volatile.to(gameState.hostSocketId).emit('stateUpdate', hostPayload);
        }
    }

    // Réutilisation d'objets pour sauver du calcul CPU
    const basePlayerState = {
        status: gameState.status,
        timeLeft: gameState.timeLeft,
        countdown: gameState.countdown
    };

    for (const playerId in gameState.players) {
        const playerPayload = { ...basePlayerState, players: { [playerId]: gameState.players[playerId] } };
        if (options.hostFull) {
            io.to(playerId).emit('stateUpdate', playerPayload);
        } else {
            io.volatile.to(playerId).emit('stateUpdate', playerPayload);
        }
    }
}

io.on('connection', (socket) => {
    socket.on('createGame', (data, callback) => {
        const code = generateGameCode();
        const joinUrl = `${BASE_URL}/${code}`;
        const hostPseudo = normalizePseudo(data?.pseudo, 'Le Chef');

        games[code] = {
            code: code,
            hostName: hostPseudo,
            hostSocketId: socket.id,
            status: 'lobby',
            timeLeft: 300,
            players: {},
            joinUrl: joinUrl,
            qrCodeDataUrl: '',
            level: gameLogic.generateLevel(2), 
            netElapsed: 0,
            netForceElapsed: 0,
            netDirty: true
        };

        qrcode.toDataURL(joinUrl, { margin: 2, scale: 6, color: { dark: '#000000', light: '#ffffff' } }, (err, url) => {
            if (!err) {
                games[code].qrCodeDataUrl = url;
                if (games[code]) {
                    emitStateUpdate(code, { hostFull: true });
                    markGameDirty(code);
                }
            }
        });

        socket.join(code);
        socket.gameCode = code;
        socket.role = 'host';

        callback({ success: true, code: code });
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
            callback({ success: false, message: 'La partie a déjà commencée !' });
            return;
        }

        let reconnected = false;
        for (const [oldId, player] of Object.entries(game.players)) {
            if (player.pseudo === playerPseudo) {
                if (disconnectTimeouts[oldId]) {
                    clearTimeout(disconnectTimeouts[oldId]);
                    delete disconnectTimeouts[oldId];
                }
                player.id = socket.id;
                game.players[socket.id] = player;
                delete game.players[oldId];
                reconnected = true;
                break;
            }
        }

        socket.join(code);
        socket.gameCode = code;
        socket.role = 'player';

        if (reconnected) {
            emitStateUpdate(code, { hostFull: true });
            markGameDirty(code);
            callback({ success: true, code: code });
            return;
        }

        const shapes = ['square', 'triangle', 'circle', 'cross', 'star'];
        const colors = [
            '#3498db', '#e74c3c', '#2ecc71', '#f1c40f', '#9b59b6', // Classiques
            '#1abc9c', '#e67e22', '#e91e63', '#a2cf6e', '#3f51b5', // Vifs
            '#00bcd4', '#ff80ab', '#4caf50', '#ff9800', '#795548'  // Variés
        ];
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

        emitStateUpdate(code, { hostFull: true });
        markGameDirty(code);
        callback({ success: true, code: code });
    });

    socket.on('startGame', () => {
        const code = socket.gameCode;
        if (code && games[code]) {
            const game = games[code];
            const playerCount = Object.keys(game.players).length;

            if (playerCount < 2) return;

            if (game.status === 'lobby' || game.status === 'defeat' || game.status === 'victory') {
                game.status = 'starting';
                game.countdown = 5;
                game.level = gameLogic.generateLevel(playerCount);
                emitStateUpdate(code, { hostFull: true });
                markGameDirty(code);
            }
        }
    });

    socket.on('cancelGame', () => {
        const code = socket.gameCode;
        if (code && games[code] && socket.role === 'host') {
            io.to(code).emit('gameClosed');
            previousGameStates.delete(code); // nettoyage mémoire delta
            delete games[code];
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
            p.vx = 0; p.vy = 0; p.hp = 2; p.isDead = false; p.invuln = 0; p.actionBlink = 0;
        }

        emitStateUpdate(code, { hostFull: true });
        markGameDirty(code);
    });

    socket.on('input', (data) => {
        const code = socket.gameCode;
        if (code && games[code] && socket.role === 'player') {
            const player = games[code].players[socket.id];
            if (!player) return;

            if (data.type === 'move') {
                player.vx = data.dx;
                player.vy = data.dy;
                markGameDirty(code);
            } else if (data.type === 'action') {
                if (data.button === 'B') {
                    player.actionBlink = 15;
                    markGameDirty(code);
                }
            }
        }
    });

    socket.on('disconnect', () => {
        const code = socket.gameCode;
        if (code && games[code]) {
            if (socket.role === 'host') {
                io.to(code).emit('gameClosed');
                previousGameStates.delete(code); // nettoyage mémoire delta
                delete games[code];
            } else if (socket.role === 'player') {
                const player = games[code].players[socket.id];
                if (player) {
                    disconnectTimeouts[socket.id] = setTimeout(() => {
                        if (games[code] && games[code].players[socket.id]) {
                            delete games[code].players[socket.id];

                            const currentPlayersCount = Object.keys(games[code].players).length;
                            const gameInProgress = games[code].status === 'starting' || games[code].status === 'playing';

                            if (gameInProgress) {
                                if (currentPlayersCount < 2) {
                                    io.to(code).emit('gameClosed', { reason: 'not-enough-players' });
                                    delete games[code];
                                } else {
                                    gameLogic.adjustDifficulty(games[code].level, currentPlayersCount);
                                    emitStateUpdate(code, { hostFull: true });
                                    markGameDirty(code);
                                }
                            } else {
                                emitStateUpdate(code, { hostFull: true });
                                markGameDirty(code);
                            }
                        }
                    }, 10000); 
                }
            }
        }
    });
});

// Boucle principale ultra optimisée
setInterval(() => {
    // Calcul de deltaTime en Secondes, indispensable pour la mécanique des triggers de gameLogic.
    const dt = TICK_RATE / 1000; 

    for (const code in games) {
        const gameState = games[code];
        let stateChanged = false;

        for (const id in gameState.players) {
            const p = gameState.players[id];
            
            // Toujours passer dt pour décompter correctement l'invulnérabilité
            const wasInvuln = p.invuln > 0;
            gameLogic.applyPhysics(p, gameState.level, dt);
            
            if (p.vx !== 0 || p.vy !== 0 || (wasInvuln && p.invuln <= 0)) {
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
                if (noAlivePlayers) gameState.status = 'defeat';
            }
            if (gameState.status !== prevStatus) stateChanged = true;
        }

        if (stateChanged) gameState.netDirty = true;

        gameState.netElapsed += TICK_RATE;
        gameState.netForceElapsed += TICK_RATE;

        if (gameState.netElapsed >= NETWORK_TICK_RATE) {
            if (gameState.netForceElapsed >= FORCE_SYNC_RATE) {
                // Sync complète périodique : envoie l'état entier pour rester cohérent
                emitStateUpdate(code);
                gameState.netDirty = false;
                gameState.netForceElapsed = 0;
            } else if (gameState.netDirty) {
                // Tick normal : envoie uniquement le delta (positions qui ont bougé)
                emitDeltaTick(code);
                gameState.netDirty = false;
            }
            gameState.netElapsed = 0;
        }
    }
}, TICK_RATE);

// Boucle gérant le décompte/timer
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
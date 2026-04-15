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

const PORT = process.env.PORT || 3000;
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
        for(let i = 0; i < 4; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
    } while(games[code]);
    return code;
}

function normalizePseudo(rawPseudo, fallback) {
    if (typeof rawPseudo !== 'string') return fallback;
    const cleaned = rawPseudo.trim().slice(0, 15);
    return cleaned || fallback;
}

const TICK_RATE = 20;// 60 FPS

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
            level: gameLogic.generateLevel(2) // Default level
        };
        
        qrcode.toDataURL(joinUrl, { margin: 2, scale: 6, color: { dark: '#000000', light: '#ffffff' } }, (err, url) => {
            if(!err) {
                games[code].qrCodeDataUrl = url;
                if(games[code]) {
                    io.to(code).emit('stateUpdate', games[code]);
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
            callback({ success: true, code: code });
            return;
        }
        
        const shapes = ['square', 'triangle', 'circle', 'cross', 'star'];
        const colors = ['#3498db', '#e74c3c', '#2ecc71', '#f1c40f', '#9b59b6'];
        const pCount = Object.keys(game.players).length;
        
        let usedCombos = Object.values(game.players).map(p => p.shape + '_' + p.color);

        let chosenShape = shapes[pCount % shapes.length];
        let chosenColor = colors[pCount % colors.length];
        
        outer: for(let s of shapes) {
            for(let c of colors) {
                if(!usedCombos.includes(s + '_' + c)) {
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
        callback({ success: true, code: code });
        console.log(`Player ${playerPseudo} joined ${code}`);
    });

    socket.on('startGame', () => {
        const code = socket.gameCode;
        if(code && games[code]) {
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
            }
        }
    });

    socket.on('cancelGame', () => {
        const code = socket.gameCode;
        if(code && games[code] && socket.role === 'host') {
            io.to(code).emit('gameClosed');
            delete games[code];
            console.log(`Game ${code} cancelled by host.`);
        }
    });

    socket.on('input', (data) => {
        const code = socket.gameCode;
        if(code && games[code] && socket.role === 'player') {
            const player = games[code].players[socket.id];
            if (!player) return;
            
            if (data.type === 'move') {
                player.vx = data.dx;
                player.vy = data.dy;
            } else if (data.type === 'action') {
                if (data.button === 'B') player.actionBlink = 15;
            }
        }
    });

socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        const code = socket.gameCode;
        if(code && games[code]) {
            if (socket.role === 'host') {
                // L'écran principal a quitté
                io.to(code).emit('gameClosed');
                delete games[code];
                console.log(`Game ${code} closed because host left.`);
            } else if (socket.role === 'player') {
                const player = games[code].players[socket.id];
                if(player) {
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
                                    console.log(`Game ${code} dynamically adjusted for ${currentPlayersCount} players.`);
                                }
                            } else {
                                io.to(code).emit('stateUpdate', games[code]);
                            }
                        }
                    }, 10000); // 10000 millisecondes = 10 secondes
                }
            }
        }
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
            if (gameLogic.checkWinCondition(gameState.players, gameState.level)) {
                gameState.status = 'victory';
            }
        }
        
        io.to(code).emit('stateUpdate', gameState);
    }
}, TICK_RATE);

// Timer loop
setInterval(() => {
    for (const code in games) {
        const gameState = games[code];
        if (gameState.status === 'starting') {
            if (gameState.countdown > 0) {
                gameState.countdown--;
            }
            if (gameState.countdown <= 0) {
                gameState.status = 'playing';
                gameState.timeLeft = 300;
            }
        } else if (gameState.status === 'playing') {
            gameState.timeLeft--;
            if (gameState.timeLeft <= 0) {
                gameState.status = 'defeat';
            }
        }
    }
}, 1000);

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Bancal Server running at http://localhost:${PORT}`);
});

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const gameLogic = require('./gameLogic');
const os = require('os');
const qrcode = require('qrcode');

function getLocalIP() {
    const interfaces = os.networkInterfaces();
    
    // First pass: look for physical adapters (skip virtual/WSL)
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
const JOIN_URL = `http://${LOCAL_IP}:${PORT}/mobile.html`;

app.use(express.static(path.join(__dirname, 'public')));

const gameState = {
    status: 'lobby',
    timeLeft: 300,
    players: {},
    joinUrl: JOIN_URL,
    qrCodeDataUrl: '',
    level: gameLogic.generateLevel(2) // Default level
};

qrcode.toDataURL(JOIN_URL, { margin: 2, scale: 6, color: { dark: '#000000', light: '#ffffff' } }, (err, url) => {
    if(!err) gameState.qrCodeDataUrl = url;
});

setInterval(() => {
    if(gameState.status === 'playing') {
        gameState.timeLeft--;
        if(gameState.timeLeft <= 0) {
            gameState.status = 'defeat';
        }
    }
}, 1000);

const TICK_RATE = 1000 / 60; // 60 FPS
const PLAYER_SPEED = 5;

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);
    
    socket.on('register', (role) => {
        if (role === 'player') {
            const shapes = ['square', 'triangle', 'circle', 'cross', 'star'];
            const colors = ['#3498db', '#e74c3c', '#2ecc71', '#f1c40f', '#9b59b6'];
            const pCount = Object.keys(gameState.players).length;
            
            gameState.players[socket.id] = {
                id: socket.id,
                x: 100 + (pCount * 50),
                y: 100,
                vx: 0,
                vy: 0,
                actionBlink: 0,
                color: colors[pCount % colors.length],
                shape: shapes[pCount % shapes.length]
            };
            io.emit('stateUpdate', gameState);
        }
    });

    socket.on('startGame', () => {
        if (gameState.status === 'lobby' || gameState.status === 'defeat' || gameState.status === 'victory') {
            gameState.status = 'playing';
            gameState.timeLeft = 300;
            gameState.level = gameLogic.generateLevel(Object.keys(gameState.players).length || 2);
            io.emit('stateUpdate', gameState);
        }
    });

    socket.on('input', (data) => {
        const player = gameState.players[socket.id];
        if (!player) return;
        
        if (data.type === 'move') {
            player.vx = data.dx;
            player.vy = data.dy;
        } else if (data.type === 'action') {
            console.log(`Player ${socket.id} pressed ${data.button}`);
            if (data.button === 'B') player.actionBlink = 15;
            // A will be used for interactions
        }
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        if(gameState.players[socket.id]) {
            delete gameState.players[socket.id];
            io.emit('stateUpdate', gameState);
        }
    });
});

setInterval(() => {
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
    
    if(gameState.status === 'playing' && gameLogic.checkWinCondition(gameState.players, gameState.level)) {
        gameState.status = 'victory';
    }
    
    // Always emit state if a game is running to keep clients in sync
    // For now emit continuously to assure smooth interpolation or at least state consistency
    io.emit('stateUpdate', gameState);
}, TICK_RATE);

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Bancal Server running at http://localhost:${PORT}`);
});

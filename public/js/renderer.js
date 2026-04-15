const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
});

const urlParams = new URLSearchParams(window.location.search);
const pseudo = urlParams.get('pseudo') || 'Host';

let gameState = { players: {}, level: null };

socket.emit('createGame', { pseudo }, (response) => {
    if(response.success) {
        console.log("Game created:", response.code);
    }
});

const lobbyUI = document.getElementById('lobby-ui');
const pCountSpan = document.getElementById('player-count');
const joinUrlText = document.getElementById('join-url-text');
const qrCodeImg = document.getElementById('qr-code-img');
const gameCodeDisplay = document.getElementById('game-code-display');
const playersList = document.getElementById('players-list');
const victoryUI = document.getElementById('victory-ui');

// --- Sons ---
const backgroundMusic = new Audio('/assets/son/music.mp3');
backgroundMusic.loop = true;
backgroundMusic.preload = 'auto';
backgroundMusic.volume = 0.35;

const walkingSound = new Audio('/assets/son/marche.mp3');
walkingSound.loop = true;
walkingSound.preload = 'auto';
walkingSound.volume = 0.4;

// --- Chargement des Textures (Système dynamique) ---
const textures = {
    herbe: new Image(),
    feuille: new Image(),
    piece: new Image(),
    pikkux: new Image(),
    pikkuy: new Image(),
    sortie: new Image()
};

// On s'assure d'utiliser les bonnes extensions trouvées dans ton dossier
textures.herbe.src = '/assets/images/herbe.png';
textures.feuille.src = '/assets/images/feuille.png'; 
textures.piece.src = '/assets/images/piece.png';
textures.pikkux.src = '/assets/images/pikkux.png';
textures.pikkuy.src = '/assets/images/pikkuy.png';
textures.sortie.src = '/assets/images/sortie.png';

// --- Utilitaires de rendu 2D (Extrait de la logique Tilemap) ---

// 1. Dessine une texture en mosaïque, alignée sur la grille du monde (zéro déformation)
function drawWorldTiled(ctx, img, x, y, w, h, tileSize) {
    if (!img.complete || img.width === 0) return false;
    
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip(); // Restreint le dessin à l'intérieur de la zone
    
    // Aligner le départ sur la grille absolue pour une texture "seamless" (sans coupure)
    let startX = Math.floor(x / tileSize) * tileSize;
    let startY = Math.floor(y / tileSize) * tileSize;
    
    for (let i = startX; i < x + w; i += tileSize) {
        for (let j = startY; j < y + h; j += tileSize) {
            ctx.drawImage(img, i, j, tileSize, tileSize);
        }
    }
    ctx.restore();
    return true;
}

// 2. Dessine un sprite animé centré (Pièces, Sortie)
function drawAnimatedCenter(ctx, img, cx, cy, drawSize, speedMs) {
    if (!img.complete || img.width === 0) return false;
    // Déduit le nombre de frames via le ratio de l'image (ex: 320x32 = 10 frames)
    let frames = Math.max(1, Math.floor(img.width / img.height));
    let frameIndex = Math.floor(Date.now() / speedMs) % frames;
    let frameW = img.width / frames;
    let frameH = img.height;
    
    ctx.drawImage(img, frameIndex * frameW, 0, frameW, frameH, cx - drawSize/2, cy - drawSize/2, drawSize, drawSize);
    return true;
}

// 3. Dessine les pièges proprement alignés
function drawTrapTexture(ctx, img, x, y, w, h, isHorizontal) {
    if (!img.complete || img.width === 0) return false;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    
    let frames = Math.max(1, Math.floor(img.width / img.height));
    let frameIndex = Math.floor(Date.now() / 150) % frames;
    let frameW = img.width / frames;
    let frameH = img.height;
    
    if (isHorizontal) {
        let size = h; // La largeur de la texture s'adapte à la hauteur du piège
        for (let i = 0; i < w; i += size) {
            ctx.drawImage(img, frameIndex * frameW, 0, frameW, frameH, x + i, y, size, size);
        }
    } else {
        let size = w; // La hauteur de la texture s'adapte à la largeur du piège
        for (let j = 0; j < h; j += size) {
            ctx.drawImage(img, frameIndex * frameW, 0, frameW, frameH, x, y + j, size, size);
        }
    }
    ctx.restore();
    return true;
}


// --- Fonctions Audio ---
function tryPlayBackgroundMusic() {
    if (!backgroundMusic.paused) return;
    backgroundMusic.play().catch(() => {});
}

function tryPlayWalkingSound() {
    if (!walkingSound.paused) return;
    walkingSound.play().catch(() => {});
}

function stopWalkingSound() {
    if (walkingSound.paused) return;
    walkingSound.pause();
    walkingSound.currentTime = 0;
}

const unlockMusicOnFirstInteraction = () => {
    tryPlayBackgroundMusic();
    const isAnyPlayerMoving = Object.values(gameState.players || {}).some((player) => player.vx !== 0 || player.vy !== 0);
    if (isAnyPlayerMoving) {
        tryPlayWalkingSound();
    }
    document.removeEventListener('pointerdown', unlockMusicOnFirstInteraction);
    document.removeEventListener('keydown', unlockMusicOnFirstInteraction);
    document.removeEventListener('touchstart', unlockMusicOnFirstInteraction);
};

tryPlayBackgroundMusic();
document.addEventListener('pointerdown', unlockMusicOnFirstInteraction, { passive: true });
document.addEventListener('keydown', unlockMusicOnFirstInteraction);
document.addEventListener('touchstart', unlockMusicOnFirstInteraction, { passive: true });

function getIntersection(ray, segment) {
    const r_px = ray.a.x, r_py = ray.a.y;
    const r_dx = ray.b.x - ray.a.x, r_dy = ray.b.y - ray.a.y;
    const s_px = segment.a.x, s_py = segment.a.y;
    const s_dx = segment.b.x - segment.a.x, s_dy = segment.b.y - segment.a.y;

    if (r_dx * s_dy === r_dy * s_dx) return null; 

    const T2 = (r_dx * (s_py - r_py) + r_dy * (r_px - s_px)) / (s_dx * r_dy - s_dy * r_dx);
    const T1 = (s_px + s_dx * T2 - r_px) / r_dx;

    if (T1 > 0 && T2 >= 0 && T2 <= 1) {
        return { x: r_px + r_dx * T1, y: r_py + r_dy * T1, param: T1 };
    }
    return null;
}

function calculateVisibilityPolygon(origin, segments) {
    let points = [];
    for(let i = 0; i < segments.length; i++) {
        points.push(segments[i].a, segments[i].b);
    }
    
    let uniqueAngles = [];
    for(let p of points) {
        let angle = Math.atan2(p.y - origin.y, p.x - origin.x);
        uniqueAngles.push(angle - 0.00001, angle, angle + 0.00001);
    }

    let intersects = [];
    for(let angle of uniqueAngles) {
        let ray = {
            a: origin,
            b: { x: origin.x + Math.cos(angle)*3000, y: origin.y + Math.sin(angle)*3000 }
        };

        let closestIntersect = null;
        for(let s of segments) {
            let intersect = getIntersection(ray, s);
            if(!intersect) continue;
            if(!closestIntersect || intersect.param < closestIntersect.param) {
                closestIntersect = intersect;
            }
        }

        if(closestIntersect) {
            closestIntersect.angle = angle;
            intersects.push(closestIntersect);
        }
    }

    intersects.sort((a,b) => a.angle - b.angle);
    return intersects;
}


function startGame() {
    tryPlayBackgroundMusic();
    socket.emit('startGame');
}

function cancelGame() {
    socket.emit('cancelGame');
}

socket.on('gameClosed', (data) => {
    let msg = (data && data.reason === 'no-players') 
        ? "La partie est terminée car tous les joueurs sont partis." 
        : "Partie annulée !";
    alert(msg).then(() => {
        window.location.href = '/';
    });
});

let camera = { x: 0, y: 0, scale: 1 };
const fogCanvas = document.createElement('canvas');
const fogCtx = fogCanvas.getContext('2d', { willReadFrequently: true });


// ── BOUCLE DE RENDU ──────────────────────────────────────────────────
function draw() {
    ctx.fillStyle = '#1e1e24';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    if(!gameState.level || gameState.status === 'lobby') {
        stopWalkingSound();
        requestAnimationFrame(draw);
        return;
    }

    let pIds = Object.keys(gameState.players);
    let pCount = pIds.length;
    const isAnyPlayerMoving = pIds.some((id) => {
        const player = gameState.players[id];
        return player.vx !== 0 || player.vy !== 0;
    });

    if (gameState.status === 'playing' && isAnyPlayerMoving) {
        tryPlayWalkingSound();
    } else {
        stopWalkingSound();
    }
    
    // --- Calcul Caméra ---
    let targetX = gameState.level.width / 2;
    let targetY = gameState.level.height / 2;
    let targetScale = 1.0;

    if (pCount > 0) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for(let id of pIds) {
            let p = gameState.players[id];
            if(p.x < minX) minX = p.x;
            if(p.y < minY) minY = p.y;
            if(p.x > maxX) maxX = p.x;
            if(p.y > maxY) maxY = p.y;
        }
        targetX = (minX + maxX) / 2;
        targetY = (minY + maxY) / 2;
        
        let bw = (maxX - minX) + 600;
        let bh = (maxY - minY) + 600; 
        
        targetScale = Math.min(canvas.width / bw, canvas.height / bh);
        if(targetScale > 1.2) targetScale = 1.2;
        if(targetScale < 0.2) targetScale = 0.2;
    }

    camera.x += (targetX - camera.x) * 0.1;
    camera.y += (targetY - camera.y) * 0.1;
    camera.scale += (targetScale - camera.scale) * 0.1;

    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(camera.scale, camera.scale);
    ctx.translate(-camera.x, -camera.y);

    // ── 1. LE SOL (Herbe) ────────────────────────────────
    if (gameState.level.rooms) {
        const roomColors = {
            A: 'rgba(46, 204, 113, 0.15)', // Légère teinte pour différencier les zones
            B: 'rgba(52, 152, 219, 0.15)',  
            C: 'rgba(230, 126, 34, 0.15)',  
            D: 'rgba(231, 76, 60, 0.15)'    
        };
        const roomLabels = { A: '🏠 SPAWN', B: '🔵 TAMPON', C: '🟠 VERROU', D: '🚪 SORTIE' };
        
        for (const [key, room] of Object.entries(gameState.level.rooms)) {
            // Dessin de l'herbe pavée
            let hasTexture = drawWorldTiled(ctx, textures.herbe, room.x, room.y, room.w, room.h, 64);
            
            // Teinte par-dessus et texte
            ctx.fillStyle = hasTexture ? roomColors[key] : roomColors[key].replace('0.15', '0.07');
            ctx.fillRect(room.x, room.y, room.w, room.h);
            ctx.fillStyle = roomColors[key].replace('0.15', '0.4');
            ctx.font = 'bold 28px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(roomLabels[key], room.x + room.w / 2, room.y + 60);
        }
    }

    // ── 2. SORTIE ──────────────────────────────────────────────────
    let exitR = gameState.level.exit.r || 30;
    ctx.save();
    if (gameState.level.exit.active) {
        ctx.shadowColor = '#2ecc71';
        ctx.shadowBlur  = 30;
    } else {
        ctx.globalAlpha = 0.5; // Grisée si inactive
    }
    
    let isExitDrawn = drawAnimatedCenter(ctx, textures.sortie, gameState.level.exit.x, gameState.level.exit.y, exitR * 2.5, 150);
    
    if (!isExitDrawn) {
        ctx.fillStyle = gameState.level.exit.active ? '#2ecc71' : '#7f8c8d';
        ctx.beginPath();
        ctx.arc(gameState.level.exit.x, gameState.level.exit.y, exitR, 0, Math.PI*2);
        ctx.fill();
    }
    ctx.restore();
    
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('SORTIE', gameState.level.exit.x, gameState.level.exit.y + 8);

    // ── 3. BOUTONS ──────────────────────────────────────────────────
    for(let b of gameState.level.buttons) {
        ctx.fillStyle = b.pressed ? '#2ecc71' : b.color;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.stroke();
        ctx.fillStyle = '#000'; ctx.font = 'bold 20px Arial';
        if(b.reqShape) ctx.fillText(b.reqShape.substring(0,3).toUpperCase(), b.x-18, b.y+7);
        else if(b.reqCount) ctx.fillText(b.currentCount + '/' + b.reqCount, b.x-15, b.y+7);
    }

    // ── 4. PIÈCES ──────────────────────────────────────────────────
    for(let c of gameState.level.coins) {
        if(!c.collected) {
            let isDrawn = drawAnimatedCenter(ctx, textures.piece, c.x, c.y, 32, 100);
            if (!isDrawn) {
                ctx.fillStyle = '#f1c40f'; ctx.beginPath(); ctx.arc(c.x, c.y, 15, 0, Math.PI*2);
                ctx.fill(); ctx.strokeStyle = '#f39c12'; ctx.lineWidth = 3; ctx.stroke();
            }
        }
    }

    // ── 5. JOUEURS ──────────────────────────────────────────────────
    for (const id in gameState.players) {
        const player = gameState.players[id];
        ctx.save();
        ctx.translate(player.x, player.y);
        
        ctx.fillStyle = '#fff'; ctx.font = 'bold 24px Arial'; ctx.textAlign = 'center';
        ctx.lineWidth = 4; ctx.strokeStyle = '#000';
        ctx.strokeText(player.pseudo, 0, -35); ctx.fillText(player.pseudo, 0, -35);
        
        ctx.fillStyle = player.color;
        if(player.actionBlink > 0) { ctx.shadowColor = '#fff'; ctx.shadowBlur = Math.min(20, player.actionBlink * 3); }

        if (player.shape === 'square') ctx.fillRect(-20, -20, 40, 40);
        else if (player.shape === 'triangle') { ctx.beginPath(); ctx.moveTo(0, -20); ctx.lineTo(20, 20); ctx.lineTo(-20, 20); ctx.closePath(); ctx.fill(); }
        else if (player.shape === 'cross') { ctx.fillRect(-20, -6, 40, 12); ctx.fillRect(-6, -20, 12, 40); }
        else if (player.shape === 'circle') { ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI*2); ctx.fill(); }
        else if (player.shape === 'star') {
            ctx.beginPath();
            for(let i=0; i<5; i++) {
                ctx.lineTo(Math.cos((18+i*72)/180*Math.PI)*20, -Math.sin((18+i*72)/180*Math.PI)*20);
                ctx.lineTo(Math.cos((54+i*72)/180*Math.PI)*10, -Math.sin((54+i*72)/180*Math.PI)*10);
            }
            ctx.closePath(); ctx.fill();
        }

        ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(-6, -4, 3, 0, Math.PI*2); ctx.arc(6, -4, 3, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = '#111'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 4, 6, 0.2, Math.PI - 0.2); ctx.stroke();
        ctx.restore();
    }

    // ── 6. BROUILLARD (Fog of War) ──────────────────────────────────
    if(fogCanvas.width !== canvas.width || fogCanvas.height !== canvas.height) {
        fogCanvas.width = canvas.width; fogCanvas.height = canvas.height;
    }
    
    fogCtx.globalCompositeOperation = 'source-over';
    fogCtx.clearRect(0,0, fogCanvas.width, fogCanvas.height);
    fogCtx.fillStyle = '#050510'; 
    fogCtx.fillRect(0, 0, fogCanvas.width, fogCanvas.height);
    
    fogCtx.globalCompositeOperation = 'destination-out';
    
    let segments = [];
    let mapBox = [
        {x:0,y:0}, {x:gameState.level.width, y:0},
        {x:gameState.level.width, y:gameState.level.height}, {x:0, y:gameState.level.height}
    ];
    segments.push({a: mapBox[0], b: mapBox[1]}); segments.push({a: mapBox[1], b: mapBox[2]});
    segments.push({a: mapBox[2], b: mapBox[3]}); segments.push({a: mapBox[3], b: mapBox[0]});

    const allBlocks = gameState.level.walls.concat(gameState.level.doors.filter(d=>!d.open));
    for(let w of allBlocks) {
        segments.push({a:{x:w.x, y:w.y}, b:{x:w.x+w.w, y:w.y}});
        segments.push({a:{x:w.x+w.w, y:w.y}, b:{x:w.x+w.w, y:w.y+w.h}});
        segments.push({a:{x:w.x+w.w, y:w.y+w.h}, b:{x:w.x, y:w.y+w.h}});
        segments.push({a:{x:w.x, y:w.y+w.h}, b:{x:w.x, y:w.y}});
    }

    for (const id in gameState.players) {
        let p = gameState.players[id];
        let poly = calculateVisibilityPolygon({x: p.x, y: p.y}, segments);
        if(poly.length > 0) {
            fogCtx.save();
            fogCtx.translate(canvas.width / 2, canvas.height / 2);
            fogCtx.scale(camera.scale, camera.scale);
            fogCtx.translate(-camera.x, -camera.y);
            
            fogCtx.beginPath(); fogCtx.moveTo(poly[0].x, poly[0].y);
            for(let i=1; i<poly.length; i++) fogCtx.lineTo(poly[i].x, poly[i].y);
            fogCtx.closePath();
            
            let limitRadius = 250;
            let gradient = fogCtx.createRadialGradient(p.x, p.y, limitRadius * 0.2, p.x, p.y, limitRadius);
            gradient.addColorStop(0, 'rgba(0,0,0,1)');
            gradient.addColorStop(0.8, 'rgba(0,0,0,0.3)');
            gradient.addColorStop(1, 'rgba(0,0,0,0)');
            
            fogCtx.fillStyle = gradient; fogCtx.fill(); fogCtx.restore();
        }
    }

    ctx.restore(); 
    ctx.globalAlpha = 1.0;
    ctx.drawImage(fogCanvas, 0, 0);
    
    // ── 7. MURS, PORTES ET PIÈGES (Dessinés par dessus le brouillard) ──
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(camera.scale, camera.scale);
    ctx.translate(-camera.x, -camera.y);
    
    // Murs
    for(let w of gameState.level.walls) {
        const isMaze = Math.min(w.w, w.h) <= 22;
        
        let hasTex = drawWorldTiled(ctx, textures.feuille, w.x, w.y, w.w, w.h, 64);
        
        // Assombrissement pour garder le côté "Labyrinthe"
        ctx.fillStyle = hasTex ? (isMaze ? 'rgba(42, 42, 58, 0.4)' : 'rgba(13, 13, 20, 0.4)') : (isMaze ? '#2a2a3a' : '#0d0d14');
        ctx.fillRect(w.x, w.y, w.w, w.h);
        
        ctx.strokeStyle = isMaze ? '#3a3a55' : '#00ffcc';
        ctx.lineWidth = isMaze ? 0.5 : 1.5;
        ctx.strokeRect(w.x, w.y, w.w, w.h);
    }

    // Portes
    for(let d of gameState.level.doors) {
        if(!d.open) {
            const btn = gameState.level.buttons ? gameState.level.buttons.find(b => b.id === d.linkedButton) : null;
            const dCol = btn ? btn.color : '#e74c3c';
            ctx.fillStyle = dCol + 'cc'; ctx.fillRect(d.x, d.y, d.w, d.h);
            ctx.strokeStyle = dCol; ctx.lineWidth = 2; ctx.strokeRect(d.x, d.y, d.w, d.h);
            ctx.fillStyle = '#fff'; ctx.font = 'bold 20px Arial'; ctx.textAlign = 'center';
            ctx.fillText('🔒', d.x + d.w / 2, d.y + d.h / 2 + 7);
        } else {
            ctx.strokeStyle = '#2ecc71'; ctx.lineWidth = 2; ctx.setLineDash([8, 6]);
            ctx.strokeRect(d.x, d.y, d.w, d.h); ctx.setLineDash([]);
        }
    }

    // Pièges
    if (gameState.level.traps) {
        for(let t of gameState.level.traps) {
            let isHorizontal = t.w > t.h;
            let img = isHorizontal ? textures.pikkux : textures.pikkuy;
            
            let isDrawn = drawTrapTexture(ctx, img, t.x, t.y, t.w, t.h, isHorizontal);
            if (!isDrawn) {
                ctx.fillStyle = '#e74c3c'; 
                ctx.fillRect(t.x, t.y, t.w, t.h);
            }
        }
    }

    ctx.restore();
    
    // ── 8. INTERFACE (UI) ──────────────────────────────────────────────
    ctx.fillStyle = '#fff'; ctx.font = 'bold 24px Arial'; ctx.textAlign = 'left';
    ctx.fillText(`Joueurs: ${pCount}`, 20, 40);

    if(gameState.status === 'starting') {
        ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#f1c40f'; ctx.font = 'bold 120px Arial'; ctx.textAlign = 'center';
        ctx.fillText(gameState.countdown, canvas.width/2, canvas.height/2);
    } else if(gameState.timeLeft !== undefined) {
        let mins = Math.floor(gameState.timeLeft / 60); let secs = gameState.timeLeft % 60;
        let timeStr = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
        
        ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath();
        ctx.roundRect(canvas.width/2 - 80, 10, 160, 60, 20); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = 'bold 36px Arial'; ctx.textAlign = 'center';
        ctx.fillText(timeStr, canvas.width / 2, 52);
    }
    
    if(gameState.status === 'playing' && gameState.level.quests) {
        let isUnderUI = false;
        for (const id in gameState.players) {
            let p = gameState.players[id];
            let sx = (p.x - camera.x) * camera.scale + canvas.width / 2;
            let sy = (p.y - camera.y) * camera.scale + canvas.height / 2;
            if (sx > 10 && sx < 430 && sy > 50 && sy < 270) { isUnderUI = true; break; }
        }
        
        let alpha = isUnderUI ? 0.2 : 0.8;
        ctx.fillStyle = `rgba(20, 20, 25, ${alpha})`; ctx.beginPath();
        ctx.roundRect(20, 60, 400, 200, 15); ctx.fill();
        ctx.globalAlpha = isUnderUI ? 0.3 : 1.0;
        ctx.strokeStyle = '#2ecc71'; ctx.lineWidth = 2; ctx.stroke();

        ctx.fillStyle = '#f1c40f'; ctx.font = 'bold 20px Arial'; ctx.textAlign = 'left';
        ctx.fillText('🏆 Quêtes & Objectifs', 40, 95);

        ctx.font = 'bold 16px Arial';
        let y = 135;
        for(let q of gameState.level.quests) {
            ctx.fillStyle = q.done ? '#2ecc71' : '#fff';
            ctx.fillText((q.done ? '✅ ' : '⬜ ') + q.text, 40, y);
            y += 35;
        }
        ctx.globalAlpha = 1.0; 
    }
    
    if (gameState.status === 'defeat') {
        ctx.fillStyle = 'rgba(231, 76, 60, 0.8)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 80px Arial'; ctx.textAlign = 'center';
        ctx.fillText('TEMPS ÉCOULÉ', canvas.width / 2, canvas.height / 2);
    }
    
    requestAnimationFrame(draw);
}

draw();
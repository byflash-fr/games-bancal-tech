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


const backgroundMusic = new Audio('/assets/son/music.mp3');
backgroundMusic.loop = true;
backgroundMusic.preload = 'auto';
backgroundMusic.volume = 0.35;
const walkingSound = new Audio('/assets/son/marche.mp3');
walkingSound.loop = true;
walkingSound.preload = 'auto';
walkingSound.volume = 0.4;


// --- Chargement des Textures ---
const herbeImg = new Image();
herbeImg.src = '/assets/images/herbe.png';
let herbePattern = null;
herbeImg.onload = () => { herbePattern = ctx.createPattern(herbeImg, 'repeat'); };

const murImg = new Image();
murImg.src = '/assets/images/feuille.png';
let murPattern = null;
murImg.onload = () => { murPattern = ctx.createPattern(murImg, 'repeat'); };

const coinImg = new Image();
coinImg.src = '/assets/images/piece.png';

const sortieImg = new Image();
sortieImg.src = '/assets/images/sortie.png';

const pikkuxImg = new Image();
pikkuxImg.src = '/assets/images/pikkux.png';

const pikkuyImg = new Image();
pikkuyImg.src = '/assets/images/pikkuy.png';
// --------------------------------


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

socket.on('stateUpdate', (state) => {
    gameState = state;
    
    if (state.status === 'lobby' || state.status === 'defeat') {
        if (lobbyUI) lobbyUI.style.display = 'flex';
        if (victoryUI) victoryUI.style.display = 'none';
        if (pCountSpan) pCountSpan.innerText = Object.keys(state.players).length;

        if (gameCodeDisplay) gameCodeDisplay.innerText = state.code;
        
        if (playersList) {
            playersList.innerHTML = '';
            for(let id in state.players) {
                let p = state.players[id];
                playersList.innerHTML += `<li style="margin-bottom: 10px; display: flex; align-items: center;"><span style="display:inline-block; width:20px; height:20px; background:${p.color}; border-radius:50%; margin-right:15px; border:2px solid white;"></span>${p.pseudo}</li>`;
            }
        }
        
        if (state.qrCodeDataUrl && qrCodeImg.src !== state.qrCodeDataUrl) {
            joinUrlText.innerText = state.joinUrl;
            qrCodeImg.src = state.qrCodeDataUrl;
            qrCodeImg.style.display = 'block';
        }
    } else if (state.status === 'victory') {
        if (lobbyUI) lobbyUI.style.display = 'none';
        if (victoryUI) victoryUI.style.display = 'flex';
    } else {
        if (lobbyUI) lobbyUI.style.display = 'none';
        if (victoryUI) victoryUI.style.display = 'none';
    }
});


function startGame() {
    tryPlayBackgroundMusic();
    socket.emit('startGame');
}

function getIntersection(ray, segment) {
    const r_px = ray.a.x;
    const r_py = ray.a.y;
    const r_dx = ray.b.x - ray.a.x;
    const r_dy = ray.b.y - ray.a.y;
    const s_px = segment.a.x;
    const s_py = segment.a.y;
    const s_dx = segment.b.x - segment.a.x;
    const s_dy = segment.b.y - segment.a.y;

    if (r_dx * s_dy === r_dy * s_dx) return null; 

    const T2 = (r_dx * (s_py - r_py) + r_dy * (r_px - s_px)) / (s_dx * r_dy - s_dy * r_dx);
    const T1 = (s_px + s_dx * T2 - r_px) / r_dx;

    if (T1 > 0 && T2 >= 0 && T2 <= 1) {
        return {
            x: r_px + r_dx * T1,
            y: r_py + r_dy * T1,
            param: T1
        };
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

let camera = { x: 0, y: 0, scale: 1 };
const fogCanvas = document.createElement('canvas');
const fogCtx = fogCanvas.getContext('2d', { willReadFrequently: true });

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

    // ── Fonds des salles (Sol) ────────────────────────────────
    if (gameState.level.rooms) {
        const roomColors = {
            A: 'rgba(46, 204, 113, 0.07)',  
            B: 'rgba(52, 152, 219, 0.07)',  
            C: 'rgba(230, 126, 34, 0.07)',  
            D: 'rgba(231, 76, 60, 0.07)'    
        };
        const roomLabels = {
            A: '🏠 SPAWN',
            B: '🔵 TAMPON',
            C: '🟠 VERROU',
            D: '🚪 SORTIE'
        };
        for (const [key, room] of Object.entries(gameState.level.rooms)) {
            if (herbePattern) {
                ctx.fillStyle = herbePattern;
                ctx.fillRect(room.x, room.y, room.w, room.h);
            }
            ctx.fillStyle = roomColors[key];
            ctx.fillRect(room.x, room.y, room.w, room.h);
            ctx.fillStyle = roomColors[key].replace('0.07', '0.25');
            ctx.font = 'bold 28px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(roomLabels[key], room.x + room.w / 2, room.y + 60);
        }
    }

    // Grille subtile
    ctx.strokeStyle = '#1e1e28';
    ctx.lineWidth = 1;
    const gridStep = 100;
    for(let i=0; i<=gameState.level.width; i+=gridStep) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, gameState.level.height); ctx.stroke();
    }
    for(let i=0; i<=gameState.level.height; i+=gridStep) {
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(gameState.level.width, i); ctx.stroke();
    }

    // ── Sortie ──────────────────────────────────────────────────
    if (sortieImg.complete && sortieImg.width > 0) {
        let frames = Math.max(1, Math.floor(sortieImg.width / sortieImg.height));
        let fIndex = Math.floor(Date.now() / 150) % frames; 
        let frameW = sortieImg.width / frames;
        let frameH = sortieImg.height;
        
        let r = gameState.level.exit.r || 30;
        let drawSize = r * 2.5; 
        
        ctx.save();
        if (gameState.level.exit.active) {
            ctx.shadowColor = '#2ecc71';
            ctx.shadowBlur  = 30;
        } else {
            ctx.globalAlpha = 0.5; 
        }
        ctx.drawImage(sortieImg, fIndex * frameW, 0, frameW, frameH, gameState.level.exit.x - drawSize/2, gameState.level.exit.y - drawSize/2, drawSize, drawSize);
        ctx.restore();
        
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 22px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('SORTIE', gameState.level.exit.x, gameState.level.exit.y + 8);
    } else {
        const exitGlow = gameState.level.exit.active ? '#2ecc71' : '#7f8c8d';
        if (gameState.level.exit.active) {
            ctx.shadowColor = '#2ecc71';
            ctx.shadowBlur  = 30;
        }
        ctx.fillStyle = exitGlow;
        ctx.beginPath();
        ctx.arc(gameState.level.exit.x, gameState.level.exit.y, gameState.level.exit.r, 0, Math.PI*2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 22px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('SORTIE', gameState.level.exit.x, gameState.level.exit.y + 8);
    }


    // ── Boutons ──────────────────────────────────────────────────
    for(let b of gameState.level.buttons) {
        ctx.fillStyle = b.pressed ? '#2ecc71' : b.color;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI*2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 4;
        ctx.stroke();

        ctx.fillStyle = '#000';
        ctx.font = 'bold 20px Arial';
        if(b.reqShape) {
            ctx.fillText(b.reqShape.substring(0,3).toUpperCase(), b.x-18, b.y+7);
        } else if(b.reqCount) {
            ctx.fillText(b.currentCount + '/' + b.reqCount, b.x-15, b.y+7);
        }
    }

    // ── Pièces (Coins) ──────────────────────────────────────────────────
    for(let c of gameState.level.coins) {
        if(!c.collected) {
            if (coinImg.complete && coinImg.width > 0) {
                let frames = Math.max(1, Math.floor(coinImg.width / coinImg.height)); 
                let fIndex = Math.floor(Date.now() / 100) % frames;
                let frameW = coinImg.width / frames; 
                let frameH = coinImg.height;
                let drawW = 32; 
                let drawH = 32;
                ctx.drawImage(coinImg, fIndex * frameW, 0, frameW, frameH, c.x - drawW/2, c.y - drawH/2, drawW, drawH);
            } else {
                ctx.fillStyle = '#f1c40f';
                ctx.beginPath();
                ctx.arc(c.x, c.y, 15, 0, Math.PI*2);
                ctx.fill();
                ctx.strokeStyle = '#f39c12';
                ctx.lineWidth = 3;
                ctx.stroke();
            }
        }
    }

    // ── Joueurs ──────────────────────────────────────────────────
    for (const id in gameState.players) {
        const player = gameState.players[id];
        ctx.save();
        ctx.translate(player.x, player.y);
        
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#000';
        ctx.strokeText(player.pseudo, 0, -35);
        ctx.fillText(player.pseudo, 0, -35);
        
        ctx.fillStyle = player.color;
        if(player.actionBlink > 0) {
            ctx.shadowColor = '#fff';
            ctx.shadowBlur = Math.min(20, player.actionBlink * 3);
        }

        if (player.shape === 'square') {
            ctx.fillRect(-20, -20, 40, 40);
        } else if (player.shape === 'triangle') {
            ctx.beginPath(); ctx.moveTo(0, -20); ctx.lineTo(20, 20); ctx.lineTo(-20, 20); ctx.closePath(); ctx.fill();
        } else if (player.shape === 'cross') {
            ctx.fillRect(-20, -6, 40, 12); ctx.fillRect(-6, -20, 12, 40);
        } else if (player.shape === 'circle') {
            ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI*2); ctx.fill();
        } else if (player.shape === 'star') {
            ctx.beginPath();
            for(let i=0; i<5; i++) {
                ctx.lineTo(Math.cos((18+i*72)/180*Math.PI)*20, -Math.sin((18+i*72)/180*Math.PI)*20);
                ctx.lineTo(Math.cos((54+i*72)/180*Math.PI)*10, -Math.sin((54+i*72)/180*Math.PI)*10);
            }
            ctx.closePath(); ctx.fill();
        }

        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.arc(-6, -4, 3, 0, Math.PI*2);
        ctx.arc(6, -4, 3, 0, Math.PI*2);
        ctx.fill();
        
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 4, 6, 0.2, Math.PI - 0.2);
        ctx.stroke();

        ctx.restore();
    }

    if(fogCanvas.width !== canvas.width || fogCanvas.height !== canvas.height) {
        fogCanvas.width = canvas.width;
        fogCanvas.height = canvas.height;
    }
    
    // ── Brouillard ──────────────────────────────────────────────────
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
    segments.push({a: mapBox[0], b: mapBox[1]});
    segments.push({a: mapBox[1], b: mapBox[2]});
    segments.push({a: mapBox[2], b: mapBox[3]});
    segments.push({a: mapBox[3], b: mapBox[0]});

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
            
            fogCtx.beginPath();
            fogCtx.moveTo(poly[0].x, poly[0].y);
            for(let i=1; i<poly.length; i++) {
                fogCtx.lineTo(poly[i].x, poly[i].y);
            }
            fogCtx.closePath();
            
            let limitRadius = 250;
            let gradient = fogCtx.createRadialGradient(p.x, p.y, limitRadius * 0.2, p.x, p.y, limitRadius);
            gradient.addColorStop(0, 'rgba(0,0,0,1)');
            gradient.addColorStop(0.8, 'rgba(0,0,0,0.3)');
            gradient.addColorStop(1, 'rgba(0,0,0,0)');
            
            fogCtx.fillStyle = gradient;
            fogCtx.fill();
            fogCtx.restore();
        }
    }

    ctx.restore(); 
    ctx.globalAlpha = 1.0;
    ctx.drawImage(fogCanvas, 0, 0);
    
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(camera.scale, camera.scale);
    ctx.translate(-camera.x, -camera.y);
    
    // ── Murs ──────────────────────────────────────────────────
    for(let w of gameState.level.walls) {
        const isMaze = Math.min(w.w, w.h) <= 22;
        
        if (murPattern) {
            ctx.fillStyle = murPattern;
            ctx.fillRect(w.x, w.y, w.w, w.h);
            // Ajoute un léger voile pour différencier les murs fins des bordures
            ctx.fillStyle = isMaze ? 'rgba(42, 42, 58, 0.4)' : 'rgba(13, 13, 20, 0.4)';
            ctx.fillRect(w.x, w.y, w.w, w.h);
        } else {
            ctx.fillStyle = isMaze ? '#2a2a3a' : '#0d0d14';
            ctx.fillRect(w.x, w.y, w.w, w.h);
        }
        
        ctx.strokeStyle = isMaze ? '#3a3a55' : '#00ffcc';
        ctx.lineWidth = isMaze ? 0.5 : 1.5;
        ctx.strokeRect(w.x, w.y, w.w, w.h);
    }

    // ── Portes ──────────────────────────────────────────────────
    for(let d of gameState.level.doors) {
        if(!d.open) {
            const btn = gameState.level.buttons ? gameState.level.buttons.find(b => b.id === d.linkedButton) : null;
            const dCol = btn ? btn.color : '#e74c3c';
            ctx.fillStyle = dCol + 'cc';
            ctx.fillRect(d.x, d.y, d.w, d.h);
            ctx.strokeStyle = dCol;
            ctx.lineWidth = 2;
            ctx.strokeRect(d.x, d.y, d.w, d.h);
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 20px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('🔒', d.x + d.w / 2, d.y + d.h / 2 + 7);
        } else {
            ctx.strokeStyle = '#2ecc71';
            ctx.lineWidth = 2;
            ctx.setLineDash([8, 6]);
            ctx.strokeRect(d.x, d.y, d.w, d.h);
            ctx.setLineDash([]);
        }
    }

    // ── Pièges ──────────────────────────────────────────────────
    if (gameState.level.traps) {
        for(let t of gameState.level.traps) {
            let img = t.w > t.h ? pikkuxImg : pikkuyImg;
            if (img.complete && img.width > 0) {
                let frames = Math.max(1, Math.floor(img.width / img.height));
                let fIndex = Math.floor(Date.now() / 100) % frames;
                let frameW = img.width / frames;
                let frameH = img.height;
                
                ctx.save();
                ctx.beginPath();
                ctx.rect(t.x, t.y, t.w, t.h);
                ctx.clip(); // On empêche le dessin de déborder du rectangle du piège
                
                if (t.w > t.h) {
                    // Piège horizontal (pikkux) : on le répète (tile) sur la largeur
                    let ratio = t.h / frameH;
                    let drawW = frameW * ratio;
                    let drawH = t.h;
                    for(let px = 0; px < t.w; px += drawW) {
                        ctx.drawImage(img, fIndex * frameW, 0, frameW, frameH, t.x + px, t.y, drawW, drawH);
                    }
                } else {
                    // Piège vertical (pikkuy) : on le répète (tile) sur la hauteur
                    let ratio = t.w / frameW;
                    let drawW = t.w;
                    let drawH = frameH * ratio;
                    for(let py = 0; py < t.h; py += drawH) {
                        ctx.drawImage(img, fIndex * frameW, 0, frameW, frameH, t.x, t.y + py, drawW, drawH);
                    }
                }
                ctx.restore();
            } else {
                ctx.fillStyle = '#e74c3c'; // Rouge par défaut
                ctx.fillRect(t.x, t.y, t.w, t.h);
            }
        }
    }

    ctx.restore();
    
    // ── UI et HUD ──────────────────────────────────────────────────
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(`Joueurs: ${pCount}`, 20, 40);

    if(gameState.status === 'starting') {
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#f1c40f';
        ctx.font = 'bold 120px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(gameState.countdown, canvas.width/2, canvas.height/2);
    } else if(gameState.timeLeft !== undefined) {
        let mins = Math.floor(gameState.timeLeft / 60);
        let secs = gameState.timeLeft % 60;
        let timeStr = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
        
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.beginPath();
        let tw = 160;
        ctx.roundRect(canvas.width/2 - tw/2, 10, tw, 60, 20);
        ctx.fill();
        
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 36px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(timeStr, canvas.width / 2, 52);
    }
    
    if(gameState.status === 'playing' && gameState.level.quests) {
        let isUnderUI = false;
        for (const id in gameState.players) {
            let p = gameState.players[id];
            let sx = (p.x - camera.x) * camera.scale + canvas.width / 2;
            let sy = (p.y - camera.y) * camera.scale + canvas.height / 2;
            if (sx > 10 && sx < 430 && sy > 50 && sy < 270) {
                isUnderUI = true;
                break;
            }
        }
        
        let alpha = isUnderUI ? 0.2 : 0.8;
        
        ctx.fillStyle = `rgba(20, 20, 25, ${alpha})`;
        ctx.beginPath();
        ctx.roundRect(20, 60, 400, 200, 15);
        ctx.fill();
        
        ctx.globalAlpha = isUnderUI ? 0.3 : 1.0;
        ctx.strokeStyle = '#2ecc71';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#f1c40f';
        ctx.font = 'bold 20px Arial';
        ctx.textAlign = 'left';
        ctx.fillText('🏆 Quêtes & Objectifs', 40, 95);

        ctx.font = 'bold 16px Arial';
        let y = 135;
        for(let q of gameState.level.quests) {
            if(q.done) {
                ctx.fillStyle = '#2ecc71';
                ctx.fillText('✅ ' + q.text, 40, y);
            } else {
                ctx.fillStyle = '#fff';
                ctx.fillText('⬜ ' + q.text, 40, y);
            }
            y += 35;
        }
        ctx.globalAlpha = 1.0; // reset
    }
    
    if (gameState.status === 'defeat') {
        ctx.fillStyle = 'rgba(231, 76, 60, 0.8)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 80px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('TEMPS ÉCOULÉ', canvas.width / 2, canvas.height / 2);
    }
    
    requestAnimationFrame(draw);
}

draw();
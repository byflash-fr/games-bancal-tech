// ============================================================
// Bancal — Main Renderer  (index.html)
// ============================================================
const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');

canvas.width  = window.innerWidth;
canvas.height = window.innerHeight;
window.addEventListener('resize', () => {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
});

let gameState = { players:{}, level:null, status:'lobby', timeLeft:480, questProgress:0 };
let skinRevealTimer = 0; // countdown ms

socket.emit('register', 'observer');

// ---- UI references ----
const lobbyUI    = document.getElementById('lobby-ui');
const pCountSpan = document.getElementById('player-count');
const joinUrlText= document.getElementById('join-url-text');
const qrCodeImg  = document.getElementById('qr-code-img');

socket.on('stateUpdate', state => {
    const wasPlaying = gameState.status === 'playing';
    gameState = state;

    if(state.status !== 'playing' && state.status !== 'skinReveal') {
        if(lobbyUI) lobbyUI.style.display = 'block';
        if(pCountSpan) pCountSpan.innerText = Object.keys(state.players).length;
        if(state.qrCodeDataUrl && qrCodeImg.src !== state.qrCodeDataUrl) {
            joinUrlText.innerText = state.joinUrl;
            qrCodeImg.src = state.qrCodeDataUrl;
            qrCodeImg.style.display = 'block';
        }
    } else {
        if(lobbyUI) lobbyUI.style.display = 'none';
    }
});

function startGame() { socket.emit('startGame'); }

// -----------------------------------------------------------
// Camera
// -----------------------------------------------------------
let camera = { x:0, y:0 };

// -----------------------------------------------------------
// Fog of War helpers (ray-casting)
// -----------------------------------------------------------
const fogCanvas = document.createElement('canvas');
const fogCtx    = fogCanvas.getContext('2d');

function getIntersection(ray, seg) {
    const rdx = ray.b.x - ray.a.x, rdy = ray.b.y - ray.a.y;
    const sdx = seg.b.x - seg.a.x, sdy = seg.b.y - seg.a.y;
    if(rdx*sdy === rdy*sdx) return null;
    const T2 = (rdx*(seg.a.y-ray.a.y) + rdy*(ray.a.x-seg.a.x)) / (sdx*rdy - sdy*rdx);
    const T1 = (seg.a.x + sdx*T2 - ray.a.x) / rdx;
    if(T1>0 && T2>=0 && T2<=1) return { x:ray.a.x+rdx*T1, y:ray.a.y+rdy*T1, param:T1 };
    return null;
}

function calcVisibility(origin, segments) {
    let pts = [];
    for(let s of segments) pts.push(s.a, s.b);

    let angles = [];
    for(let p of pts) {
        let a = Math.atan2(p.y-origin.y, p.x-origin.x);
        angles.push(a-0.0001, a, a+0.0001);
    }

    let hits = [];
    for(let a of angles) {
        const ray = { a:origin, b:{ x:origin.x+Math.cos(a)*4000, y:origin.y+Math.sin(a)*4000 } };
        let closest = null;
        for(let s of segments) {
            let h = getIntersection(ray, s);
            if(h && (!closest || h.param < closest.param)) closest = h;
        }
        if(closest) { closest.angle = a; hits.push(closest); }
    }
    hits.sort((a,b) => a.angle - b.angle);
    return hits;
}

// -----------------------------------------------------------
// Shape drawing
// -----------------------------------------------------------
function drawShape(c, shape, size, filled=true) {
    c.beginPath();
    switch(shape) {
        case 'square':
            if(filled) c.fillRect(-size,-size,size*2,size*2);
            else c.rect(-size,-size,size*2,size*2);
            break;
        case 'triangle':
            c.moveTo(0,-size); c.lineTo(size,size); c.lineTo(-size,size);
            c.closePath();
            if(filled) c.fill(); else c.stroke();
            break;
        case 'circle':
            c.arc(0,0,size,0,Math.PI*2);
            if(filled) c.fill(); else c.stroke();
            break;
        case 'cross':
            if(filled){
                c.fillRect(-size,-size*0.3,size*2,size*0.6);
                c.fillRect(-size*0.3,-size,size*0.6,size*2);
            } else {
                c.rect(-size,-size*0.3,size*2,size*0.6);
                c.rect(-size*0.3,-size,size*0.6,size*2);
            }
            break;
        case 'star':
            for(let i=0;i<5;i++){
                c.lineTo(Math.cos((18+i*72)/180*Math.PI)*size,-Math.sin((18+i*72)/180*Math.PI)*size);
                c.lineTo(Math.cos((54+i*72)/180*Math.PI)*size*0.5,-Math.sin((54+i*72)/180*Math.PI)*size*0.5);
            }
            c.closePath();
            if(filled) c.fill(); else c.stroke();
            break;
    }
}

// -----------------------------------------------------------
// Hat drawing  (origin = top-center of player body)
// -----------------------------------------------------------
function drawHat(c, hatType, s, playerColor) {
    // s = player radius ≈ 20
    c.save();
    switch(hatType) {
        case 'wizard':
            // Brim
            c.fillStyle = '#6c3483';
            c.fillRect(-s*1.1, -s*0.2, s*2.2, s*0.35);
            // Cone
            c.beginPath();
            c.moveTo(-s*0.5, -s*0.2);
            c.lineTo( s*0.5, -s*0.2);
            c.lineTo( 0, -s*2.2);
            c.closePath();
            c.fill();
            // Star
            c.font = `${Math.round(s*0.8)}px Arial`;
            c.textAlign = 'center';
            c.fillStyle = '#f1c40f';
            c.fillText('⭐', 0, -s*1.1);
            break;

        case 'crown':
            c.fillStyle = '#f1c40f';
            c.beginPath();
            c.moveTo(-s*0.9, -s*0.1);
            c.lineTo(-s*0.9, -s*1.1);
            c.lineTo(-s*0.4, -s*0.7);
            c.lineTo(0, -s*1.3);
            c.lineTo( s*0.4, -s*0.7);
            c.lineTo( s*0.9, -s*1.1);
            c.lineTo( s*0.9, -s*0.1);
            c.closePath();
            c.fill();
            c.strokeStyle = '#e67e22';
            c.lineWidth = 2;
            c.stroke();
            // Jewels
            c.fillStyle = '#e74c3c';
            c.beginPath(); c.arc(0, -s*0.85, s*0.18, 0, Math.PI*2); c.fill();
            break;

        case 'party':
            c.beginPath();
            const pg = c.createLinearGradient(-s*0.6,-s*2, s*0.6,-s*0.1);
            pg.addColorStop(0,'#e74c3c'); pg.addColorStop(0.33,'#f1c40f');
            pg.addColorStop(0.66,'#3498db'); pg.addColorStop(1,'#2ecc71');
            c.fillStyle = pg;
            c.moveTo(-s*0.7,-s*0.1); c.lineTo(s*0.7,-s*0.1); c.lineTo(0,-s*2.2);
            c.closePath(); c.fill();
            break;

        case 'tophat':
            c.fillStyle = '#1a1a1a';
            c.fillRect(-s*0.65,-s*1.7, s*1.3, s*1.4);
            c.fillRect(-s,     -s*0.3, s*2,   s*0.25);
            c.strokeStyle = '#444'; c.lineWidth = 2;
            c.strokeRect(-s*0.65,-s*1.7, s*1.3, s*1.4);
            // Red ribbon
            c.fillStyle = '#e74c3c';
            c.fillRect(-s*0.65, -s*0.5, s*1.3, s*0.15);
            break;

        case 'cowboy':
            c.fillStyle = '#8B4513';
            // Top
            c.beginPath();
            c.moveTo(-s*0.55,-s*0.2); c.lineTo(s*0.55,-s*0.2);
            c.lineTo(s*0.35,-s*1.5); c.lineTo(-s*0.35,-s*1.5);
            c.closePath(); c.fill();
            // Brim
            c.beginPath();
            c.moveTo(-s*1.2,-s*0.1); c.lineTo(s*1.2,-s*0.1);
            c.lineTo(s*0.65,-s*0.3); c.lineTo(-s*0.65,-s*0.3);
            c.closePath(); c.fill();
            break;

        case 'propeller':
            c.fillStyle = '#e74c3c';
            c.beginPath(); c.arc(0,-s*0.7, s*0.8, Math.PI,0); c.fill();
            // Stick
            c.fillStyle='#555'; c.fillRect(-s*0.07,-s*1.65, s*0.14, s*0.55);
            // Blades
            c.fillStyle='#3498db';
            for(let i=0;i<2;i++){
                c.save();
                c.rotate((i*Math.PI/2) + (Date.now()/200));
                c.beginPath();
                c.ellipse(s*0.35,-s*1.68, s*0.55, s*0.14, 0,0,Math.PI*2);
                c.fill();
                c.restore();
            }
            break;

        case 'chef':
            c.fillStyle='#f0f0f0';
            // Puff
            c.beginPath(); c.arc(-s*0.3,-s*1.2, s*0.5, 0,Math.PI*2); c.fill();
            c.beginPath(); c.arc( s*0.3,-s*1.2, s*0.5, 0,Math.PI*2); c.fill();
            c.beginPath(); c.arc(0,-s*1.3, s*0.55, 0,Math.PI*2); c.fill();
            // Band
            c.fillRect(-s*0.65,-s*0.4, s*1.3, s*0.35);
            c.strokeStyle='#ccc'; c.lineWidth=1;
            c.strokeRect(-s*0.65,-s*0.4, s*1.3, s*0.35);
            break;

        case 'cap':
            c.fillStyle = playerColor;
            c.beginPath(); c.arc(0,-s*0.75, s*0.85, Math.PI,0); c.fill();
            // Visor
            c.beginPath();
            c.moveTo(-s*0.2,-s*0.1); c.lineTo(s*1.2,-s*0.1);
            c.lineTo(s*1.25,-s*0.35); c.lineTo(-s*0.1,-s*0.35);
            c.closePath(); c.fill();
            // Logo dot
            c.fillStyle = '#fff';
            c.beginPath(); c.arc(0,-s*0.9, s*0.15,0,Math.PI*2); c.fill();
            break;

        case 'santa':
            c.fillStyle='#e74c3c';
            // White brim
            c.fillStyle='#fff'; c.fillRect(-s*0.9,-s*0.4, s*1.8, s*0.3);
            // Red cone
            c.fillStyle='#e74c3c';
            c.beginPath();
            c.moveTo(-s*0.8,-s*0.1); c.lineTo(s*0.8,-s*0.1);
            c.lineTo(s*0.1,-s*1.8); c.lineTo(-s*0.1,-s*1.8);
            c.closePath(); c.fill();
            // Pompom
            c.fillStyle='#fff';
            c.beginPath(); c.arc(0,-s*1.85, s*0.28,0,Math.PI*2); c.fill();
            break;

        case 'pirate':
            c.fillStyle='#2c3e50';
            c.beginPath();
            c.moveTo(-s*0.85,-s*0.15);
            c.lineTo( s*0.85,-s*0.15);
            c.lineTo( s*0.5, -s*1.3);
            c.lineTo( 0,     -s*1.4);
            c.lineTo(-s*0.5, -s*1.3);
            c.closePath(); c.fill();
            // Skull badge
            c.font = `${Math.round(s*0.65)}px Arial`;
            c.textAlign='center'; c.fillStyle='#fff';
            c.fillText('☠', 0, -s*0.65);
            break;
    }
    c.restore();
}

// -----------------------------------------------------------
// Draw player (shape + face + hat)
// -----------------------------------------------------------
function drawPlayer(c, player, alpha=1) {
    c.save();
    c.globalAlpha = alpha;
    c.translate(player.x, player.y);

    // Glow on action blink
    if(player.actionBlink > 0) {
        c.shadowColor = '#fff';
        c.shadowBlur  = Math.min(25, player.actionBlink * 2);
    }

    // Body shape
    c.fillStyle = player.color;
    drawShape(c, player.shape, 20);

    // Eyes
    c.fillStyle = '#111';
    c.beginPath(); c.arc(-6,-4,3,0,Math.PI*2);
    c.arc( 6,-4,3,0,Math.PI*2); c.fill();
    // Smile
    c.strokeStyle='#111'; c.lineWidth=2;
    c.beginPath(); c.arc(0,4,6,0.2,Math.PI-0.2); c.stroke();

    // Hat  (drawn above the shape center)
    drawHat(c, player.hat, 20, player.color);

    c.restore();
}

// -----------------------------------------------------------
// Draw a shape symbol ON A BUTTON (visual hint)
// -----------------------------------------------------------
function drawButtonShape(c, shape, cx, cy, size) {
    c.save();
    c.translate(cx, cy);
    c.fillStyle = 'rgba(255,255,255,0.85)';
    c.strokeStyle = 'rgba(255,255,255,0.85)';
    c.lineWidth = 3;
    switch(shape) {
        case 'square':
            c.fillRect(-size,-size,size*2,size*2); break;
        case 'triangle':
            c.beginPath();
            c.moveTo(0,-size); c.lineTo(size,size); c.lineTo(-size,size);
            c.closePath(); c.fill(); break;
        case 'circle':
            c.beginPath(); c.arc(0,0,size,0,Math.PI*2); c.fill(); break;
        case 'cross':
            c.fillRect(-size,-size*0.3,size*2,size*0.6);
            c.fillRect(-size*0.3,-size,size*0.6,size*2); break;
        case 'star':
            c.beginPath();
            for(let i=0;i<5;i++){
                c.lineTo(Math.cos((18+i*72)/180*Math.PI)*size,-Math.sin((18+i*72)/180*Math.PI)*size);
                c.lineTo(Math.cos((54+i*72)/180*Math.PI)*size*0.5,-Math.sin((54+i*72)/180*Math.PI)*size*0.5);
            }
            c.closePath(); c.fill(); break;
    }
    c.restore();
}

// -----------------------------------------------------------
// SKIN REVEAL screen
// -----------------------------------------------------------
let revealProgress = 0; // 0 = started, grows to 1

function drawSkinReveal(c, state) {
    const W = canvas.width, H = canvas.height;
    const players = Object.values(state.players);
    revealProgress = Math.min(1, revealProgress + 0.01);

    // Background
    const bg = c.createRadialGradient(W/2,H/2, 0, W/2,H/2, Math.max(W,H));
    bg.addColorStop(0,'#1a1230'); bg.addColorStop(1,'#06060e');
    c.fillStyle = bg;
    c.fillRect(0,0,W,H);

    // Animated star particles
    c.save();
    for(let i=0;i<60;i++){
        const seed = i * 2.399;
        const px = ((Math.sin(seed + Date.now()*0.0003)*0.5+0.5) * W);
        const py = ((Math.cos(seed * 1.3 + Date.now()*0.0002)*0.5+0.5) * H);
        const r  = 1 + Math.sin(Date.now()*0.002 + i)*0.7;
        c.fillStyle = `rgba(255,255,255,${0.3 + Math.sin(Date.now()*0.003+i)*0.2})`;
        c.beginPath(); c.arc(px,py,r,0,Math.PI*2); c.fill();
    }
    c.restore();

    // Title
    c.save();
    c.textAlign = 'center';
    c.font = `bold ${Math.round(H*0.075)}px 'Outfit', sans-serif`;
    c.fillStyle = '#fff';
    c.shadowColor = '#a855f7'; c.shadowBlur = 30;
    c.globalAlpha = revealProgress;
    c.fillText('🎮  VOTRE ÉQUIPE  🎮', W/2, H*0.12);
    c.restore();

    // Subtitle
    c.save();
    c.textAlign = 'center';
    c.font = `${Math.round(H*0.03)}px 'Outfit', sans-serif`;
    c.fillStyle = 'rgba(200,200,255,0.8)';
    c.globalAlpha = revealProgress;
    c.fillText('Mémorisez votre personnage — la partie commence dans quelques secondes !', W/2, H*0.18);
    c.restore();

    // Player cards
    const n = players.length;
    if(n === 0) return;

    const cols = Math.min(n, 5);
    const rows = Math.ceil(n / cols);
    const cardW = Math.min(180, (W * 0.9) / cols);
    const cardH = cardW * 1.4;
    const startX = W/2 - (cols * cardW)/2 + cardW/2;
    const startY = H*0.25 + cardH/2;

    players.forEach((player, idx) => {
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        const cx  = startX + col * cardW;
        const cy  = startY + row * (cardH + 20);

        const delay = idx * 0.08;
        const alpha = Math.max(0, Math.min(1, (revealProgress - delay) * 4));

        c.save();
        c.globalAlpha = alpha;
        c.translate(cx, cy);

        // Card background
        const grad = c.createLinearGradient(-cardW/2,-cardH/2,cardW/2,cardH/2);
        grad.addColorStop(0, hexToRgba(player.color, 0.25));
        grad.addColorStop(1, 'rgba(20,15,40,0.9)');
        c.fillStyle = grad;
        c.beginPath();
        c.roundRect(-cardW/2,-cardH/2,cardW,cardH,18);
        c.fill();
        // Card border
        c.strokeStyle = player.color;
        c.lineWidth = 2.5;
        c.stroke();
        // Glow
        c.shadowColor = player.color;
        c.shadowBlur  = 20;
        c.stroke();
        c.shadowBlur = 0;

        // Player preview (shape + hat)  — bigger for reveal
        const previewScale = Math.min(cardW*0.18, 35);
        c.save();
        c.translate(0, -cardH*0.08);
        c.fillStyle = player.color;
        drawShape(c, player.shape, previewScale);
        // Face (scaled)
        c.fillStyle = '#111';
        const ey = previewScale * 0.2;
        c.beginPath();
        c.arc(-previewScale*0.3, -ey, previewScale*0.13,0,Math.PI*2);
        c.arc( previewScale*0.3, -ey, previewScale*0.13,0,Math.PI*2);
        c.fill();
        c.strokeStyle='#111'; c.lineWidth=2;
        c.beginPath();
        c.arc(0, previewScale*0.2, previewScale*0.28, 0.2, Math.PI-0.2);
        c.stroke();
        drawHat(c, player.hat, previewScale, player.color);
        c.restore();

        // Player name + number
        c.textAlign = 'center';
        c.font = `bold ${Math.round(cardW*0.16)}px 'Outfit', sans-serif`;
        c.fillStyle = '#fff';
        c.fillText(player.name, 0, cardH*0.28);

        // Shape label chip
        const chipY = cardH*0.38;
        c.fillStyle = hexToRgba(player.color, 0.3);
        c.beginPath();
        c.roundRect(-cardW*0.42, chipY, cardW*0.84, cardH*0.12, 8);
        c.fill();
        c.font = `${Math.round(cardW*0.11)}px 'Outfit', sans-serif`;
        c.fillStyle = '#fff';
        const shapeEmoji = { square:'■', triangle:'▲', circle:'●', cross:'✚', star:'★' };
        c.fillText(`${shapeEmoji[player.shape] || ''} ${player.shape.toUpperCase()}`, 0, chipY + cardH*0.085);

        c.restore();
    });

    // Countdown bar at bottom
    c.save();
    const barW = W * 0.5;
    const barH = 12;
    const barX = W/2 - barW/2;
    const barY = H * 0.9;
    // Background
    c.fillStyle = 'rgba(255,255,255,0.1)';
    c.beginPath(); c.roundRect(barX, barY, barW, barH, 6); c.fill();
    // Fill (full initially then empties to 0) — driven by revealProgress not a real timer
    // We use Date to track: the server sends skinReveal for 5s
    const fill = Math.max(0, 1 - (revealProgress < 0.05 ? 0 : skinRevealTimer / 5000));
    const barGrad = c.createLinearGradient(barX, 0, barX+barW*fill, 0);
    barGrad.addColorStop(0, '#7c3aed');
    barGrad.addColorStop(1, '#06b6d4');
    c.fillStyle = barGrad;
    c.beginPath(); c.roundRect(barX, barY, barW*fill, barH, 6); c.fill();
    // Label
    c.textAlign='center'; c.font=`bold ${Math.round(H*0.025)}px 'Outfit', sans-serif`;
    c.fillStyle='rgba(200,200,255,0.9)';
    c.fillText('La partie commence…', W/2, barY+barH+22);
    c.restore();
}

let revealStartTime = null;
function hexToRgba(hex, a) {
    const r = parseInt(hex.slice(1,3),16);
    const g = parseInt(hex.slice(3,5),16);
    const b = parseInt(hex.slice(5,7),16);
    return `rgba(${r},${g},${b},${a})`;
}

// -----------------------------------------------------------
// Quest Panel (top-right of screen)
// -----------------------------------------------------------
function drawQuestPanel(c, state) {
    if(!state.level || !state.level.quests) return;
    const quests = state.level.quests;
    const pct    = state.questProgress || 0;

    const panelW = Math.min(420, canvas.width * 0.28);
    const lineH  = 28;
    const panelH = 72 + quests.length * lineH + 20;
    const px = canvas.width - panelW - 15;
    const py = 15;

    // Panel background
    c.save();
    c.fillStyle = 'rgba(10,8,25,0.88)';
    c.beginPath(); c.roundRect(px, py, panelW, panelH, 14); c.fill();
    c.strokeStyle = 'rgba(124,58,237,0.6)';
    c.lineWidth = 1.5;
    c.stroke();
    c.restore();

    // Header
    c.save();
    c.textAlign = 'left';
    c.font = `bold ${Math.round(panelW*0.08)}px 'Outfit', sans-serif`;
    c.fillStyle = '#f1c40f';
    c.fillText('🏆 QUÊTES', px+14, py+26);

    // Progress %
    c.textAlign = 'right';
    c.font = `bold ${Math.round(panelW*0.085)}px 'Outfit', sans-serif`;
    const pctColor = pct < 40 ? '#ef4444' : pct < 75 ? '#f59e0b' : '#10b981';
    c.fillStyle = pctColor;
    c.fillText(`${pct}%`, px+panelW-14, py+26);
    c.restore();

    // Progress bar
    const bx = px+14, by = py+34, bw = panelW-28, bh = 8;
    c.fillStyle = 'rgba(255,255,255,0.1)';
    c.beginPath(); c.roundRect(bx, by, bw, bh, 4); c.fill();
    const barGrad = c.createLinearGradient(bx, 0, bx+bw, 0);
    barGrad.addColorStop(0,'#7c3aed'); barGrad.addColorStop(0.5,'#06b6d4'); barGrad.addColorStop(1,'#10b981');
    c.fillStyle = barGrad;
    c.beginPath(); c.roundRect(bx, by, bw * (pct/100), bh, 4); c.fill();

    // Quest list
    let qy = py + 58;
    for(let q of quests) {
        c.save();
        c.font = `${Math.round(panelW*0.063)}px 'Outfit', sans-serif`;
        let icon = q.done ? '✅' : '⬜';
        let color= q.done ? '#10b981' : '#e2e8f0';
        let text = q.title;

        // Extra info for collect/coop/sequence
        if(q.type==='collect')  text += ` (${q.count}/${q.total})`;
        if(q.type==='coop')     text += ` (${q.count||0}/${q.needed})`;
        if(q.type==='sequence') text += ` (${q.progress||0}/3)`;

        c.fillStyle = color;
        c.fillText(`${q.emoji} ${icon} ${text}`, px+14, qy);
        c.restore();
        qy += lineH;
    }
}

// -----------------------------------------------------------
// Timer (top-center)
// -----------------------------------------------------------
function drawTimer(c, state) {
    const mins = Math.floor(state.timeLeft / 60);
    const secs = state.timeLeft % 60;
    const str  = `${mins}:${secs < 10 ? '0':''}${secs}`;
    const urgent = state.timeLeft < 60;

    c.save();
    c.textAlign = 'center';
    // Background pill
    const tw = 130, th = 44;
    const tx = canvas.width/2 - tw/2, ty = 12;
    c.fillStyle = urgent ? 'rgba(239,68,68,0.3)' : 'rgba(10,8,25,0.75)';
    c.beginPath(); c.roundRect(tx,ty,tw,th,22); c.fill();
    c.strokeStyle = urgent ? '#ef4444' : 'rgba(100,100,160,0.5)';
    c.lineWidth = 1.5;
    c.stroke();

    c.font = `bold 28px 'Outfit', monospace`;
    c.fillStyle = urgent ? '#ef4444' : '#fff';
    if(urgent) { c.shadowColor='#ef4444'; c.shadowBlur = 10; }
    c.fillText(`⏱ ${str}`, canvas.width/2, ty+30);
    c.restore();
}

// -----------------------------------------------------------
// Main draw loop
// -----------------------------------------------------------
function draw() {
    ctx.fillStyle = '#0d0d1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // ---- SKIN REVEAL ----
    if(gameState.status === 'skinReveal') {
        if(!revealStartTime) revealStartTime = Date.now();
        skinRevealTimer = Date.now() - revealStartTime;
        drawSkinReveal(ctx, gameState);
        requestAnimationFrame(draw);
        return;
    }
    revealStartTime = null;
    revealProgress  = 0;

    if(!gameState.level) {
        requestAnimationFrame(draw);
        return;
    }

    // ---- Camera: follow centroid of all players ----
    const players = Object.values(gameState.players);
    let  cx = gameState.level.width/2, cy = gameState.level.height/2;
    if(players.length > 0) {
        cx = players.reduce((s,p)=>s+p.x,0)/players.length;
        cy = players.reduce((s,p)=>s+p.y,0)/players.length;
    }
    camera.x += (cx - canvas.width/2  - camera.x)*0.1;
    camera.y += (cy - canvas.height/2 - camera.y)*0.1;

    ctx.save();
    ctx.translate(-camera.x, -camera.y);

    // ---- Floor grid ----
    ctx.strokeStyle = '#161625';
    ctx.lineWidth   = 1;
    for(let i=0; i<=gameState.level.width;  i+=100){ ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i,gameState.level.height); ctx.stroke(); }
    for(let i=0; i<=gameState.level.height; i+=100){ ctx.beginPath(); ctx.moveTo(0,i); ctx.lineTo(gameState.level.width,i);  ctx.stroke(); }

    // ---- Exit ----
    const exitDone = gameState.level.quests.filter(q=>q.type==='exit').every(q=>q.done);
    const allOtherDone = gameState.level.quests.filter(q=>q.type!=='exit').every(q=>q.done);
    const exitColor = allOtherDone ? '#10b981' : '#475569';
    ctx.save();
    ctx.fillStyle = exitColor;
    if(allOtherDone){ ctx.shadowColor='#10b981'; ctx.shadowBlur=30; }
    ctx.beginPath();
    ctx.arc(gameState.level.exit.x, gameState.level.exit.y, gameState.level.exit.r, 0, Math.PI*2);
    ctx.fill();
    ctx.shadowBlur=0;
    // Pulsing ring
    const pulse = Math.sin(Date.now()*0.003)*0.5+0.5;
    ctx.strokeStyle = allOtherDone ? `rgba(16,185,129,${0.5+pulse*0.5})` : 'rgba(100,100,130,0.5)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle='#fff'; ctx.font='bold 18px Outfit,sans-serif'; ctx.textAlign='center';
    ctx.fillText('SORTIE', gameState.level.exit.x, gameState.level.exit.y+6);
    ctx.restore();

    // ---- Coins ----
    for(let c of gameState.level.coins) {
        if(c.collected) continue;
        const glow = Math.sin(Date.now()*0.004 + c.x)*0.5+0.5;
        ctx.save();
        ctx.shadowColor='#f1c40f'; ctx.shadowBlur = 8 + glow*10;
        ctx.fillStyle='#f1c40f';
        ctx.beginPath(); ctx.arc(c.x,c.y,12,0,Math.PI*2); ctx.fill();
        ctx.strokeStyle='#e67e22'; ctx.lineWidth=2.5; ctx.stroke();
        ctx.restore();
    }

    // ---- Buttons (plates) ----
    for(let b of gameState.level.buttons) {
        const active = b.pressed;
        ctx.save();
        // Outer glow
        if(active){ ctx.shadowColor=b.color; ctx.shadowBlur=25; }
        ctx.fillStyle = active ? lighten(b.color,0.4) : b.color;
        ctx.beginPath(); ctx.arc(b.x,b.y,b.r,0,Math.PI*2); ctx.fill();
        ctx.strokeStyle = active ? '#fff' : 'rgba(255,255,255,0.5)';
        ctx.lineWidth = active ? 4 : 2;
        ctx.stroke();
        ctx.shadowBlur=0;

        // Draw required shape / info on button
        if(b.reqShape) {
            drawButtonShape(ctx, b.reqShape, b.x, b.y, b.r*0.45);
        } else if(b.reqCount !== undefined) {
            // Coop count display
            ctx.fillStyle='rgba(0,0,0,0.7)';
            ctx.beginPath(); ctx.arc(b.x,b.y,b.r*0.5,0,Math.PI*2); ctx.fill();
            ctx.fillStyle='#fff'; ctx.font=`bold ${Math.round(b.r*0.5)}px Outfit,sans-serif`;
            ctx.textAlign='center';
            ctx.fillText(`${b.currentCount||0}/${b.reqCount}`,b.x,b.y+(b.r*0.2));
        } else if(b.isRiddle) {
            ctx.font=`bold ${Math.round(b.r*0.55)}px serif`;
            ctx.textAlign='center';
            ctx.fillText(b.riddleAnswered?'✅':'💡', b.x, b.y+b.r*0.2);
        } else if(b.seqOrder) {
            ctx.fillStyle = b.seqPressed ? '#fff' : 'rgba(0,0,0,0.7)';
            ctx.beginPath(); ctx.arc(b.x,b.y,b.r*0.5,0,Math.PI*2); ctx.fill();
            ctx.fillStyle = b.seqPressed ? '#111' : '#fff';
            ctx.font=`bold ${Math.round(b.r*0.6)}px Outfit,sans-serif`;
            ctx.textAlign='center';
            ctx.fillText(b.seqOrder, b.x, b.y+b.r*0.22);
        }
        ctx.restore();
    }

    // ---- Players ----
    for(let p of players) drawPlayer(ctx, p);

    // ---- Walls ----
    ctx.fillStyle   = '#111';
    ctx.strokeStyle = 'rgba(0,255,200,0.3)';
    ctx.lineWidth   = 1;
    for(let w of gameState.level.walls) {
        ctx.fillRect(w.x,w.y,w.w,w.h);
        ctx.strokeRect(w.x,w.y,w.w,w.h);
    }

    // ---- Doors ----
    for(let d of gameState.level.doors) {
        if(d.open){
            // Faint open frame
            ctx.strokeStyle='rgba(16,185,129,0.3)'; ctx.lineWidth=2;
            ctx.strokeRect(d.x,d.y,d.w,d.h);
        } else {
            ctx.fillStyle='#e74c3c';
            ctx.fillRect(d.x,d.y,d.w,d.h);
            ctx.strokeStyle='#c0392b'; ctx.lineWidth=1.5;
            ctx.strokeRect(d.x,d.y,d.w,d.h);
        }
    }

    // ---- Fog of War ----
    if(players.length > 0) {
        if(fogCanvas.width!==canvas.width||fogCanvas.height!==canvas.height){
            fogCanvas.width=canvas.width; fogCanvas.height=canvas.height;
        }
        fogCtx.globalCompositeOperation='source-over';
        fogCtx.fillStyle='rgba(6,6,18,0.97)';
        fogCtx.fillRect(0,0,fogCanvas.width,fogCanvas.height);
        fogCtx.globalCompositeOperation='destination-out';

        let segs=[];
        const mb=[{x:0,y:0},{x:gameState.level.width,y:0},{x:gameState.level.width,y:gameState.level.height},{x:0,y:gameState.level.height}];
        segs.push({a:mb[0],b:mb[1]},{a:mb[1],b:mb[2]},{a:mb[2],b:mb[3]},{a:mb[3],b:mb[0]});
        const allBlocks=gameState.level.walls.concat(gameState.level.doors.filter(d=>!d.open));
        for(let w of allBlocks){
            segs.push(
                {a:{x:w.x,y:w.y},b:{x:w.x+w.w,y:w.y}},
                {a:{x:w.x+w.w,y:w.y},b:{x:w.x+w.w,y:w.y+w.h}},
                {a:{x:w.x+w.w,y:w.y+w.h},b:{x:w.x,y:w.y+w.h}},
                {a:{x:w.x,y:w.y+w.h},b:{x:w.x,y:w.y}}
            );
        }

        for(let p of players) {
            const poly=calcVisibility({x:p.x,y:p.y},segs);
            if(poly.length>1){
                fogCtx.save();
                fogCtx.translate(-camera.x,-camera.y);
                fogCtx.beginPath();
                fogCtx.moveTo(poly[0].x,poly[0].y);
                for(let i=1;i<poly.length;i++) fogCtx.lineTo(poly[i].x,poly[i].y);
                fogCtx.closePath();
                const g=fogCtx.createRadialGradient(p.x,p.y,30,p.x,p.y,380);
                g.addColorStop(0,'rgba(0,0,0,1)');
                g.addColorStop(0.6,'rgba(0,0,0,0.85)');
                g.addColorStop(1,'rgba(0,0,0,0)');
                fogCtx.fillStyle=g; fogCtx.fill();
                fogCtx.restore();
            }
        }

        ctx.restore();
        ctx.drawImage(fogCanvas,0,0);
        ctx.save();
        ctx.translate(-camera.x,-camera.y);
    }

    ctx.restore();

    // ---- HUD (screen-space) ----
    if(gameState.status==='playing') {
        drawTimer(ctx, gameState);
        drawQuestPanel(ctx, gameState);
    }

    // ---- End screens ----
    if(gameState.status==='victory') {
        drawEndScreen(ctx,'#10b981','🏆 VICTOIRE !','Félicitations, vous avez tout accompli !');
    } else if(gameState.status==='defeat') {
        drawEndScreen(ctx,'#ef4444','💀 TEMPS ÉCOULÉ','Essayez encore — vous étiez si proches !');
    }

    requestAnimationFrame(draw);
}

function drawEndScreen(c, color, title, sub) {
    const W=canvas.width, H=canvas.height;
    c.save();
    c.fillStyle=hexToRgba(color,0.6);
    c.fillRect(0,0,W,H);
    c.textAlign='center';
    c.shadowColor=color; c.shadowBlur=40;
    c.font=`bold ${Math.round(H*0.1)}px 'Outfit',sans-serif`;
    c.fillStyle='#fff';
    c.fillText(title,W/2,H*0.45);
    c.shadowBlur=0;
    c.font=`${Math.round(H*0.035)}px 'Outfit',sans-serif`;
    c.fillStyle='rgba(255,255,255,0.85)';
    c.fillText(sub,W/2,H*0.56);
    c.font=`${Math.round(H*0.025)}px 'Outfit',sans-serif`;
    c.fillStyle='rgba(200,200,255,0.7)';
    c.fillText('L\'hôte peut relancer la partie depuis le lobby',W/2,H*0.64);
    c.restore();
}

function lighten(hex, amt) {
    const r=Math.min(255,parseInt(hex.slice(1,3),16)+Math.round(amt*255));
    const g=Math.min(255,parseInt(hex.slice(3,5),16)+Math.round(amt*255));
    const b=Math.min(255,parseInt(hex.slice(5,7),16)+Math.round(amt*255));
    return `rgb(${r},${g},${b})`;
}

// Google Fonts
const link=document.createElement('link');
link.rel='stylesheet'; link.href='https://fonts.googleapis.com/css2?family=Outfit:wght@400;700;900&display=swap';
document.head.appendChild(link);

draw();

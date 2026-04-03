// ============================================================
// Bancal — Controller (mobile.html)
// ============================================================
const socket = io();

// ---- My player info ----
let myId    = null;
let mySkin  = null;  // { id, name, number, color, shape, hat }
let gameState = { players:{}, level:null, status:'lobby' };

// ---- Canvas refs ----
const badgeCanvas = document.getElementById('player-badge');
const badgeCtx    = badgeCanvas.getContext('2d');
const minimap     = document.getElementById('minimap');
const mmCtx       = minimap.getContext('2d');
const bigmap      = document.getElementById('bigmap');
const bmCtx       = bigmap.getContext('2d');

// ---- UI refs ----
const waitingScreen  = document.getElementById('waiting-screen');
const controllerUI   = document.getElementById('controller-ui');
const playerNameEl   = document.getElementById('player-name');
const playerShapeEl  = document.getElementById('player-shape-label');
const questIcon      = document.getElementById('quest-icon');
const questText      = document.getElementById('quest-text');
const riddlePanel    = document.getElementById('riddle-panel');
const riddleQuestion = document.getElementById('riddle-question');
const minimapWrap    = document.getElementById('minimap-wrap');
const mapModal       = document.getElementById('map-modal');
const closeMapBtn    = document.getElementById('close-map');

// ---- Register ----
socket.emit('register', 'player');

socket.on('yourId', info => {
    myId   = info.id;
    mySkin = info;
    playerNameEl.innerText  = info.name;
    const shapes = { square:'■ Carré', triangle:'▲ Triangle', circle:'● Cercle', cross:'✚ Croix', star:'★ Étoile' };
    playerShapeEl.innerText = shapes[info.shape] || info.shape;
    document.body.style.setProperty('--player-color', info.color);
    document.body.style.setProperty('--player-color-dim', hexToRgba(info.color, 0.18));

    waitingScreen.style.display  = 'none';
    controllerUI.style.display   = 'flex';

    drawBadge();
});

socket.on('stateUpdate', state => {
    gameState = state;
    updateQuestIndicator();
    updateRiddlePanel();
    drawMinimap(mmCtx, minimap.width, minimap.height);
});

socket.on('riddleResult', data => {
    if(data.playerId !== myId) return;
    showRiddleFeedback(data.correct);
});

// -----------------------------------------------------------
// Badge drawing (player avatar top-left)
// -----------------------------------------------------------
function drawBadge() {
    if(!mySkin) return;
    const s = badgeCanvas.width / 2;
    badgeCtx.clearRect(0,0,badgeCanvas.width,badgeCanvas.height);

    // Background glow
    badgeCtx.fillStyle = hexToRgba(mySkin.color, 0.25);
    badgeCtx.beginPath();
    badgeCtx.arc(s,s,s-2,0,Math.PI*2);
    badgeCtx.fill();
    badgeCtx.strokeStyle = mySkin.color;
    badgeCtx.lineWidth = 2.5;
    badgeCtx.stroke();

    // Draw shape
    badgeCtx.save();
    badgeCtx.translate(s, s+3);
    badgeCtx.fillStyle = mySkin.color;
    drawShapeCtx(badgeCtx, mySkin.shape, 12);
    badgeCtx.restore();
}

// -----------------------------------------------------------
// Quest indicator (above joystick)
// -----------------------------------------------------------
function updateQuestIndicator() {
    if(!gameState.level || !gameState.level.quests) return;
    const quests = gameState.level.quests;

    // Find first undone quest
    const active = quests.find(q => !q.done);
    if(!active) {
        questIcon.textContent = '🚪';
        questText.textContent = 'Toutes les quêtes sont faites ! → Rejoins la SORTIE !';
        return;
    }

    // If it's a riddle check if player is near riddle plate
    if(active.type === 'riddle' && myId && gameState.players[myId]) {
        const me = gameState.players[myId];
        const btn = gameState.level.buttons.find(b => b.id === active.linkedButton);
        if(btn) {
            const dx = me.x - btn.x, dy = me.y - btn.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            if(dist < btn.r + 70) {
                questIcon.textContent = '💡';
                questText.textContent = 'Tu es sur la plaque ! Réponds à l\'énigme ci-dessus !';
                return;
            }
        }
    }

    questIcon.textContent = active.emoji;
    let txt = active.description;
    if(active.hint) txt += ` → ${active.hint}`;
    if(active.type==='collect') txt = `${active.emoji} Collecte: ${active.count||0}/${active.total} cristaux. Cherche partout !`;
    if(active.type==='coop') txt = `🤝 Rassemblez ${active.needed} joueurs sur la plaque violette ! (${active.count||0}/${active.needed})`;
    questText.textContent = txt;
}

// -----------------------------------------------------------
// Riddle panel
// -----------------------------------------------------------
function updateRiddlePanel() {
    if(!gameState.level || !myId || !gameState.players[myId]) { riddlePanel.style.display='none'; return; }
    const me = gameState.players[myId];
    const riddleBtn = gameState.level.buttons.find(b => b.isRiddle && !b.riddleAnswered);
    if(!riddleBtn) { riddlePanel.style.display='none'; return; }

    const dx = me.x - riddleBtn.x, dy = me.y - riddleBtn.y;
    const dist = Math.sqrt(dx*dx+dy*dy);
    if(dist < riddleBtn.r + 70) {
        riddlePanel.style.display='flex';
        riddleQuestion.textContent = '❓ Un carré a-t-il 4 côtés ?';
    } else {
        riddlePanel.style.display='none';
    }
}

document.getElementById('btnRiddleYes').addEventListener('click', () => {
    socket.emit('riddleAnswer', { answer: true });
});
document.getElementById('btnRiddleNo').addEventListener('click', () => {
    socket.emit('riddleAnswer', { answer: false });
});

function showRiddleFeedback(correct) {
    const panel = document.getElementById('riddle-panel');
    const msg   = document.createElement('div');
    msg.className  = 'riddle-feedback';
    msg.textContent= correct ? '✅ Correct !' : '❌ Mauvaise réponse…';
    msg.style.color= correct ? '#10b981' : '#ef4444';
    panel.appendChild(msg);
    setTimeout(() => msg.remove(), 2500);
}

// -----------------------------------------------------------
// MINI-MAP
// -----------------------------------------------------------
function drawMinimap(c, W, H) {
    if(!gameState.level) return;
    const level  = gameState.level;
    const scaleX = W / level.width;
    const scaleY = H / level.height;
    const scale  = Math.min(scaleX, scaleY);

    c.fillStyle = '#0a0a18';
    c.fillRect(0,0,W,H);

    // Border
    c.strokeStyle='rgba(100,100,200,0.4)'; c.lineWidth=1;
    c.strokeRect(0,0,W,H);

    // Walls
    c.fillStyle='rgba(150,150,200,0.5)';
    for(let w of level.walls) c.fillRect(w.x*scale, w.y*scale, w.w*scale, w.h*scale);

    // Doors
    for(let d of level.doors) {
        c.fillStyle = d.open ? 'rgba(16,185,129,0.4)' : 'rgba(231,76,60,0.7)';
        c.fillRect(d.x*scale, d.y*scale, Math.max(d.w*scale,2), Math.max(d.h*scale,2));
    }

    // Coins (not collected)
    c.fillStyle='#f1c40f';
    for(let coin of level.coins) {
        if(!coin.collected) {
            c.beginPath(); c.arc(coin.x*scale, coin.y*scale, Math.max(2, 4*scale), 0, Math.PI*2); c.fill();
        }
    }

    // Exit
    c.fillStyle='#10b981';
    c.beginPath(); c.arc(level.exit.x*scale, level.exit.y*scale, Math.max(4, level.exit.r*scale), 0, Math.PI*2); c.fill();

    // Buttons / objectives
    for(let b of level.buttons) {
        c.fillStyle = b.pressed ? 'rgba(16,185,129,0.9)' : hexToRgba(b.color, 0.8);
        c.beginPath(); c.arc(b.x*scale, b.y*scale, Math.max(2, b.r*scale*0.7), 0, Math.PI*2); c.fill();
    }

    // Quest target markers
    if(gameState.level.quests) {
        const activeQ = gameState.level.quests.find(q=>!q.done);
        if(activeQ && activeQ.targetX) {
            const pulse = Math.sin(Date.now()*0.006)*0.5+0.5;
            c.strokeStyle=`rgba(255,200,0,${0.5+pulse*0.5})`;
            c.lineWidth=1.5;
            c.beginPath();
            c.arc(activeQ.targetX*scale, activeQ.targetY*scale, 5+pulse*3, 0, Math.PI*2);
            c.stroke();
        }
    }

    // Players
    const players = Object.values(gameState.players);
    for(let p of players) {
        const isSelf = p.id === myId;
        const r = isSelf ? 5 : 3;
        c.fillStyle = p.color;
        if(isSelf){ c.shadowColor=p.color; c.shadowBlur=8; }
        c.beginPath(); c.arc(p.x*scale, p.y*scale, r, 0, Math.PI*2); c.fill();
        c.shadowBlur=0;
    }
}

function drawBigMap() {
    const W = bigmap.width, H = bigmap.height;
    drawMinimap(bmCtx, W, H);
}

// --- Minimap tap to expand ---
minimapWrap.addEventListener('click', () => {
    mapModal.style.display='flex';
    bigmap.width  = Math.min(window.innerWidth  - 40, 600);
    bigmap.height = Math.min(window.innerHeight - 120, 600);
    drawBigMap();
});
closeMapBtn.addEventListener('click', () => { mapModal.style.display='none'; });

// Refresh big map when open
setInterval(() => {
    if(mapModal.style.display !== 'none') drawBigMap();
}, 300);

// Refresh minimap continuously
setInterval(() => {
    drawMinimap(mmCtx, minimap.width, minimap.height);
}, 200);

// -----------------------------------------------------------
// JOYSTICK
// -----------------------------------------------------------
const joystickZone = document.getElementById('joystick-zone');
const joystickKnob = document.getElementById('joystick-knob');
const joystickHint = document.getElementById('joystick-hint');
const MAX_RADIUS   = 65;

let joystickActive = false;
let startX, startY;

joystickZone.addEventListener('pointerdown', e => {
    joystickActive = true;
    joystickZone.setPointerCapture(e.pointerId);
    const rect = joystickZone.getBoundingClientRect();
    startX = e.clientX - rect.left;
    startY = e.clientY - rect.top;
    joystickKnob.style.opacity  = '1';
    joystickKnob.style.left     = startX + 'px';
    joystickKnob.style.top      = startY + 'px';
    joystickKnob.style.transform= 'translate(-50%,-50%) scale(1)';
    joystickHint.style.opacity  = '0';
    e.preventDefault();
});

joystickZone.addEventListener('pointermove', e => {
    if(!joystickActive) return;
    const rect = joystickZone.getBoundingClientRect();
    let cx = e.clientX - rect.left;
    let cy = e.clientY - rect.top;
    let dx = cx - startX;
    let dy = cy - startY;
    const dist = Math.sqrt(dx*dx+dy*dy);
    if(dist > MAX_RADIUS) { dx = dx/dist*MAX_RADIUS; dy = dy/dist*MAX_RADIUS; }

    joystickKnob.style.left  = (startX + dx) + 'px';
    joystickKnob.style.top   = (startY + dy) + 'px';

    // Dynamic scale based on push
    const pushPct = Math.min(1, dist/MAX_RADIUS);
    joystickKnob.style.transform = `translate(-50%,-50%) scale(${0.85 + pushPct*0.25})`;

    socket.emit('input', { type:'move', dx: dx/MAX_RADIUS, dy: dy/MAX_RADIUS });
    e.preventDefault();
});

const resetJoystick = (e) => {
    if(!joystickActive) return;
    joystickActive = false;
    joystickKnob.style.opacity   = '0.5';
    joystickKnob.style.left      = '50%';
    joystickKnob.style.top       = '50%';
    joystickKnob.style.transform = 'translate(-50%,-50%) scale(1)';
    joystickHint.style.opacity   = '1';
    socket.emit('input', { type:'move', dx:0, dy:0 });
};

joystickZone.addEventListener('pointerup',    resetJoystick);
joystickZone.addEventListener('pointercancel',resetJoystick);

// -----------------------------------------------------------
// ACTION BUTTONS
// -----------------------------------------------------------
const btnA = document.getElementById('btnA');
const btnB = document.getElementById('btnB');

btnA.addEventListener('pointerdown', () => socket.emit('input', { type:'action', button:'A' }));
btnB.addEventListener('pointerdown', () => socket.emit('input', { type:'action', button:'B' }));

// -----------------------------------------------------------
// Helpers
// -----------------------------------------------------------
function hexToRgba(hex, a) {
    if(!hex || hex.length < 7) return `rgba(128,128,128,${a})`;
    const r=parseInt(hex.slice(1,3),16);
    const g=parseInt(hex.slice(3,5),16);
    const b=parseInt(hex.slice(5,7),16);
    return `rgba(${r},${g},${b},${a})`;
}

function drawShapeCtx(c, shape, size) {
    c.beginPath();
    switch(shape) {
        case 'square':   c.fillRect(-size,-size,size*2,size*2); break;
        case 'triangle': c.moveTo(0,-size); c.lineTo(size,size); c.lineTo(-size,size); c.closePath(); c.fill(); break;
        case 'circle':   c.arc(0,0,size,0,Math.PI*2); c.fill(); break;
        case 'cross':    c.fillRect(-size,-size*0.35,size*2,size*0.7); c.fillRect(-size*0.35,-size,size*0.7,size*2); break;
        case 'star':
            c.beginPath();
            for(let i=0;i<5;i++){
                c.lineTo(Math.cos((18+i*72)/180*Math.PI)*size,-Math.sin((18+i*72)/180*Math.PI)*size);
                c.lineTo(Math.cos((54+i*72)/180*Math.PI)*size*0.5,-Math.sin((54+i*72)/180*Math.PI)*size*0.5);
            }
            c.closePath(); c.fill(); break;
    }
}

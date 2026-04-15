const socket = io();

const urlParams = new URLSearchParams(window.location.search);
const code = urlParams.get('code');
const pseudo = urlParams.get('pseudo') || 'Joueur Mobile';

if (!code) {
    alert("Code manquant ! Retour à l'accueil.").then(() => {
        window.location.href = '/';
    });
} else {
    socket.emit('joinGame', { code, pseudo }, async (response) => {
        if (!response.success) {
            await alert(response.message);
            window.location.href = '/';
        }
    });
}

socket.on('gameClosed', (data) => {
    let msg = "La partie a été fermée par l'hôte.";
    if (data && data.reason === 'no-players') {
        msg = "La partie est terminée car plus aucun joueur n'était présent.";
    }
    alert(msg).then(() => {
        window.location.href = '/';
    });
});

const waitingUI = document.getElementById('waiting-ui');
const revealUI = document.getElementById('reveal-ui');
const controllerUI = document.getElementById('controller-ui');
const charCanvas = document.getElementById('character-canvas');
const revealCountdown = document.getElementById('reveal-countdown');

let hasRevealed = false;
let lastState = 'lobby';

const billeImg = new Image();
billeImg.src = '/assets/images/bille.png';
const coloredBilleCache = {};

function getColoredBille(hexColor) {
    if (coloredBilleCache[hexColor]) return coloredBilleCache[hexColor];
    if (!billeImg.complete || billeImg.naturalWidth === 0) return null;

    const buffer = document.createElement('canvas');
    buffer.width = billeImg.naturalWidth;
    buffer.height = billeImg.naturalHeight;
    const bctx = buffer.getContext('2d');
    bctx.drawImage(billeImg, 0, 0);
    bctx.globalCompositeOperation = "source-in";
    bctx.fillStyle = hexColor;
    bctx.fillRect(0, 0, buffer.width, buffer.height);
    bctx.globalCompositeOperation = "multiply";
    bctx.drawImage(billeImg, 0, 0);
    coloredBilleCache[hexColor] = buffer;
    return buffer;
}

function drawCharacter(player) {
    if (!charCanvas) return;
    const ctx = charCanvas.getContext('2d');
    ctx.clearRect(0, 0, charCanvas.width, charCanvas.height);

    const coloredBille = getColoredBille(player.color);
    if (coloredBille) {
        ctx.save();
        ctx.translate(charCanvas.width / 2, charCanvas.height / 2);
        const fw = coloredBille.width / 20; // 20 frames
        const size = 180;
        ctx.drawImage(coloredBille, 0, 0, fw, coloredBille.naturalHeight, -size / 2, -size / 2, size, size);

        // Yeux stylisés
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.arc(-24, -16, 12, 0, Math.PI * 2);
        ctx.arc(24, -16, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.arc(0, 20, 24, 0.2, Math.PI - 0.2);
        ctx.stroke();
        ctx.restore();
    } else {
        // Fallback
        ctx.save();
        ctx.translate(charCanvas.width / 2, charCanvas.height / 2);
        ctx.scale(2.5, 2.5);
        ctx.fillStyle = player.color;
        ctx.beginPath();
        ctx.arc(0, 0, 20, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.arc(-6, -4, 3, 0, Math.PI * 2);
        ctx.arc(6, -4, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

socket.on('stateUpdate', (state) => {
    let myPlayer = state.players[socket.id];

    if (state.status === 'lobby' || state.status === 'victory' || state.status === 'defeat') {
        if (state.status === 'lobby') {
            waitingUI.style.display = 'flex';
        }
        revealUI.style.display = 'none';
        controllerUI.style.display = 'none';
    } else if (state.status === 'starting') {
        waitingUI.style.display = 'none';
        revealUI.style.display = 'flex';
        controllerUI.style.display = 'none';

        if (myPlayer) {
            drawCharacter(myPlayer);
        }
        revealCountdown.innerText = state.countdown;
    } else if (state.status === 'playing') {
        waitingUI.style.display = 'none';
        revealUI.style.display = 'none';
        controllerUI.style.display = 'flex';

        const mt = document.getElementById('mobile-timer');
        if (mt) {
            let mins = Math.floor(state.timeLeft / 60);
            let secs = state.timeLeft % 60;
            mt.innerText = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
        }

        // Mise à jour de la vie (HP)
        const hpDisplay = document.getElementById('hp-display');
        if (myPlayer && hpDisplay) {
            if (myPlayer.isDead) {
                hpDisplay.innerHTML = '<span style="color: #e74c3c; font-weight: bold;">MORT</span>';
            } else {
                const maxHp = 4;
                const hp = Math.max(0, Math.min(myPlayer.hp, maxHp));
                hpDisplay.innerHTML = '❤️'.repeat(hp) + '🖤'.repeat(maxHp - hp);
            }
        }
    }

    lastState = state.status;
});

const joystickZone = document.getElementById('joystick-zone');
const btnA = document.getElementById('btnA');
const btnB = document.getElementById('btnB');

let joystickActive = false;
let startX, startY;
const MAX_RADIUS = 50;
let uiJoystick;

// Create visual joystick knob
uiJoystick = document.createElement('div');
uiJoystick.style.width = '40px';
uiJoystick.style.height = '40px';
uiJoystick.style.backgroundColor = 'rgba(255,255,255,0.5)';
uiJoystick.style.borderRadius = '50%';
uiJoystick.style.position = 'absolute';
uiJoystick.style.display = 'none';
uiJoystick.style.transform = 'translate(-50%, -50%)';
uiJoystick.style.pointerEvents = 'none';
joystickZone.appendChild(uiJoystick);

joystickZone.addEventListener('pointerdown', (e) => {
    joystickActive = true;
    const rect = joystickZone.getBoundingClientRect();
    startX = e.clientX - rect.left;
    startY = e.clientY - rect.top;

    uiJoystick.style.left = startX + 'px';
    uiJoystick.style.top = startY + 'px';
    uiJoystick.style.display = 'block';
});

joystickZone.addEventListener('pointermove', (e) => {
    if (!joystickActive) return;
    const rect = joystickZone.getBoundingClientRect();
    let cx = e.clientX - rect.left;
    let cy = e.clientY - rect.top;

    let dx = cx - startX;
    let dy = cy - startY;

    let distance = Math.sqrt(dx * dx + dy * dy);
    if (distance > MAX_RADIUS) {
        dx = (dx / distance) * MAX_RADIUS;
        dy = (dy / distance) * MAX_RADIUS;
    }

    uiJoystick.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;

    // Normalize coordinates -1 to 1
    socket.emit('input', { type: 'move', dx: dx / MAX_RADIUS, dy: dy / MAX_RADIUS });
});

joystickZone.addEventListener('pointerup', () => {
    joystickActive = false;
    uiJoystick.style.display = 'none';
    socket.emit('input', { type: 'move', dx: 0, dy: 0 });
});
joystickZone.addEventListener('pointerleave', () => {
    if (joystickActive) {
        joystickActive = false;
        uiJoystick.style.display = 'none';
        socket.emit('input', { type: 'move', dx: 0, dy: 0 });
    }
});

btnA.addEventListener('pointerdown', () => socket.emit('input', { type: 'action', button: 'A' }));
btnB.addEventListener('pointerdown', () => socket.emit('input', { type: 'action', button: 'B' }));

async function quitGame() {
    if (await confirm("Voulez-vous vraiment quitter la partie ?")) {
        window.location.href = '/';
    }
}


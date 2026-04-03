const socket = io();
socket.emit('register', 'player');

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
    
    let distance = Math.sqrt(dx*dx + dy*dy);
    if(distance > MAX_RADIUS) {
        dx = (dx / distance) * MAX_RADIUS;
        dy = (dy / distance) * MAX_RADIUS;
    }
    
    uiJoystick.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    
    // Normalize coordinates -1 to 1
    socket.emit('input', { type: 'move', dx: dx/MAX_RADIUS, dy: dy/MAX_RADIUS });
});

joystickZone.addEventListener('pointerup', () => {
    joystickActive = false;
    uiJoystick.style.display = 'none';
    socket.emit('input', { type: 'move', dx: 0, dy: 0 });
});
joystickZone.addEventListener('pointerleave', () => {
    if(joystickActive) {
        joystickActive = false;
        uiJoystick.style.display = 'none';
        socket.emit('input', { type: 'move', dx: 0, dy: 0 });
    }
});

btnA.addEventListener('pointerdown', () => socket.emit('input', { type: 'action', button: 'A' }));
btnB.addEventListener('pointerdown', () => socket.emit('input', { type: 'action', button: 'B' }));

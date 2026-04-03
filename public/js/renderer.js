const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
});

let gameState = { players: {}, level: null };

socket.emit('register', 'observer');

const lobbyUI = document.getElementById('lobby-ui');
const pCountSpan = document.getElementById('player-count');
const joinUrlText = document.getElementById('join-url-text');
const qrCodeImg = document.getElementById('qr-code-img');

socket.on('stateUpdate', (state) => {
    gameState = state;
    
    if (state.status !== 'playing') {
        if (lobbyUI) lobbyUI.style.display = 'block';
        if (pCountSpan) pCountSpan.innerText = Object.keys(state.players).length;
        
        if (state.qrCodeDataUrl && qrCodeImg.src !== state.qrCodeDataUrl) {
            joinUrlText.innerText = state.joinUrl;
            qrCodeImg.src = state.qrCodeDataUrl;
            qrCodeImg.style.display = 'block';
        }
    } else {
        if (lobbyUI) lobbyUI.style.display = 'none';
    }
});

function startGame() {
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

let camera = { x: 0, y: 0 };

// Optimized fog canvas reuse
const fogCanvas = document.createElement('canvas');
const fogCtx = fogCanvas.getContext('2d', { willReadFrequently: true });

function draw() {
    ctx.fillStyle = '#1e1e24';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    if(!gameState.level) {
        requestAnimationFrame(draw);
        return;
    }

    let pCount = Object.keys(gameState.players).length;
    let cx = gameState.level.width / 2;
    let cy = gameState.level.height / 2;
    if(pCount > 0) {
        cx = 0; cy = 0;
        for(let id in gameState.players) {
            cx += gameState.players[id].x;
            cy += gameState.players[id].y;
        }
        cx /= pCount;
        cy /= pCount;
    }

    camera.x += (cx - canvas.width/2 - camera.x) * 0.1;
    camera.y += (cy - canvas.height/2 - camera.y) * 0.1;

    ctx.save();
    ctx.translate(-camera.x, -camera.y);

    // Floor Grid
    ctx.strokeStyle = '#2b2b36';
    ctx.lineWidth = 2;
    for(let i=0; i<=gameState.level.width; i+=100) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, gameState.level.height); ctx.stroke();
    }
    for(let i=0; i<=gameState.level.height; i+=100) {
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(gameState.level.width, i); ctx.stroke();
    }

    // Exit
    ctx.fillStyle = gameState.level.exit.active ? '#2ecc71' : '#7f8c8d';
    ctx.beginPath();
    ctx.arc(gameState.level.exit.x, gameState.level.exit.y, gameState.level.exit.r, 0, Math.PI*2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '24px bold Arial';
    ctx.fillText("SORTIE", gameState.level.exit.x - 45, gameState.level.exit.y + 8);

    // Buttons
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

    for(let c of gameState.level.coins) {
        if(!c.collected) {
            ctx.fillStyle = '#f1c40f';
            ctx.beginPath();
            ctx.arc(c.x, c.y, 15, 0, Math.PI*2);
            ctx.fill();
            ctx.strokeStyle = '#f39c12';
            ctx.lineWidth = 3;
            ctx.stroke();
        }
    }

    // Players
    for (const id in gameState.players) {
        const player = gameState.players[id];
        ctx.fillStyle = player.color;
        
        ctx.save();
        ctx.translate(player.x, player.y);
        
        if(player.actionBlink > 0) {
            ctx.shadowColor = '#fff';
            ctx.shadowBlur = Math.min(20, player.actionBlink * 3);
        }

        if (player.shape === 'square') {
            ctx.fillRect(-20, -20, 40, 40);
        } else if (player.shape === 'triangle') {
            ctx.beginPath();
            ctx.moveTo(0, -20);
            ctx.lineTo(20, 20);
            ctx.lineTo(-20, 20);
            ctx.closePath();
            ctx.fill();
        } else if (player.shape === 'cross') {
            ctx.fillRect(-20, -6, 40, 12);
            ctx.fillRect(-6, -20, 12, 40);
        } else if (player.shape === 'circle') {
            ctx.beginPath();
            ctx.arc(0, 0, 20, 0, Math.PI*2);
            ctx.fill();
        } else if (player.shape === 'star') {
            ctx.beginPath();
            for(let i=0; i<5; i++) {
                ctx.lineTo(Math.cos((18+i*72)/180*Math.PI)*20, -Math.sin((18+i*72)/180*Math.PI)*20);
                ctx.lineTo(Math.cos((54+i*72)/180*Math.PI)*10, -Math.sin((54+i*72)/180*Math.PI)*10);
            }
            ctx.closePath();
            ctx.fill();
        }

        // Draw funny face
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.arc(-6, -4, 3, 0, Math.PI*2); // Left eye
        ctx.arc(6, -4, 3, 0, Math.PI*2); // Right eye
        ctx.fill();
        
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 4, 6, 0.2, Math.PI - 0.2); // Smile
        ctx.stroke();

        ctx.restore();
    }

    // Fog of War
    if (Object.keys(gameState.players).length > 0) {
        if(fogCanvas.width !== canvas.width || fogCanvas.height !== canvas.height) {
            fogCanvas.width = canvas.width;
            fogCanvas.height = canvas.height;
        }
        
        fogCtx.globalCompositeOperation = 'source-over';
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

        for(let id in gameState.players) {
            let p = gameState.players[id];
            let poly = calculateVisibilityPolygon({x: p.x, y: p.y}, segments);
            
            if(poly.length > 0) {
                fogCtx.save();
                fogCtx.translate(-camera.x, -camera.y);
                fogCtx.beginPath();
                fogCtx.moveTo(poly[0].x, poly[0].y);
                for(let i=1; i<poly.length; i++) {
                    fogCtx.lineTo(poly[i].x, poly[i].y);
                }
                fogCtx.closePath();
                
                let gradient = fogCtx.createRadialGradient(p.x, p.y, 20, p.x, p.y, 600);
                gradient.addColorStop(0, 'rgba(0,0,0,1)');
                gradient.addColorStop(1, 'rgba(0,0,0,0)');
                
                fogCtx.fillStyle = gradient;
                fogCtx.fill();
                fogCtx.restore();
            }
        }

        ctx.restore(); 
        ctx.drawImage(fogCanvas, 0, 0);
        ctx.save();
        ctx.translate(-camera.x, -camera.y);
    }

    // Walls (drawn on top of everything for crispness, but maybe shadow them)
    ctx.fillStyle = '#111';
    for(let w of gameState.level.walls) {
        ctx.fillRect(w.x, w.y, w.w, w.h);
        ctx.strokeStyle = '#00ffcc';
        ctx.lineWidth = 1;
        ctx.strokeRect(w.x, w.y, w.w, w.h);
    }

    // Doors
    ctx.fillStyle = '#e74c3c';
    for(let d of gameState.level.doors) {
        if(!d.open) {
            ctx.fillRect(d.x, d.y, d.w, d.h);
            ctx.strokeStyle = '#c0392b';
            ctx.strokeRect(d.x, d.y, d.w, d.h);
        }
    }

    ctx.restore();
    
    if(gameState.timeLeft !== undefined) {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 36px Arial';
        ctx.textAlign = 'center';
        let mins = Math.floor(gameState.timeLeft / 60);
        let secs = gameState.timeLeft % 60;
        let timeStr = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
        ctx.fillText(timeStr, canvas.width / 2, 50);
    }
    
    if(gameState.status === 'playing' && gameState.level.quests) {
        ctx.fillStyle = 'rgba(20, 20, 25, 0.8)';
        ctx.beginPath();
        ctx.roundRect(canvas.width - 450, 20, 430, 200, 15);
        ctx.fill();
        ctx.strokeStyle = '#2ecc71';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#f1c40f';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'left';
        ctx.fillText('🏆 Quêtes & Objectifs', canvas.width - 430, 55);

        ctx.font = 'bold 18px Arial';
        let y = 95;
        for(let q of gameState.level.quests) {
            if(q.done) {
                ctx.fillStyle = '#2ecc71';
                ctx.fillText('✅ ' + q.text, canvas.width - 430, y);
            } else {
                ctx.fillStyle = '#fff';
                ctx.fillText('⬜ ' + q.text, canvas.width - 430, y);
            }
            y += 35;
        }
    }
    
    if(gameState.status === 'victory') {
        ctx.fillStyle = 'rgba(46, 204, 113, 0.8)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 80px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('VICTOIRE !', canvas.width / 2, canvas.height / 2);
    } else if (gameState.status === 'defeat') {
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

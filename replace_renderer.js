const fs = require('fs');

const path = 'public/js/renderer.js';
let content = fs.readFileSync(path, 'utf8');

// The anchor was modified in our previous replace
const anchor = 'let playerCameras = {};';
const anchorFallback = 'let camera = { x: 0, y: 0 };';
let index = content.indexOf(anchor);
if(index === -1) {
    index = content.indexOf(anchorFallback);
}

if (index !== -1) {
    const keepContent = content.substring(0, index);
    const newAddition = `
let camera = { x: 0, y: 0, scale: 1 };
const fogCanvas = document.createElement('canvas');
const fogCtx = fogCanvas.getContext('2d', { willReadFrequently: true });

function cancelGame() {
    socket.emit('cancelGame');
}

socket.on('gameClosed', () => {
    alert("Partie annulée !");
    window.location.href = '/';
});

function draw() {
    ctx.fillStyle = '#1e1e24';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    if(!gameState.level || gameState.status === 'lobby') {
        requestAnimationFrame(draw);
        return;
    }

    let pIds = Object.keys(gameState.players);
    let pCount = pIds.length;
    
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
        
        let bw = (maxX - minX) + 600; // padding around players
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

    // Grid
    ctx.strokeStyle = '#2b2b36';
    ctx.lineWidth = 2;
    for(let i=0; i<=gameState.level.width; i+=100) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, gameState.level.height); ctx.stroke();
    }
    for(let i=0; i<=gameState.level.height; i+=100) {
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(gameState.level.width, i); ctx.stroke();
    }

    ctx.fillStyle = gameState.level.exit.active ? '#2ecc71' : '#7f8c8d';
    ctx.beginPath();
    ctx.arc(gameState.level.exit.x, gameState.level.exit.y, gameState.level.exit.r, 0, Math.PI*2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '24px bold Arial';
    ctx.fillText("SORTIE", gameState.level.exit.x - 45, gameState.level.exit.y + 8);

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
    
    ctx.fillStyle = '#111';
    for(let w of gameState.level.walls) {
        ctx.fillRect(w.x, w.y, w.w, w.h);
        ctx.strokeStyle = '#00ffcc';
        ctx.lineWidth = 1;
        ctx.strokeRect(w.x, w.y, w.w, w.h);
    }

    ctx.fillStyle = '#e74c3c';
    for(let d of gameState.level.doors) {
        if(!d.open) {
            ctx.fillRect(d.x, d.y, d.w, d.h);
            ctx.strokeStyle = '#c0392b';
            ctx.strokeRect(d.x, d.y, d.w, d.h);
        }
    }

    ctx.restore();
    
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(\`Joueurs: \${pCount}\`, 20, 40);

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
        let timeStr = \`\${mins}:\${secs < 10 ? '0' : ''}\${secs}\`;
        
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
        ctx.fillStyle = 'rgba(20, 20, 25, 0.8)';
        ctx.beginPath();
        ctx.roundRect(20, 60, 400, 200, 15);
        ctx.fill();
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
`;
    
    fs.writeFileSync(path, keepContent + newAddition);
    console.log('Successfully updated renderer.js with single screen dynamic zoom');
} else {
    console.log('Anchor not found');
}

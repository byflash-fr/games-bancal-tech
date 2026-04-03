function generateLevel(playerCount) {
    const level = {
        width: 2000,
        height: 2000,
        walls: [],
        buttons: [],
        doors: [],
        spikes: [],
        coins: [],
        quests: [],
        exit: { x: 1800, y: 1800, r: 50, active: false }
    };

    level.walls.push({ x: 0, y: 0, w: 2000, h: 50 });
    level.walls.push({ x: 0, y: 1950, w: 2000, h: 50 });
    level.walls.push({ x: 0, y: 0, w: 50, h: 2000 });
    level.walls.push({ x: 1950, y: 0, w: 50, h: 2000 });

    let numRooms = Math.max(2, Math.floor(playerCount * 1.5));
    
    // Central massive open area with branching paths
    level.walls.push({ x: 400, y: 0, w: 50, h: 500 });
    level.walls.push({ x: 400, y: 800, w: 50, h: 1200 }); // Gap on left
    
    level.walls.push({ x: 1200, y: 0, w: 50, h: 1200 });
    level.walls.push({ x: 1200, y: 1500, w: 50, h: 500 }); // Gap on right
    
    // Horizontal dividers
    level.walls.push({ x: 400, y: 800, w: 400, h: 50 });
    level.walls.push({ x: 800, y: 800, w: 50, h: 400 });

    // Buttons: Ensure reqShape is possible or just rely on reqCount
    level.buttons.push({ id: 1, x: 1000, y: 200, r: 40, reqShape: null, color: '#e74c3c', pressed: false }); 
    level.buttons.push({ id: 2, x: 600, y: 1800, r: 50, reqCount: Math.min(2, playerCount), color: '#3498db', pressed: false, currentCount: 0 }); 

    level.doors.push({ id: 1, x: 1200, y: 1200, w: 50, h: 300, linkedButton: 1, open: false });
    level.doors.push({ id: 2, x: 1600, y: 1500, w: 400, h: 50, linkedButton: 2, open: false }); 
    
    level.coins.push({ x: 300, y: 300, collected: false });
    level.coins.push({ x: 200, y: 1100, collected: false });
    level.coins.push({ x: 1300, y: 150, collected: false });
    level.coins.push({ x: 900, y: 1700, collected: false });
    level.coins.push({ x: 1500, y: 1800, collected: false });

    level.quests = [
        { id: "btn1", text: "Activer le bouton Rouge", done: false },
        { id: "btn2", text: `Mode Coop : activer plaque Bleue (${Math.min(2, playerCount)} j.)`, done: false },
        { id: "coins", text: "Collecter 5 sphères dorées (0/5)", done: false, count: 0, total: 5 },
        { id: "exit", text: "Rejoindre tous la SORTIE", done: false }
    ];

    return level;
}

function checkWallCollision(p, walls, doors) {
    const pr = 20; 
    let allObstacles = walls.concat(doors.filter(d => !d.open));

    for (let w of allObstacles) {
        let testX = p.x;
        let testY = p.y;

        if (p.x < w.x) testX = w.x;
        else if (p.x > w.x + w.w) testX = w.x + w.w;

        if (p.y < w.y) testY = w.y;
        else if (p.y > w.y + w.h) testY = w.y + w.h;

        let distX = p.x - testX;
        let distY = p.y - testY;
        let distance = Math.sqrt((distX*distX) + (distY*distY));

        if (distance <= pr) {
            return true;
        }
    }
    return false;
}

function applyPhysics(player, level) {
    let newX = player.x + player.vx * 5;
    let oldX = player.x;
    player.x = newX;
    if (checkWallCollision(player, level.walls, level.doors)) {
        player.x = oldX; 
    }

    let newY = player.y + player.vy * 5;
    let oldY = player.y;
    player.y = newY;
    if (checkWallCollision(player, level.walls, level.doors)) {
        player.y = oldY; 
    }
}

function updateTriggers(players, level) {
    for(let b of level.buttons) {
        b.pressed = false;
        b.currentCount = 0;
    }

    let pList = Object.values(players);
    for(let p of pList) {
        for(let b of level.buttons) {
            let dx = p.x - b.x;
            let dy = p.y - b.y;
            let dist = Math.sqrt(dx*dx + dy*dy);
            
            if(dist < b.r + 20) {
                if(b.reqShape && p.shape === b.reqShape) {
                    b.pressed = true;
                }
                if(b.reqCount) {
                    b.currentCount++;
                    if(b.currentCount >= b.reqCount) b.pressed = true;
                }
            }
        }
    }

    for(let d of level.doors) {
        let btn = level.buttons.find(b => b.id === d.linkedButton);
        if(btn && btn.pressed) {
            d.open = true;
        } else {
            d.open = false;
        }
    }
    
    let collectedCoins = 0;
    let pListArray = Object.values(players);
    for(let c of level.coins) {
        if(!c.collected) {
            for(let p of pListArray) {
                let dx = p.x - c.x;
                let dy = p.y - c.y;
                if(Math.sqrt(dx*dx + dy*dy) < 35) { 
                    c.collected = true;
                }
            }
        }
        if(c.collected) collectedCoins++;
    }

    let qBtn1 = level.quests.find(q => q.id === "btn1");
    if(qBtn1) qBtn1.done = level.buttons.find(b=>b.id===1)?.pressed || false;

    let qBtn2 = level.quests.find(q => q.id === "btn2");
    if(qBtn2) qBtn2.done = level.buttons.find(b=>b.id===2)?.pressed || false;

    let qCoins = level.quests.find(q => q.id === "coins");
    if(qCoins) {
        qCoins.count = collectedCoins;
        qCoins.text = `Collecter 5 sphères dorées (${collectedCoins}/5)`;
        qCoins.done = (collectedCoins >= 5);
    }
}

function checkWinCondition(players, level) {
    let pList = Object.values(players);
    if(pList.length === 0) return false;
    
    for(let p of pList) {
        let dx = p.x - level.exit.x;
        let dy = p.y - level.exit.y;
        let dist = Math.sqrt(dx*dx + dy*dy);
        if(dist > level.exit.r + 20) {
            return false;
        }
    }
    return true;
}

module.exports = {
    generateLevel,
    applyPhysics,
    updateTriggers,
    checkWinCondition
};

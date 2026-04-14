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

    // Borders
    level.walls.push({ x: 0, y: 0, w: 2000, h: 50 });
    level.walls.push({ x: 0, y: 1950, w: 2000, h: 50 });
    level.walls.push({ x: 0, y: 0, w: 50, h: 2000 });
    level.walls.push({ x: 1950, y: 0, w: 50, h: 2000 });

    let isSticky = (playerCount <= 1);

    // Cross partition coordinates
    let jx = 600 + Math.random() * 800; // 600 to 1400
    let jy = 600 + Math.random() * 800;

    let gapW = 200;

    // Door configurations
    let d1y = 100 + Math.random() * (jy - gapW - 100);
    let d2x = jx + 50 + Math.random() * (1900 - jx - gapW - 50);

    // Wall V Top
    level.walls.push({ x: jx, y: 0, w: 50, h: d1y });
    level.doors.push({ id: 1, x: jx, y: d1y, w: 50, h: gapW, linkedButton: 1, open: false });
    level.walls.push({ x: jx, y: d1y + gapW, w: 50, h: jy - (d1y + gapW) + 50 });

    // Wall V Bottom (Open Gap)
    let gapS_y = jy + 50 + Math.random() * (1900 - jy - gapW - 50);
    level.walls.push({ x: jx, y: jy + 50, w: 50, h: gapS_y - (jy + 50) });
    level.walls.push({ x: jx, y: gapS_y + gapW, w: 50, h: 2000 - (gapS_y + gapW) });

    // Wall H Left (Open Gap)
    let gapW_x = 100 + Math.random() * (jx - gapW - 100);
    level.walls.push({ x: 0, y: jy, w: gapW_x, h: 50 });
    level.walls.push({ x: gapW_x + gapW, y: jy, w: jx - (gapW_x + gapW), h: 50 });

    // Wall H Right
    level.walls.push({ x: jx + 50, y: jy, w: d2x - (jx + 50), h: 50 });
    level.doors.push({ id: 2, x: d2x, y: jy, w: gapW, h: 50, linkedButton: 2, open: false });
    level.walls.push({ x: d2x + gapW, y: jy, w: 2000 - (d2x + gapW), h: 50 });

    // Scatter 15 random obstacles
    for (let i = 0; i < 15; i++) {
        let w = 50 + Math.random() * 200;
        let h = 50 + Math.random() * 200;
        let x = 100 + Math.random() * 1600;
        let y = 100 + Math.random() * 1600;

        // Don't block Spawn (0-400, 0-400)
        if (x < 400 && y < 400) continue;
        // Don't block Exit (1600-2000, 1600-2000)
        if (x > 1500 && y > 1500) continue;
        // Don't block horizontal wall and doors
        if (x > jx - 100 && x < jx + 150) continue;
        if (y > jy - 100 && y < jy + 150) continue;

        level.walls.push({ x, y, w, h });
    }

    // Button 1 in Bottom-Left (Room 3)
    let b1x = 100 + Math.random() * (jx - 200);
    let b1y = jy + 100 + Math.random() * (1800 - jy);

    // Button 2 in Top-Right (Room 2)
    let b2x = jx + 100 + Math.random() * (1800 - jx);
    let b2y = 100 + Math.random() * (jy - 200);

    let reqRed = Math.max(1, Math.ceil(playerCount / 2));
    let reqBlue = Math.max(1, Math.floor(playerCount / 2));

    level.buttons.push({ id: 1, x: b1x, y: b1y, r: 40, reqShape: null, reqCount: reqRed, color: '#e74c3c', pressed: false, currentCount: 0, sticky: isSticky });
    level.buttons.push({ id: 2, x: b2x, y: b2y, r: 50, reqCount: reqBlue, color: '#3498db', pressed: false, currentCount: 0, sticky: isSticky });

    let coinCount = Math.max(Math.min(5, playerCount * 2), 3); // 3 to 10 depending on players
    for (let i = 0; i < coinCount; i++) {
        level.coins.push({
            x: 100 + Math.random() * 1800,
            y: 100 + Math.random() * 1800,
            collected: false
        });
    }

    level.quests = [
        { id: "btn1", text: `Mode Coop : activer plaque Rouge (${reqRed} j.)`, done: false },
        { id: "btn2", text: `Mode Coop : activer plaque Bleue (${reqBlue} j.)`, done: false },
        { id: "coins", text: `Collecter ${coinCount} sphères dorées (0/${coinCount})`, done: false, count: 0, total: coinCount },
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
        let distance = Math.sqrt((distX * distX) + (distY * distY));

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
    for (let b of level.buttons) {
        if (!b.sticky || !b.pressed) {
            b.pressed = false;
        }
        b.currentCount = 0;
    }

    let pList = Object.values(players);
    for (let p of pList) {
        for (let b of level.buttons) {
            let dx = p.x - b.x;
            let dy = p.y - b.y;
            let dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < b.r + 20) {
                if (b.reqShape && p.shape === b.reqShape) {
                    b.pressed = true;
                }
                if (b.reqCount) {
                    b.currentCount++;
                    if (b.currentCount >= b.reqCount) b.pressed = true;
                } else if (!b.reqShape) {
                    b.pressed = true;
                }
            }
        }
    }

    for (let d of level.doors) {
        let btn = level.buttons.find(b => b.id === d.linkedButton);
        if (btn && btn.pressed) {
            d.open = true;
        } else {
            d.open = false;
        }
    }

    let collectedCoins = 0;
    let pListArray = Object.values(players);
    for (let c of level.coins) {
        if (!c.collected) {
            for (let p of pListArray) {
                let dx = p.x - c.x;
                let dy = p.y - c.y;
                if (Math.sqrt(dx * dx + dy * dy) < 35) {
                    c.collected = true;
                }
            }
        }
        if (c.collected) collectedCoins++;
    }

    let qBtn1 = level.quests.find(q => q.id === "btn1");
    if (qBtn1) qBtn1.done = level.buttons.find(b => b.id === 1)?.pressed || false;

    let qBtn2 = level.quests.find(q => q.id === "btn2");
    if (qBtn2) qBtn2.done = level.buttons.find(b => b.id === 2)?.pressed || false;

    let qCoins = level.quests.find(q => q.id === "coins");
    if (qCoins) {
        qCoins.count = collectedCoins;
        let total = qCoins.total || 5;
        qCoins.text = `Collecter ${total} sphères dorées (${collectedCoins}/${total})`;
        qCoins.done = (collectedCoins >= total);
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

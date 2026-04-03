// ============================================================
// Bancal — Game Logic
// ============================================================

const HATS  = ['wizard','crown','party','tophat','cowboy','propeller','chef','cap','santa','pirate'];
const SHAPES = ['square','triangle','circle','cross','star'];
const COLORS = ['#e74c3c','#3498db','#2ecc71','#f1c40f','#9b59b6','#e67e22','#1abc9c','#e91e63','#00bcd4','#ff5722'];

// Expose for server.js
const PLAYER_DEFAULTS = { HATS, SHAPES, COLORS };

// -----------------------------------------------------------
// Level Generation
// -----------------------------------------------------------
function generateLevel(playerCount) {
    const pc = Math.max(1, playerCount);
    const level = {
        width: 2400,
        height: 2400,
        walls: [],
        buttons: [],
        doors: [],
        coins: [],
        quests: [],
        sequence: { current: 0, max: 3, done: false },
        exit: { x: 2150, y: 2150, r: 70 }
    };

    // ---- Border walls ----
    level.walls.push({ x:0,    y:0,    w:2400, h:50   });
    level.walls.push({ x:0,    y:2350, w:2400, h:50   });
    level.walls.push({ x:0,    y:0,    w:50,   h:2400 });
    level.walls.push({ x:2350, y:0,    w:50,   h:2400 });

    // ---- Vertical room dividers (with gaps for passages) ----
    level.walls.push({ x:700,  y:50,   w:50, h:500  });  // V1-top (gap 550-700 = passage)
    level.walls.push({ x:700,  y:700,  w:50, h:700  });  // V1-mid (gap 1400-1500)
    level.walls.push({ x:700,  y:1500, w:50, h:850  });  // V1-bot

    level.walls.push({ x:1400, y:50,   w:50, h:350  });  // V2-top (gap 400-600)
    level.walls.push({ x:1400, y:600,  w:50, h:700  });  // V2-mid (gap 1300-1400)
    level.walls.push({ x:1400, y:1400, w:50, h:950  });  // V2-bot

    level.walls.push({ x:2000, y:50,   w:50, h:750  });  // V3 (gap 800-900)
    level.walls.push({ x:2000, y:900,  w:50, h:1450 });  // V3-bot

    // ---- Horizontal inner walls ----
    level.walls.push({ x:50,   y:750,  w:500, h:50  });
    level.walls.push({ x:750,  y:550,  w:500, h:50  });
    level.walls.push({ x:750,  y:1300, w:500, h:50  });
    level.walls.push({ x:1450, y:850,  w:400, h:50  });
    level.walls.push({ x:50,   y:1600, w:500, h:50  });
    level.walls.push({ x:1450, y:1850, w:400, h:50  });

    // ---- Decorative inner obstacles ----
    level.walls.push({ x:900,  y:200,  w:50,  h:200 });
    level.walls.push({ x:1700, y:1100, w:200, h:50  });

    // ---- Buttons ----
    // 1 = Square plate (red)
    level.buttons.push({ id:1, x:1050, y:200,  r:50, reqShape:'square',   color:'#e74c3c', pressed:false });
    // 2 = Triangle plate (blue)
    level.buttons.push({ id:2, x:350,  y:1900, r:50, reqShape:'triangle', color:'#3498db', pressed:false });
    // 3 = Circle plate (teal)
    level.buttons.push({ id:3, x:1700, y:500,  r:50, reqShape:'circle',   color:'#1abc9c', pressed:false });
    // 4 = Coop plate (purple)
    const coopNeed = Math.min(3, Math.max(2, pc));
    level.buttons.push({ id:4, x:250, y:1050, r:60, reqCount:coopNeed, color:'#9b59b6', pressed:false, currentCount:0 });
    // 5 = Riddle plate (yellow)
    level.buttons.push({ id:5, x:950, y:1100, r:50, isRiddle:true, color:'#f1c40f', pressed:false, riddleAnswer:true, riddleAnswered:false });
    // 6,7,8 = Sequence plates (orange tones)
    level.buttons.push({ id:6, x:1700, y:1650, r:40, seqOrder:1, color:'#ff5722', pressed:false, seqPressed:false });
    level.buttons.push({ id:7, x:1900, y:1750, r:40, seqOrder:2, color:'#ff9800', pressed:false, seqPressed:false });
    level.buttons.push({ id:8, x:2100, y:1650, r:40, seqOrder:3, color:'#ffc107', pressed:false, seqPressed:false });

    // ---- Doors linked to shape-plates ----
    level.doors.push({ id:1, x:1400, y:350,  w:50,  h:250, linkedButton:1, open:false });
    level.doors.push({ id:2, x:700,  y:1500, w:50,  h:200, linkedButton:2, open:false });
    level.doors.push({ id:3, x:2000, y:750,  w:50,  h:150, linkedButton:3, open:false });
    level.doors.push({ id:4, x:50,   y:750,  w:500, h:50,  linkedButton:4, open:false });

    // ---- Coins/Crystals ----
    const coinPos = [
        [300,300],[550,1550],[1500,300],[1650,1750],[950,900],
        [2100,400],[400,900],[1850,1950],[1200,2100],[600,2050],
        [1100,700],[2200,1200]
    ];
    for(let cp of coinPos) {
        level.coins.push({ x:cp[0], y:cp[1], collected:false });
    }

    const coinTotal = level.coins.length;
    const coopCount = coopNeed;

    // ---- Quests ----
    level.quests = [
        {
            id:'sq_plate', type:'plate_shape', emoji:'🟥',
            title:'Plaque du Carré',
            description:'Le joueur CARRÉ doit se tenir sur la plaque rouge !',
            hint:'Zone Nord-Centre', targetX:1050, targetY:200,
            done:false, linkedButton:1
        },
        {
            id:'tri_plate', type:'plate_shape', emoji:'🔷',
            title:'Plaque du Triangle',
            description:'Le joueur TRIANGLE doit activer la plaque bleue !',
            hint:'Zone Sud-Ouest', targetX:350, targetY:1900,
            done:false, linkedButton:2
        },
        {
            id:'circle_plate', type:'plate_shape', emoji:'🟢',
            title:'Plaque du Cercle',
            description:'Le joueur CERCLE doit activer la plaque verte !',
            hint:'Zone Nord-Est', targetX:1700, targetY:500,
            done:false, linkedButton:3
        },
        {
            id:'riddle', type:'riddle', emoji:'💡',
            title:'L\'Énigme du Sphinx',
            description:'Approchez la plaque jaune. Sur votre manette répondez : "Un carré a-t-il 4 côtés ?" → A=OUI  B=NON',
            hint:'Zone Centre', targetX:950, targetY:1100,
            done:false, linkedButton:5
        },
        {
            id:'coop', type:'coop', emoji:'🤝',
            title:`Solidarité (${coopCount} joueurs)`,
            description:`Soyez ${coopCount} joueurs simultanément sur la plaque violette !`,
            hint:'Zone Ouest', targetX:250, targetY:1050,
            done:false, count:0, needed:coopCount, linkedButton:4
        },
        {
            id:'coins', type:'collect', emoji:'💎',
            title:'Cristaux Perdus',
            description:`Collectez les ${coinTotal} cristaux cachés sur la carte !`,
            hint:'Cherchez partout !',
            done:false, count:0, total:coinTotal
        },
        {
            id:'sequence', type:'sequence', emoji:'🔢',
            title:'La Séquence Secrète',
            description:'Activez les 3 plaques orange dans l\'ordre : 1 → 2 → 3 !',
            hint:'Zone Sud-Est', targetX:1900, targetY:1700,
            done:false, progress:0
        },
        {
            id:'exit', type:'exit', emoji:'🚪',
            title:'La Grande Sortie',
            description:'TOUS les joueurs doivent rejoindre la sortie ensemble !',
            hint:'Coin Sud-Est', targetX:2150, targetY:2150,
            done:false
        }
    ];

    return level;
}

// -----------------------------------------------------------
// Physics
// -----------------------------------------------------------
function checkWallCollision(p, walls, doors) {
    const pr = 20;
    const obstacles = walls.concat(doors.filter(d => !d.open));
    for(let w of obstacles) {
        let tx = Math.max(w.x, Math.min(p.x, w.x + w.w));
        let ty = Math.max(w.y, Math.min(p.y, w.y + w.h));
        let dx = p.x - tx, dy = p.y - ty;
        if(dx*dx + dy*dy <= pr*pr) return true;
    }
    return false;
}

function applyPhysics(player, level) {
    const speed = 5;
    let nx = player.x + player.vx * speed;
    player.x = nx;
    if(checkWallCollision(player, level.walls, level.doors)) player.x -= player.vx * speed;

    let ny = player.y + player.vy * speed;
    player.y = ny;
    if(checkWallCollision(player, level.walls, level.doors)) player.y -= player.vy * speed;

    // Clamp to level bounds
    player.x = Math.max(70, Math.min(level.width  - 70, player.x));
    player.y = Math.max(70, Math.min(level.height - 70, player.y));
}

// -----------------------------------------------------------
// Trigger / Quest Updates
// -----------------------------------------------------------
function updateTriggers(players, level) {
    const pList = Object.values(players);

    // Reset dynamic button states
    for(let b of level.buttons) {
        if(!b.seqOrder && !b.isRiddle) {
            b.pressed = false;
        }
        if(b.reqCount !== undefined) b.currentCount = 0;
    }

    // Check each player against each button
    for(let p of pList) {
        for(let b of level.buttons) {
            const dx = p.x - b.x, dy = p.y - b.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            if(dist < b.r + 20) {
                // Shape plate
                if(b.reqShape && p.shape === b.reqShape) {
                    b.pressed = true;
                }
                // Coop plate
                if(b.reqCount !== undefined) {
                    b.currentCount++;
                    if(b.currentCount >= b.reqCount) b.pressed = true;
                }
            }
        }
    }

    // Sequence logic: permanent once stepped in order
    let seqButtons = level.buttons.filter(b => b.seqOrder).sort((a,b) => a.seqOrder - b.seqOrder);
    let seqDone = true;
    for(let sb of seqButtons) {
        if(!sb.seqPressed) { seqDone = false; break; }
    }
    if(seqDone) { level.sequence.done = true; }

    // Check if player is on a sequence button in correct order
    for(let p of pList) {
        for(let sb of seqButtons) {
            const dx = p.x - sb.x, dy = p.y - sb.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            if(dist < sb.r + 20 && !sb.seqPressed) {
                // Only press if it's the next in sequence
                const currentSeq = level.sequence.current;
                if(sb.seqOrder === currentSeq + 1) {
                    sb.seqPressed = true;
                    sb.pressed = true;
                    level.sequence.current++;
                }
                // Wrong order: reset sequence
                else if(sb.seqOrder !== currentSeq) {
                    // Reset all sequence buttons
                    for(let rsb of seqButtons) {
                        rsb.seqPressed = false;
                        rsb.pressed = false;
                    }
                    level.sequence.current = 0;
                }
                break;
            }
        }
    }
    // Keep sequence buttons pressed if done
    for(let sb of seqButtons) {
        if(sb.seqPressed) sb.pressed = true;
    }

    // Update doors
    for(let d of level.doors) {
        const btn = level.buttons.find(b => b.id === d.linkedButton);
        d.open = !!(btn && btn.pressed);
    }

    // Collect coins
    let collected = 0;
    for(let c of level.coins) {
        if(!c.collected) {
            for(let p of pList) {
                const dx = p.x - c.x, dy = p.y - c.y;
                if(Math.sqrt(dx*dx + dy*dy) < 35) c.collected = true;
            }
        }
        if(c.collected) collected++;
    }

    // ---- Update quests ----
    for(let q of level.quests) {
        switch(q.type) {
            case 'plate_shape': {
                const btn = level.buttons.find(b => b.id === q.linkedButton);
                q.done = !!(btn && btn.pressed);
                break;
            }
            case 'coop': {
                const btn = level.buttons.find(b => b.id === q.linkedButton);
                q.count = btn ? btn.currentCount : 0;
                q.done = !!(btn && btn.pressed);
                break;
            }
            case 'riddle': {
                const btn = level.buttons.find(b => b.id === q.linkedButton);
                q.done = !!(btn && btn.riddleAnswered && btn.pressed);
                break;
            }
            case 'collect': {
                q.count = collected;
                q.done = (collected >= q.total);
                break;
            }
            case 'sequence': {
                q.progress = level.sequence.current;
                q.done = level.sequence.done;
                break;
            }
            case 'exit': {
                // Updated in checkWinCondition
                break;
            }
        }
    }
}

// -----------------------------------------------------------
// Win Condition
// -----------------------------------------------------------
function checkWinCondition(players, level) {
    const pList = Object.values(players);
    if(pList.length === 0) return false;

    // All non-exit quests must be done
    const nonExitQuests = level.quests.filter(q => q.type !== 'exit');
    const allQuestsDone = nonExitQuests.every(q => q.done);
    if(!allQuestsDone) return false;

    // All players at exit
    for(let p of pList) {
        const dx = p.x - level.exit.x, dy = p.y - level.exit.y;
        if(Math.sqrt(dx*dx + dy*dy) > level.exit.r + 20) return false;
    }

    // Mark exit quest
    const exitQ = level.quests.find(q => q.type === 'exit');
    if(exitQ) exitQ.done = true;
    return true;
}

// -----------------------------------------------------------
// Quest Progress (overall %)
// -----------------------------------------------------------
function getQuestProgress(level) {
    if(!level || !level.quests || level.quests.length === 0) return 0;
    const done = level.quests.filter(q => q.done).length;
    return Math.round((done / level.quests.length) * 100);
}

module.exports = {
    generateLevel,
    applyPhysics,
    updateTriggers,
    checkWinCondition,
    getQuestProgress,
    PLAYER_DEFAULTS
};

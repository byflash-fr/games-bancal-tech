// ─────────────────────────────────────────────────────────────
//  gameLogic.js  –  Génération de niveau en 4 salles + maze
// ─────────────────────────────────────────────────────────────

// ── Constantes ──────────────────────────────────────────────
const PLAYER_R = 20;  // rayon du joueur
const WALL_T = 40;  // épaisseur des murs séparateurs
const DOOR_W = 100; // largeur d'une porte
const SAFE_R = 120; // rayon de dégagement autour des points importants
const MAZE_CELL = 120; // taille d'une cellule de labyrinthe
const MAZE_WALL = 20;  // épaisseur des murs du labyrinthe

function getDist(p1, p2) { return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2)); }

// Calcule la taille de la map selon le nombre de joueurs
function mapSizeForPlayers(playerCount) {
    const n = Math.max(1, playerCount);
    // Chaque joueur ajoute ~300px de côté à la map (min 1800, max 3600)
    const side = Math.min(3600, Math.max(1800, 1600 + n * 200));
    return side;
}

// ── Utilitaires de génération ─────────────────────────────────

/** Retourne un entier aléatoire dans [min, max[ */
function rInt(min, max) { return Math.floor(Math.random() * (max - min)) + min; }

/** Vérifie si deux rectangles se chevauchent (avec marge) */
function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh, margin = 0) {
    return ax < bx + bw + margin &&
        ax + aw + margin > bx &&
        ay < by + bh + margin &&
        ay + ah + margin > by;
}

/** Vérifie si un rectangle {x,y,w,h} empiète sur un cercle de rayon r autour de (cx,cy) */
function rectInCircle(rx, ry, rw, rh, cx, cy, r) {
    const nearX = Math.max(rx, Math.min(cx, rx + rw));
    const nearY = Math.max(ry, Math.min(cy, ry + rh));
    const dx = cx - nearX, dy = cy - nearY;
    return dx * dx + dy * dy < r * r;
}

// ─────────────────────────────────────────────────────────────
//  Génération du labyrinthe dans une salle
//  Algorithme : Growing-Tree / Recursive-Backtracker sur grille
// ─────────────────────────────────────────────────────────────

/**
 * safePoints : [{x,y,r}]  – zones à ne pas obstruer
 * doorRects  : [{x,y,w,h}] – couloirs de porte à laisser libres
 */
function generateMazeWalls(roomX, roomY, roomW, roomH, safePoints, doorRects) {
    const innerX = roomX + WALL_T;
    const innerY = roomY + WALL_T;
    const innerW = roomW - 2 * WALL_T;
    const innerH = roomH - 2 * WALL_T;

    const cols = Math.floor(innerW / MAZE_CELL);
    const rows = Math.floor(innerH / MAZE_CELL);
    if (cols < 2 || rows < 2) return [];

    // Grille de cellules visitées
    const visited = Array.from({ length: rows }, () => new Array(cols).fill(false));

    // Connexions entre cellules adjacentes (les murs "ouverts")
    // hWalls[r][c] = true → pas de mur entre (r,c) et (r,c+1)
    // vWalls[r][c] = true → pas de mur entre (r,c) et (r+1,c)
    const hOpen = Array.from({ length: rows }, () => new Array(cols).fill(false));
    const vOpen = Array.from({ length: rows }, () => new Array(cols).fill(false));

    function cellCenter(r, c) {
        return {
            x: innerX + c * MAZE_CELL + MAZE_CELL / 2,
            y: innerY + r * MAZE_CELL + MAZE_CELL / 2
        };
    }

    function isSafe(r, c) {
        const cc = cellCenter(r, c);
        for (const sp of safePoints) {
            const dx = cc.x - sp.x, dy = cc.y - sp.y;
            if (dx * dx + dy * dy < sp.r * sp.r) return true;
        }
        return false;
    }

    // Recursive backtracker
    const stack = [];
    const startR = rInt(0, rows), startC = rInt(0, cols);
    visited[startR][startC] = true;
    stack.push([startR, startC]);

    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    while (stack.length > 0) {
        const [r, c] = stack[stack.length - 1];
        const shuffled = dirs.slice().sort(() => Math.random() - 0.5);
        let moved = false;
        for (const [dr, dc] of shuffled) {
            const nr = r + dr, nc = c + dc;
            if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
            if (visited[nr][nc]) continue;
            // Ouvre le passage
            if (dr === 0 && dc === 1) hOpen[r][c] = true;
            if (dr === 0 && dc === -1) hOpen[r][nc] = true;
            if (dr === 1 && dc === 0) vOpen[r][c] = true;
            if (dr === -1 && dc === 0) vOpen[nr][c] = true;
            visited[nr][nc] = true;
            stack.push([nr, nc]);
            moved = true;
            break;
        }
        if (!moved) stack.pop();
    }

    // Convertit la grille en murs rectangulaires
    const walls = [];

    function addWall(x, y, w, h) {
        // Vérifie qu'on ne bloque pas une zone safe ou une porte
        for (const sp of safePoints) {
            if (rectInCircle(x, y, w, h, sp.x, sp.y, sp.r)) return;
        }
        for (const dr of doorRects) {
            if (rectsOverlap(x, y, w, h, dr.x, dr.y, dr.w, dr.h, PLAYER_R + 5)) return;
        }
        walls.push({ x, y, w, h });
    }

    // Murs verticaux (entre colonnes)
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols - 1; c++) {
            if (!hOpen[r][c]) {
                const wx = innerX + (c + 1) * MAZE_CELL - MAZE_WALL / 2;
                const wy = innerY + r * MAZE_CELL;
                addWall(wx, wy, MAZE_WALL, MAZE_CELL);
            }
        }
    }

    // Murs horizontaux (entre lignes)
    for (let r = 0; r < rows - 1; r++) {
        for (let c = 0; c < cols; c++) {
            if (!vOpen[r][c]) {
                const wx = innerX + c * MAZE_CELL;
                const wy = innerY + (r + 1) * MAZE_CELL - MAZE_WALL / 2;
                addWall(wx, wy, MAZE_CELL, MAZE_WALL);
            }
        }
    }

    return walls;
}

// ─────────────────────────────────────────────────────────────
//  generateLevel  – point d'entrée principal
// ─────────────────────────────────────────────────────────────

function generateLevel(playerCount) {
    const side = mapSizeForPlayers(playerCount);
    const half = Math.floor(side / 2);

    const rooms = {
        A: { x: 0, y: 0, w: half, h: half }, // Spawn
        B: { x: half, y: 0, w: half, h: half }, // Tampon
        C: { x: 0, y: half, w: half, h: half }, // Fermée 1
        D: { x: half, y: half, w: half, h: half }  // Sortie
    };

    const margin = 80;

    const spawnX = rooms.A.x + margin;
    const spawnY = rooms.A.y + margin;

    const exitX = rooms.D.x + rooms.D.w / 2;
    const exitY = rooms.D.y + rooms.D.h / 2;
    const exitR = 50;

    const btn1X = rooms.B.x + rooms.B.w / 2;
    const btn1Y = rooms.B.y + rooms.B.h / 2;

    const btn2X = rooms.C.x + rooms.C.w / 2;
    const btn2Y = rooms.C.y + rooms.C.h / 2;

    const doorAB_x = half - WALL_T;
    const doorAB_y = half / 2 - DOOR_W / 2;

    const doorAC_x = half / 2 - DOOR_W / 2;
    const doorAC_y = half - WALL_T;

    const doorBD_x = half + half / 2 - DOOR_W / 2;
    const doorBD_y = half - WALL_T;

    const doorCD_x = half - WALL_T;
    const doorCD_y = half + half / 2 - DOOR_W / 2;

    const level = {
        width: side,
        height: side,
        walls: [],
        buttons: [],
        doors: [],
        spikes: [],
        coins: [],
        quests: [],
        spawnX,
        spawnY,
        exit: { x: exitX, y: exitY, r: exitR, active: false },
        rooms: rooms
    };

    level.walls.push({ x: 0, y: 0, w: side, h: WALL_T });
    level.walls.push({ x: 0, y: side - WALL_T, w: side, h: WALL_T });
    level.walls.push({ x: 0, y: 0, w: WALL_T, h: side });
    level.walls.push({ x: side - WALL_T, y: 0, w: WALL_T, h: side });

    level.walls.push({ x: half - WALL_T, y: WALL_T, w: WALL_T, h: doorAB_y - WALL_T });
    level.walls.push({ x: half - WALL_T, y: doorAB_y + DOOR_W, w: WALL_T, h: half - (doorAB_y + DOOR_W) });

    level.walls.push({ x: half - WALL_T, y: half + WALL_T, w: WALL_T, h: doorCD_y - (half + WALL_T) });
    level.doors.push({ id: 2, x: half - WALL_T, y: doorCD_y, w: WALL_T, h: DOOR_W, linkedButton: 2, open: false });
    level.walls.push({ x: half - WALL_T, y: doorCD_y + DOOR_W, w: WALL_T, h: side - WALL_T - (doorCD_y + DOOR_W) });

    level.walls.push({ x: WALL_T, y: half - WALL_T, w: doorAC_x - WALL_T, h: WALL_T });
    level.walls.push({ x: doorAC_x + DOOR_W, y: half - WALL_T, w: half - WALL_T - (doorAC_x + DOOR_W), h: WALL_T });

    level.walls.push({ x: half + WALL_T, y: half - WALL_T, w: doorBD_x - (half + WALL_T), h: WALL_T });
    level.doors.push({ id: 1, x: doorBD_x, y: half - WALL_T, w: DOOR_W, h: WALL_T, linkedButton: 1, open: false });
    level.walls.push({ x: doorBD_x + DOOR_W, y: half - WALL_T, w: side - WALL_T - (doorBD_x + DOOR_W), h: WALL_T });

    level.walls.push({ x: half - WALL_T, y: half - WALL_T, w: WALL_T * 2, h: WALL_T * 2 });

    const isSticky = (playerCount <= 1);
    const reqCount1 = Math.max(1, Math.ceil(playerCount / 2));
    const reqCount2 = Math.max(1, playerCount);

    level.buttons.push({
        id: 1, x: btn1X, y: btn1Y, r: 45,
        reqCount: reqCount1, color: '#3498db',
        pressed: false, currentCount: 0, sticky: isSticky,
        label: 'TAMPON'
    });
    level.buttons.push({
        id: 2, x: btn2X, y: btn2Y, r: 45,
        reqCount: reqCount2, color: '#e74c3c',
        pressed: false, currentCount: 0, sticky: false,
        label: 'UNLOCK'
    });

    // ── Il est crucial que coinCount soit défini ICI avant son utilisation dans level.quests ──
    const coinCount = Math.max(3, Math.min(10, playerCount * 2));

    level.quests = [
        { id: "btn1", text: `Activer la plaque Tampon (${reqCount1} j.)`, done: false },
        { id: "btn2", text: `Activer la plaque Verrou (${reqCount2} j.)`, done: false },
        {
            id: "coins", text: `Collecter ${coinCount} sphères (0/${coinCount})`,
            done: false, count: 0, total: coinCount
        },
        { id: "exit", text: "Tous rejoindre la SORTIE", done: false }
    ];

    const safePts = {
        A: [
            { x: spawnX, y: spawnY, r: SAFE_R },
            { x: rooms.A.x + doorAB_x - rooms.A.x + WALL_T / 2, y: rooms.A.y + doorAB_y + DOOR_W / 2, r: DOOR_W },
            { x: rooms.A.x + doorAC_x - rooms.A.x + DOOR_W / 2, y: rooms.A.y + half - WALL_T / 2, r: DOOR_W }
        ],
        B: [
            { x: btn1X, y: btn1Y, r: SAFE_R },
            { x: half + half / 2, y: half / 2, r: DOOR_W },
            { x: doorBD_x + DOOR_W / 2, y: half - WALL_T / 2, r: DOOR_W }
        ],
        C: [
            { x: btn2X, y: btn2Y, r: SAFE_R },
            { x: half / 2, y: half + margin, r: DOOR_W },
            { x: half - WALL_T / 2, y: doorCD_y + DOOR_W / 2, r: DOOR_W }
        ],
        D: [
            { x: exitX, y: exitY, r: exitR + SAFE_R * 0.8 },
            { x: doorBD_x + DOOR_W / 2, y: half + margin, r: DOOR_W },
            { x: half + WALL_T / 2, y: doorCD_y + DOOR_W / 2, r: DOOR_W }
        ]
    };

    const doorRectsAB = [{ x: doorAB_x, y: doorAB_y, w: WALL_T, h: DOOR_W }];
    const doorRectsAC = [{ x: doorAC_x, y: doorAC_y, w: DOOR_W, h: WALL_T }];
    const doorRectsBD = [{ x: doorBD_x, y: doorBD_y, w: DOOR_W, h: WALL_T }];
    const doorRectsCD = [{ x: doorCD_x, y: doorCD_y, w: WALL_T, h: DOOR_W }];

    const mazeA = generateMazeWalls(rooms.A.x, rooms.A.y, rooms.A.w, rooms.A.h, safePts.A, [...doorRectsAB, ...doorRectsAC]);
    const mazeB = generateMazeWalls(rooms.B.x, rooms.B.y, rooms.B.w, rooms.B.h, safePts.B, [...doorRectsAB, ...doorRectsBD]);
    const mazeC = generateMazeWalls(rooms.C.x, rooms.C.y, rooms.C.w, rooms.C.h, safePts.C, [...doorRectsAC, ...doorRectsCD]);
    const mazeD = generateMazeWalls(rooms.D.x, rooms.D.y, rooms.D.w, rooms.D.h, safePts.D, [...doorRectsBD, ...doorRectsCD]);

    level.walls.push(...mazeA, ...mazeB, ...mazeC, ...mazeD);

    const roomList = ['A', 'B', 'C', 'D'];

    for (let i = 0; i < coinCount; i++) {
        const rKey = roomList[i % 4];
        const r = rooms[rKey];
        let valid = false;
        let attempts = 0;
        let cx, cy;

        while (!valid && attempts < 50) {
            cx = r.x + margin + Math.random() * (r.w - margin * 2);
            cy = r.y + margin + Math.random() * (r.h - margin * 2);
            valid = !checkWallCollision({ x: cx, y: cy }, level.walls, level.doors);
            attempts++;
        }

        if (valid) {
            level.coins.push({
                x: cx,
                y: cy,
                collected: false
            });
        }
    }
    // ─ NOUVELLE MÉCANIQUE : Le Code Secret (Information Asymétrique) ─
    const colors = ['#e74c3c', '#2ecc71', '#3498db', '#f1c40f', '#9b59b6'];
    level.secretCode = [];
    for(let i=0; i<3; i++) {
        level.secretCode.push(colors[rInt(0, colors.length)]);
    }
    level.sequenceIndex = 0;
    
    // On place l'indice peint au sol dans la salle A (Spawn)
    level.floorClues = [{
        x: rooms.A.x + margin + 40,
        y: rooms.A.y + margin + 150,
        colors: level.secretCode
    }];

    // On place les boutons de séquence dans la salle D (Sortie)
    level.sequenceButtons = [];
    const seqStartX = rooms.D.x + margin;
    const seqStartY = rooms.D.y + margin;
    for(let i=0; i<colors.length; i++) {
        level.sequenceButtons.push({
            id: `seq_${i}`, x: seqStartX + i*60, y: seqStartY, r: 20,
            color: colors[i], isPressed: false, cooldown: 0
        });
    }

    // ─ NOUVELLE MÉCANIQUE : Les Reliques ─
    level.relics = [];
    const relicCount = Math.max(1, playerCount); // 1 relique par joueur
    for (let i = 0; i < relicCount; i++) {
        const rKey = roomList[(i + 1) % 4]; // Distribuées ailleurs que le spawn si possible
        const r = rooms[rKey];
        let valid = false;
        let cx, cy;
        let attempts = 0;
        while (!valid && attempts < 50) {
            cx = r.x + margin + Math.random() * (r.w - margin * 2);
            cy = r.y + margin + Math.random() * (r.h - margin * 2);
            valid = !checkWallCollision({ x: cx, y: cy }, level.walls, level.doors);
            attempts++;
        }
        if (valid) level.relics.push({ x: cx, y: cy, collected: false });
    }

    // Ajout des nouvelles quêtes à la liste
    level.quests.push({ id: "code", text: "Craquer le code couleur (Trouvez l'indice !)", done: false });
    level.quests.push({ id: "relics", text: `Trouver les Artefacts (0/${relicCount})`, done: false, count: 0, total: relicCount });
    // --- NOUVELLE MÉCANIQUE : Les Pièges (Traps) ---
    level.traps = [];
    const trapCount = Math.max(4, playerCount * 3); // De plus en plus de pièges !
    for (let i = 0; i < trapCount; i++) {
        const rKey = roomList[i % 4];
        const r = rooms[rKey];
        let valid = false;
        let attempts = 0;
        let cx, cy;
        
        while (!valid && attempts < 50) {
            cx = r.x + margin + Math.random() * (r.w - margin * 2);
            cy = r.y + margin + Math.random() * (r.h - margin * 2);
            // On vérifie que ça ne spawn ni dans un mur, ni trop près du spawn
            valid = !checkWallCollision({ x: cx, y: cy }, level.walls, level.doors);
            if (rKey === 'A' && getDist({x: cx, y: cy}, {x: spawnX, y: spawnY}) < 200) valid = false;
            attempts++;
        }
        if (valid) {
            level.traps.push({ x: cx, y: cy, active: true });
        }
    }

    return level;
}

function checkWallCollision(p, walls, doors) {
    const pr = PLAYER_R;

    for (let w of walls) {
        const nearX = Math.max(w.x, Math.min(p.x, w.x + w.w));
        const nearY = Math.max(w.y, Math.min(p.y, w.y + w.h));
        const dx = p.x - nearX, dy = p.y - nearY;
        if (dx * dx + dy * dy <= pr * pr) return true;
    }

    for (let d of doors) {
        if (d.open) continue;
        const nearX = Math.max(d.x, Math.min(p.x, d.x + d.w));
        const nearY = Math.max(d.y, Math.min(p.y, d.y + d.h));
        const dx = p.x - nearX, dy = p.y - nearY;
        if (dx * dx + dy * dy <= pr * pr) return true;
    }
    return false;
}

function applyPhysics(player, level) {
    if (player.isDead) return; // Les morts ne bougent plus !
    
    if (player.invuln > 0) player.invuln--; // Baisse l'invincibilité

    const SPEED = 5;

    let newX = player.x + player.vx * SPEED;
    const oldX = player.x;
    player.x = newX;
    if (checkWallCollision(player, level.walls, level.doors)) player.x = oldX;

    let newY = player.y + player.vy * SPEED;
    const oldY = player.y;
    player.y = newY;
    if (checkWallCollision(player, level.walls, level.doors)) player.y = oldY;
}

function updateTriggers(players, level) {
    for (let b of level.buttons) {
        if (!b.sticky || !b.pressed) b.pressed = false;
        b.currentCount = 0;
    }

    const pList = Object.values(players);
    for (let p of pList) {
        if (p.isDead) continue; // 👻 Les fantômes n'ont pas de poids physique !
        for (let b of level.buttons) {
            const dx = p.x - b.x, dy = p.y - b.y;
            if (dx * dx + dy * dy < (b.r + PLAYER_R) * (b.r + PLAYER_R)) {
                b.currentCount++;
                if (b.currentCount >= b.reqCount) b.pressed = true;
            }
        }
    }

    for (let d of level.doors) {
        const btn = level.buttons.find(b => b.id === d.linkedButton);
        d.open = btn ? btn.pressed : false;
    }

    const btn2 = level.buttons.find(b => b.id === 2);
    if (btn2) level.exit.active = btn2.pressed;

    let collectedCoins = 0;
    for (let c of level.coins) {
        if (!c.collected) {
            for (let p of pList) {
                if (p.isDead) continue; // 👻 Les fantômes n'ont pas de poids physique !
                const dx = p.x - c.x, dy = p.y - c.y;
                if (dx * dx + dy * dy < 35 * 35) { c.collected = true; break; }
            }
        }
        if (c.collected) collectedCoins++;
    }

    const qBtn1 = level.quests.find(q => q.id === "btn1");
    if (qBtn1) qBtn1.done = level.buttons.find(b => b.id === 1)?.pressed || false;

    const qBtn2 = level.quests.find(q => q.id === "btn2");
    if (qBtn2) qBtn2.done = level.buttons.find(b => b.id === 2)?.pressed || false;

    const qCoins = level.quests.find(q => q.id === "coins");
    if (qCoins) {
        qCoins.count = collectedCoins;
        const tot = qCoins.total || 5;
        qCoins.text = `Collecter ${tot} sphères (${collectedCoins}/${tot})`;
        qCoins.done = collectedCoins >= tot;
    }
    let codeDone = true;
    if (level.sequenceIndex < level.secretCode.length) {
        codeDone = false;
        for (let sb of level.sequenceButtons) {
            if (sb.cooldown > 0) sb.cooldown--;
            
            for (let p of pList) {
                if (p.isDead) continue; // 👻 Les fantômes n'ont pas de poids physique !
                const dx = p.x - sb.x, dy = p.y - sb.y;
                if (dx * dx + dy * dy < (sb.r + PLAYER_R) * (sb.r + PLAYER_R) && sb.cooldown <= 0) {
                    sb.cooldown = 60; // 1 seconde de cooldown pour éviter les doubles clics
                    
                    // Si on appuie sur la bonne couleur de la séquence
                    if (sb.color === level.secretCode[level.sequenceIndex]) {
                        level.sequenceIndex++;
                    } else {
                        // ERREUR ! On réinitialise la séquence
                        level.sequenceIndex = 0;
                    }
                }
            }
        }
    }

    // --- Vérification des Reliques ---
    let collectedRelics = 0;
    for (let rel of level.relics) {
        if (!rel.collected) {
            for (let p of pList) {
                if (p.isDead) continue; // 👻 Les fantômes n'ont pas de poids physique !
                const dx = p.x - rel.x, dy = p.y - rel.y;
                if (dx * dx + dy * dy < 35 * 35) { rel.collected = true; break; }
            }
        }
        if (rel.collected) collectedRelics++;
    }

    // --- Mise à jour de l'UI des Quêtes ---
    const qCode = level.quests.find(q => q.id === "code");
    if (qCode) qCode.done = codeDone;

    const qRelics = level.quests.find(q => q.id === "relics");
    if (qRelics) {
        qRelics.count = collectedRelics;
        qRelics.text = `Trouver les Artefacts (${collectedRelics}/${qRelics.total})`;
        qRelics.done = collectedRelics >= qRelics.total;
    }
    // --- DÉGÂTS DES PIÈGES ---
    if (level.traps) {
        for (let p of pList) {
            if (p.isDead) continue; // 👻 Les fantômes n'ont pas de poids physique !
            if (p.isDead || p.invuln > 0) continue; // Pas de dégât si mort ou invincible
            
            for (let t of level.traps) {
                const dx = p.x - t.x, dy = p.y - t.y;
                if (dx * dx + dy * dy < (20 + PLAYER_R) * (20 + PLAYER_R)) {
                    p.hp -= 1;
                    p.invuln = 90; // 1.5 seconde d'invincibilité après un hit
                    if (p.hp <= 0) {
                        p.isDead = true;
                    }
                    break; // On ne prend qu'un seul dégât par tick
                }
            }
        }
    }
}

function checkWinCondition(players, level) {
    const pList = Object.values(players);
    if (pList.length === 0) return false;

    if (!level.exit.active) return false;

    let allDead = true;
    for (let p of pList) {
        if (p.isDead) continue; // 👻 Les fantômes n'ont pas de poids physique !
        if (!p.isDead) allDead = false;
    }
    if (allDead) return false; // S'ils sont tous morts, ils n'ont pas gagné (le timer les tuera)

    for (let p of pList) {
        if (p.isDead) continue; // Les morts n'ont pas besoin d'être sur la sortie
        const dx = p.x - level.exit.x, dy = p.y - level.exit.y;
        if (dx * dx + dy * dy > (level.exit.r + PLAYER_R) * (level.exit.r + PLAYER_R)) return false;
    }
    return true;
}
function adjustDifficulty(level, newPlayerCount) {
    if (!level) return;
    const safeCount = Math.max(1, newPlayerCount);

    // Ajuste les boutons lourds qui nécessitent trop de joueurs
    for (let b of level.buttons) {
        if (b.reqCount > safeCount) {
            b.reqCount = safeCount;
        }
    }

    // Met à jour les textes des quêtes
    const qBtn1 = level.quests.find(q => q.id === "btn1");
    if (qBtn1 && !qBtn1.done) qBtn1.text = `Activer la plaque Tampon (${level.buttons.find(b=>b.id===1).reqCount} j.)`;

    const qBtn2 = level.quests.find(q => q.id === "btn2");
    if (qBtn2 && !qBtn2.done) qBtn2.text = `Activer la plaque Verrou (${level.buttons.find(b=>b.id===2).reqCount} j.)`;
}
module.exports = { generateLevel, applyPhysics, updateTriggers, checkWinCondition,adjustDifficulty };
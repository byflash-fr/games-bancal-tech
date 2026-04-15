// ── Constantes ──────────────────────────────────────────────
const PLAYER_R = 20;  // rayon du joueur
const TILE = 40;      // taille d'une tuile monde
const BASE_HP = 2;
const MAX_HP = 4;

/**
 * Spatial Hash Grid – O(1) insert/remove/lookup.
 * Utilise Map<string, Set> : les Set garantissent l'unicité et la
 * suppression en O(1) (contrairement aux Array classiques).
 * Chaque entité conserve sa clé courante dans `entity._gridKey`
 * pour éviter toute recherche lors de remove/update.
 */
class SpatialHashGrid {
    constructor(width, height, cellSize) {
        this.cellSize = cellSize;
        this.grid = new Map(); // Map<"cx,cy", Set<entity>>
    }

    _key(x, y) {
        return `${Math.floor(x / this.cellSize)},${Math.floor(y / this.cellSize)}`;
    }

    insert(entity) {
        const key = this._key(entity.x, entity.y);
        if (!this.grid.has(key)) this.grid.set(key, new Set());
        this.grid.get(key).add(entity);
        entity._gridKey = key; // cache pour remove O(1)
    }

    /** Déplace l'entité dans la grille si elle a changé de cellule. */
    update(entity) {
        const newKey = this._key(entity.x, entity.y);
        if (entity._gridKey !== newKey) {
            this.remove(entity);
            this.insert(entity);
        }
    }

    /** Suppression en O(1) grâce au cache de clé. */
    remove(entity) {
        if (entity._gridKey && this.grid.has(entity._gridKey)) {
            this.grid.get(entity._gridKey).delete(entity);
            // Libère la RAM si la cellule est vide
            if (this.grid.get(entity._gridKey).size === 0) {
                this.grid.delete(entity._gridKey);
            }
        }
        entity._gridKey = null;
    }

    clear() {
        this.grid.clear();
    }

    getNearby(x, y, radius) {
        const results = [];
        const startX = Math.floor((x - radius) / this.cellSize);
        const endX = Math.floor((x + radius) / this.cellSize);
        const startY = Math.floor((y - radius) / this.cellSize);
        const endY = Math.floor((y + radius) / this.cellSize);

        for (let ix = startX; ix <= endX; ix++) {
            for (let iy = startY; iy <= endY; iy++) {
                const cell = this.grid.get(`${ix},${iy}`);
                if (cell) for (const e of cell) results.push(e);
            }
        }
        return results;
    }
}

// ── Utilitaires ──────────────────────────────────────────────
function getDistSq(p1, p2) { 
    return (p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2; 
}

function tirerNombreAleatoire(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function largeurCalculée(taille) {
    return Math.floor(taille * 1.5);
}

const PROTECTED_IDS = new Set([2, 3, 4, 8]);
function estCaseProtegee(matrice, x, y) {
    const ID_SOL = 1;
    if (matrice[y][x] !== ID_SOL) return true;
    const voisins = [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }];
    for (let v of voisins) {
        let nx = x + v.dx, ny = y + v.dy;
        if (ny >= 0 && ny < matrice.length && nx >= 0 && nx < matrice[0].length) {
            if (PROTECTED_IDS.has(matrice[ny][nx])) return true;
        }
    }
    return false;
}

function ajouterLabyrinthe(matrice, minX, maxX, minY, maxY) {
    const ID_MUR = 6;
    for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
            if (x % 2 === 0 && y % 2 === 0 && !estCaseProtegee(matrice, x, y)) {
                if (Math.random() > 0.3) {
                    matrice[y][x] = ID_MUR;
                    const dir = Math.random() > 0.5 ? { dx: 1, dy: 0 } : { dx: 0, dy: 1 };
                    let ex = x + dir.dx, ey = y + dir.dy;
                    if (ey <= maxY && ex <= maxX && !estCaseProtegee(matrice, ex, ey)) {
                        matrice[ey][ex] = ID_MUR;
                    }
                }
            }
        }
    }
}

function construireSalleSortie(matrice, cx, cy) {
    const ID_MUR = 6, ID_SOL = 1, ID_SORTIE = 4, ID_PORTE = 2;
    for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
            let tx = cx + dx, ty = cy + dy;
            if (ty >= 0 && ty < matrice.length && tx >= 0 && tx < matrice[0].length) {
                matrice[ty][tx] = (Math.abs(dx) === 2 || Math.abs(dy) === 2) ? ID_MUR : ID_SOL;
            }
        }
    }
    matrice[cy][cx] = ID_SORTIE;
    const choices = [[0, -2], [0, 2], [-2, 0], [2, 0]];
    const [dx, dy] = choices[tirerNombreAleatoire(0, 3)];
    matrice[cy + dy][cx + dx] = ID_PORTE;
    matrice[cy + (dy/2)][cx + (dx/2)] = ID_SOL;
}

/** 
 * Vérifie si le niveau est finissable (algorithme BFS multi-passes).
 * On doit pouvoir atteindre la Plaque 1 -> Ouvrir Porte Centrale -> Atteindre Plaque 2 -> Ouvrir Porte Sortie -> Atteindre Sortie.
 */
function estSolvable(matrice, start, p1, p2, sortie, milieuX) {
    const rows = matrice.length, cols = matrice[0].length;
    let hasP1 = false, hasP2 = false;
    let reachable = new Set();
    let queue = [start.y * cols + start.x];
    let visited = new Set(queue);

    // On fait plusieurs passes car l'activation d'une plaque débloque de nouvelles zones
    for (let pass = 0; pass < 3; pass++) {
        let addedInPass = 0;
        let localQueue = [...queue]; // On repart des points déjà atteints

        while (localQueue.length > 0) {
            const idx = localQueue.shift();
            const x = idx % cols, y = Math.floor(idx / cols);

            // Activation des plaques
            if (x === p1.x && y === p1.y) hasP1 = true;
            if (x === p2.x && y === p2.y) hasP2 = true;
            // Victoire !
            if (x === sortie.x && y === sortie.y) return true;

            const neighbors = [{dx:0,dy:1}, {dx:0,dy:-1}, {dx:1,dy:0}, {dx:-1,dy:0}];
            for (const d of neighbors) {
                const nx = x + d.dx, ny = y + d.dy;
                if (ny < 0 || ny >= rows || nx < 0 || nx >= cols) continue;
                const nIdx = ny * cols + nx;
                if (visited.has(nIdx)) continue;

                const tile = matrice[ny][nx];
                if (tile === 6) continue; // Mur : infranchissable
                
                if (tile === 2) { // Porte : bloquante si plaque non activée
                    const isCentral = (nx === milieuX);
                    if (isCentral && !hasP1) continue; 
                    if (!isCentral && !hasP2) continue;
                }

                visited.add(nIdx);
                queue.push(nIdx);
                localQueue.push(nIdx);
                addedInPass++;
            }
        }
        if (addedInPass === 0) break; // Plus rien à explorer
    }
    return false;
}

function generateLevel(playerCount) {
    const ID_SOL = 1, ID_PORTE = 2, ID_DEPART = 3, ID_SORTIE = 4, ID_PIEGE = 5, ID_MUR = 6, ID_PLAQUE = 8;
    const tailleH = 12 + (playerCount * 2);
    const tailleL = largeurCalculée(tailleH);
    
    let matrice, milieuX, departX, departY, p1X, p1Y, p2X, p2Y, arriveX, arriveY;
    let attempts = 0;
    const MAX_ATTEMPTS = 50;

    // Boucle de génération avec vérification de solvabilité
    while (attempts < MAX_ATTEMPTS) {
        attempts++;
        matrice = Array.from({ length: tailleH }, (_, y) => 
            Array.from({ length: tailleL }, (_, x) => 
                (y === 0 || y === tailleH - 1 || x === 0 || x === tailleL - 1) ? ID_MUR : ID_SOL
            )
        );

        milieuX = Math.floor(tailleL / 2);
        for (let y = 1; y < tailleH - 1; y++) matrice[y][milieuX] = ID_MUR;
        matrice[tirerNombreAleatoire(2, tailleH - 3)][milieuX] = ID_PORTE;

        departX = tirerNombreAleatoire(1, milieuX - 1); departY = tirerNombreAleatoire(1, tailleH - 2);
        matrice[departY][departX] = ID_DEPART;

        do { p1X = tirerNombreAleatoire(1, milieuX - 1); p1Y = tirerNombreAleatoire(1, tailleH - 2); } 
        while (p1X === departX && p1Y === departY);
        matrice[p1Y][p1X] = ID_PLAQUE;

        const margin = 4;
        arriveX = tirerNombreAleatoire(milieuX + margin, tailleL - margin - 1);
        arriveY = tirerNombreAleatoire(margin, tailleH - margin - 1);
        construireSalleSortie(matrice, arriveX, arriveY);

        do { p2X = tirerNombreAleatoire(milieuX + 1, tailleL - 2); p2Y = tirerNombreAleatoire(1, tailleH - 2); } 
        while (matrice[p2Y][p2X] !== ID_SOL);
        matrice[p2Y][p2X] = ID_PLAQUE;

        ajouterLabyrinthe(matrice, 1, milieuX - 1, 1, tailleH - 2);
        ajouterLabyrinthe(matrice, milieuX + 1, tailleL - 2, 1, tailleH - 2);

        // Test de solvabilité
        if (estSolvable(matrice, {x:departX, y:departY}, {x:p1X, y:p1Y}, {x:p2X, y:p2Y}, {x:arriveX, y:arriveY}, milieuX)) {
            break; 
        }
    }

    if (attempts >= MAX_ATTEMPTS) console.warn("Attention: Niveau généré après trop de tentatives, solvabilité non garantie.");

    const level = {
        width: tailleL * TILE, height: tailleH * TILE,
        walls: [], buttons: [], doors: [], coins: [], hearts: [], traps: [], quests: [],
        spawnX: (departX * TILE) + TILE / 2, spawnY: (departY * TILE) + TILE / 2,
        exit: { x: 0, y: 0, r: 40, active: false },
        geometrie: matrice,
        grid: new SpatialHashGrid(tailleL * TILE, tailleH * TILE, 80)
    };

    const req1 = Math.max(1, Math.ceil(playerCount / 2)), req2 = Math.max(1, playerCount);
    let plaqueId = 1, porteId = 1;

    for (let y = 0; y < tailleH; y++) {
        for (let x = 0; x < tailleL; x++) {
            const cell = matrice[y][x], cx = x * TILE, cy = y * TILE;
            if (cell === ID_MUR) level.walls.push({ x: cx, y: cy, w: TILE, h: TILE });
            else if (cell === ID_PORTE) {
                level.doors.push({ id: porteId++, x: cx, y: cy, w: TILE, h: TILE, linkedButton: (x === milieuX ? 1 : 2), open: false });
            } else if (cell === ID_PLAQUE) {
                const currentId = plaqueId++;
                level.buttons.push({
                    id: currentId, x: cx + TILE / 2, y: cy + TILE / 2, r: 30,
                    // ID 1 = Bleu/Pont/Moitié des joueurs, ID 2 = Rouge/Verrou/Tous les joueurs
                    reqCount: (currentId === 1 ? req1 : req2), 
                    color: (currentId === 1 ? '#3498db' : '#e74c3c'),
                    pressed: false, currentCount: 0, 
                    sticky: (playerCount <= 1 || currentId === 1),
                    label: (currentId === 1 ? 'PONT' : 'VERROU')
                });
            } else if (cell === ID_SORTIE) { level.exit.x = cx + TILE / 2; level.exit.y = cy + TILE / 2; }
            else if (cell === ID_SOL && !estCaseProtegee(matrice, x, y)) {
                if (Math.random() < 0.15) level.coins.push({ x: cx + TILE / 2, y: cy + TILE / 2, collected: false });
                else if (Math.random() < 0.03) level.hearts.push({ x: cx + TILE / 2, y: cy + TILE / 2, collected: false });
                else if (Math.random() < 0.08) level.traps.push({ x: cx + TILE / 2, y: cy + TILE / 2, active: true });
            }
        }
    }

    const coinGoal = level.coins.length;
    level.quests = [
        { id: "btn1", text: `Activer la plaque Pont (${req1} j.)`, done: false },
        { id: "btn2", text: `Activer la plaque Verrou (${req2} j.)`, done: false },
        { id: "coins", text: `Collecter ${coinGoal} sphères (0/${coinGoal})`, done: false, count: 0, total: coinGoal },
        { id: "exit", text: "Tous rejoindre la SORTIE", done: false }
    ];

    refreshGrid(level);
    return level;
}

function refreshGrid(level) {
    level.grid.clear();
    // OPTIMISATION : On intègre tout sans se soucier du statut "collected"
    // Ils seront ignorés à la volée pendant le jeu au lieu de reconstruire la grille.
    level.buttons.forEach(b => { b.type = 'button'; level.grid.insert(b); });
    level.coins.forEach(c => { c.type = 'coin'; level.grid.insert(c); });
    level.hearts.forEach(h => { h.type = 'heart'; level.grid.insert(h); });
    level.traps.forEach(t => { t.type = 'trap'; level.grid.insert(t); });
}

function checkWallCollision(p, level) {
    const matrice = level.geometrie;
    if (!matrice) return false;
    const margin = PLAYER_R - 2;
    const minC = Math.floor((p.x - margin) / TILE), maxC = Math.floor((p.x + margin) / TILE);
    const minR = Math.floor((p.y - margin) / TILE), maxR = Math.floor((p.y + margin) / TILE);

    for (let r = minR; r <= maxR; r++) {
        for (let c = minC; c <= maxC; c++) {
            if (r < 0 || r >= matrice.length || c < 0 || c >= matrice[0].length || matrice[r][c] === 6) return true;
        }
    }
    for (let d of level.doors) {
        if (d.open) continue;
        const nx = Math.max(d.x, Math.min(p.x, d.x + d.w)), ny = Math.max(d.y, Math.min(p.y, d.y + d.h));
        if ((p.x - nx)**2 + (p.y - ny)**2 <= PLAYER_R**2) return true;
    }
    return false;
}

function applyPhysics(player, level, dt) {
    if (player.isDead) return;
    if (player.invuln > 0) player.invuln = Math.max(0, player.invuln - dt * 60);
    
    // OPTIMISATION : On saute le traitement physique lourd si le joueur ne bouge pas
    if (!player.vx && !player.vy) return;

    const SPEED = 5 * dt * 60; // Normalisé à 60fps
    const oldX = player.x, oldY = player.y;
    
    player.x += (player.vx || 0) * SPEED;
    if (checkWallCollision(player, level)) player.x = oldX;
    
    player.y += (player.vy || 0) * SPEED;
    if (checkWallCollision(player, level)) player.y = oldY;
}

function updateTriggers(players, level) {
    level.buttons.forEach(b => { if (!b.sticky || !b.pressed) b.pressed = false; b.currentCount = 0; });
    
    for (let pId in players) {
        const p = players[pId];
        if (p.isDead) continue;
        
        const nearby = level.grid.getNearby(p.x, p.y, 60);
        for (let ent of nearby) {
            // OPTIMISATION : on ignore les entités déjà ramassées à la volée.
            if (ent.collected) continue; 

            const dSq = getDistSq(p, ent);
            if (ent.type === 'button') {
                if (dSq < (ent.r + PLAYER_R)**2) {
                    ent.currentCount++;
                    if (ent.currentCount >= ent.reqCount) ent.pressed = true;
                }
            } else if (ent.type === 'coin') {
                if (dSq < 35 * 35) { ent.collected = true; } // Plus de refreshGrid coûteux
            } else if (ent.type === 'heart') {
                if (dSq < 35 * 35) { ent.collected = true; p.hp = Math.min(MAX_HP, p.hp + 1); }
            } else if (ent.type === 'trap' && p.invuln <= 0) {
                if (dSq < (20 + PLAYER_R)**2) { p.hp -= 1; p.invuln = 90; if (p.hp <= 0) p.isDead = true; }
            }
        }
    }

    level.doors.forEach(d => { const btn = level.buttons.find(b => b.id === d.linkedButton); d.open = btn ? btn.pressed : false; });
    const btn2 = level.buttons.find(b => b.id === 2);
    if (btn2) level.exit.active = btn2.pressed;

    const qBtn1 = level.quests.find(q => q.id === "btn1");
    if (qBtn1) qBtn1.done = level.buttons.find(b => b.id === 1)?.pressed || false;
    const qBtn2 = level.quests.find(q => q.id === "btn2");
    if (qBtn2) qBtn2.done = level.buttons.find(b => b.id === 2)?.pressed || false;
    
    const qCoins = level.quests.find(q => q.id === "coins");
    if (qCoins) {
        const count = level.coins.filter(c => c.collected).length;
        qCoins.count = count;
        qCoins.text = `Collecter ${qCoins.total} sphères (${count}/${qCoins.total})`;
        qCoins.done = count >= qCoins.total;
    }
}

function checkWinCondition(players, level) {
    const pList = Object.values(players);
    if (pList.length === 0 || !level.exit.active || pList.every(p => p.isDead)) return false;
    return pList.every(p => p.isDead || getDistSq(p, level.exit) < (level.exit.r + PLAYER_R)**2);
}

function adjustDifficulty(level, newPlayerCount) {
    if (!level) return;
    const safeCount = Math.max(1, newPlayerCount);
    
    // On plafonne le requis des plaques au nombre actuel de joueurs (vivants ou total selon l'appel)
    level.buttons.forEach(b => { 
        if (b.sticky && b.reqCount > safeCount) b.reqCount = safeCount; 
        if (!b.sticky && b.reqCount > safeCount) b.reqCount = safeCount;
    });

    const q1 = level.quests.find(q => q.id === "btn1"), q2 = level.quests.find(q => q.id === "btn2");
    if (q1 && !q1.done) q1.text = `Activer la plaque Pont (${level.buttons.find(b => b.id === 1).reqCount} j.)`;
    if (q2 && !q2.done) q2.text = `Activer la plaque Verrou (${level.buttons.find(b => b.id === 2).reqCount} j.)`;
    
    // Mise à jour de l'objectif de pièces (on garde le total original, mais on pourrait le réduire ici si besoin)
}

/**
 * Tente de réanimer un joueur à proximité.
 * Coûte 1 HP au donneur pour donner 1 HP au receveur.
 */
function tryRevive(player, allPlayers) {
    if (player.isDead || player.hp <= 1) return false;
    
    for (const id in allPlayers) {
        const other = allPlayers[id];
        if (other.isDead && getDistSq(player, other) < (TILE * 1.5) ** 2) {
            // Transfert de vie
            player.hp -= 1;
            other.hp = 1;
            other.isDead = false;
            other.invuln = 120; // Protection après revive
            return true;
        }
    }
    return false;
}

function assignerSpawnsJoueurs(level, players) {
    const pIds = Object.keys(players), matrice = level.geometrie;
    if (!matrice) return;
    let sC = Math.floor(level.spawnX / TILE), sR = Math.floor(level.spawnY / TILE);
    let free = [];
    
    // OPTIMISATION : Agrandit la taille de recherche de spawn proportionnellement aux nombres de joueurs (évite le glitch d'empilement)
    const searchRadius = Math.ceil(Math.sqrt(pIds.length)) + 1;
    for (let r = sR - searchRadius; r <= sR + searchRadius; r++) {
        for (let c = sC - searchRadius; c <= sC + searchRadius; c++) {
            if (r >= 0 && r < matrice.length && c >= 0 && c < matrice[0].length && (matrice[r][c] === 1 || matrice[r][c] === 3)) 
                free.push({ r, c });
        }
    }
    
    free.sort(() => Math.random() - 0.5);
    pIds.forEach((id, i) => {
        const p = players[id];
        if (i < free.length) { p.x = free[i].c * TILE + TILE/2; p.y = free[i].r * TILE + TILE/2; }
        else { p.x = level.spawnX; p.y = level.spawnY; }
        p.isDead = false; p.hp = BASE_HP; p.invuln = 0;
    });
}

module.exports = { generateLevel, applyPhysics, updateTriggers, checkWinCondition, adjustDifficulty, assignerSpawnsJoueurs, tryRevive };
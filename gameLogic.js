// ── Constantes ──────────────────────────────────────────────
const PLAYER_R = 20;  // rayon du joueur
const WALL_T = 40;    // taille d'un bloc (tile) de mur / épaisseur
const SAFE_R = 120;   // rayon de dégagement (pour compatibilité)

function getDist(p1, p2) { return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2)); }

// ── Utilitaires de génération (tirés de gen.js) ────────────────

function tirerNombreAleatoire(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function largeurCalculée(taille) {
    return Math.floor(taille * 1.5);
}

function estCaseProtegee(matrice, x, y) {
    const ID_SOL = 1;
    const ID_MUR_EXTERIEUR = 6;
    
    if (matrice[y][x] !== ID_SOL) return true;

    const voisins = [
        {dx: 0, dy: -1}, {dx: 0, dy: 1}, 
        {dx: -1, dy: 0}, {dx: 1, dy: 0}
    ];

    for (let v of voisins) {
        let nx = x + v.dx;
        let ny = y + v.dy;
        if (ny >= 0 && ny < matrice.length && nx >= 0 && nx < matrice[0].length) {
            let idVoisin = matrice[ny][nx];
            // Protection si voisin est Porte, Départ, Plaque ou Sortie
            if (idVoisin !== ID_SOL && idVoisin !== ID_MUR_EXTERIEUR && idVoisin !== 7 && idVoisin !== 5) {
                return true;
            }
        }
    }
    return false;
}

function ajouterLabyrinthe(matrice, minX, maxX, minY, maxY) {
    const ID_MUR = 6;
    for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
            if (x % 2 === 0 && y % 2 === 0) {
                if (!estCaseProtegee(matrice, x, y)) {
                    if (Math.random() > 0.3) {
                        matrice[y][x] = ID_MUR;
                        const directions = [{dx:1, dy:0}, {dx:0, dy:1}];
                        let dir = directions[tirerNombreAleatoire(0, 1)];
                        let ex = x + dir.dx;
                        let ey = y + dir.dy;
                        if (ey <= maxY && ex <= maxX && !estCaseProtegee(matrice, ex, ey)) {
                            matrice[ey][ex] = ID_MUR;
                        }
                    }
                }
            }
        }
    }
}

function construireSalleSortie(matrice, cx, cy) {
    const ID_MUR = 6;
    const ID_SOL = 1;
    const ID_SORTIE = 4;
    const ID_PORTE = 2; 

    for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
            let targetX = cx + dx;
            let targetY = cy + dy;
            if (targetY >= 0 && targetY < matrice.length && targetX >= 0 && targetX < matrice[0].length) {
                if (Math.abs(dx) === 2 || Math.abs(dy) === 2) {
                    matrice[targetY][targetX] = ID_MUR; 
                } else {
                    matrice[targetY][targetX] = ID_SOL; 
                }
            }
        }
    }

    matrice[cy][cx] = ID_SORTIE;
    const cotes = ["haut", "bas", "gauche", "droite"];
    const choix = cotes[tirerNombreAleatoire(0, 3)];

    switch (choix) {
        case "haut":
            matrice[cy - 2][cx] = ID_PORTE; 
            matrice[cy - 1][cx] = ID_SOL;   
            break;
        case "bas":
            matrice[cy + 2][cx] = ID_PORTE;
            matrice[cy + 1][cx] = ID_SOL;
            break;
        case "gauche":
            matrice[cy][cx - 2] = ID_PORTE;
            matrice[cy][cx - 1] = ID_SOL;
            break;
        case "droite":
            matrice[cy][cx + 2] = ID_PORTE;
            matrice[cy][cx + 1] = ID_SOL;
            break;
    }
}

// ─────────────────────────────────────────────────────────────
//  generateLevel – point d'entrée principal utilisant gen.js
// ─────────────────────────────────────────────────────────────

function generateLevel(playerCount) {
    const ID_SOL = 1;
    const ID_PORTE = 2;
    const ID_DEPART = 3;
    const ID_SORTIE = 4;
    const ID_PIEGE = 5;
    const ID_MUR = 6;
    const ID_PIECE = 7;
    const ID_PLAQUE = 8;

    // Taille dépendante du nombre de joueurs (logique gen.js)
    const tailleH = 12 + (playerCount * 2);
    const tailleL = largeurCalculée(tailleH);
    const TILE = 40; // Taille d'une case sur l'écran (alignée sur le rendu)

    let matrice = [];
    for (let y = 0; y < tailleH; y++) {
        let ligne = [];
        for (let x = 0; x < tailleL; x++) {
            if (y === 0 || y === tailleH - 1 || x === 0 || x === tailleL - 1) {
                ligne.push(ID_MUR);
            } else {
                ligne.push(ID_SOL);
            }
        }
        matrice.push(ligne);
    }

    // Séparation centrale
    const milieuX = Math.floor(tailleL / 2);
    for (let y = 1; y < tailleH - 1; y++) {
        matrice[y][milieuX] = ID_MUR;
    }
    
    // Porte de séparation (Plate 1 débloque celle-ci)
    const porteSeparationY = tirerNombreAleatoire(2, tailleH - 3);
    matrice[porteSeparationY][milieuX] = ID_PORTE;

    // Départ
    const departX = tirerNombreAleatoire(1, milieuX - 1);
    const departY = tirerNombreAleatoire(1, tailleH - 2);
    matrice[departY][departX] = ID_DEPART;

    // Plaque 1 (Ouvre la porte centrale)
    let p1X, p1Y;
    do {
        p1X = tirerNombreAleatoire(1, milieuX - 1);
        p1Y = tirerNombreAleatoire(1, tailleH - 2);
    } while (p1X === departX && p1Y === departY);
    matrice[p1Y][p1X] = ID_PLAQUE;

    // Salle de sortie
    const margin = 4;
    const arriveX = tirerNombreAleatoire(milieuX + margin, tailleL - margin - 1);
    const arriveY = tirerNombreAleatoire(margin, tailleH - margin - 1);
    construireSalleSortie(matrice, arriveX, arriveY);

    // Plaque 2 (Active la sortie et ouvre la porte de la salle finale)
    let p2X, p2Y;
    let p2Ok = false;
    while (!p2Ok) {
        p2X = tirerNombreAleatoire(milieuX + 1, tailleL - 2);
        p2Y = tirerNombreAleatoire(1, tailleH - 2);
        if (matrice[p2Y][p2X] === ID_SOL) {
            p2Ok = true;
        }
    }
    matrice[p2Y][p2X] = ID_PLAQUE;

    // Labyrinthe
    ajouterLabyrinthe(matrice, 1, milieuX - 1, 1, tailleH - 2);
    ajouterLabyrinthe(matrice, milieuX + 1, tailleL - 2, 1, tailleH - 2);

    // Initialisation de l'objet Level
    const level = {
        width: tailleL * TILE,
        height: tailleH * TILE,
        walls: [],
        buttons: [],
        doors: [],
        coins: [],
        traps: [],
        quests: [],
        spawnX: (departX * TILE) + TILE / 2,
        spawnY: (departY * TILE) + TILE / 2,
        exit: { x: 0, y: 0, r: 40, active: false },
        geometrie: matrice // On expose la matrice brute pour le renderer (Autotiling)
    };

    const reqCount1 = Math.max(1, Math.ceil(playerCount / 2));
    const reqCount2 = Math.max(1, playerCount);
    const coinGoal = Math.max(3, playerCount * 2);

    // Conversion de la matrice en objets de jeu
    let plaqueId = 1;
    let porteId = 1;

    for (let y = 0; y < tailleH; y++) {
        for (let x = 0; x < tailleL; x++) {
            const cell = matrice[y][x];
            const cx = x * TILE;
            const cy = y * TILE;

            switch (cell) {
                case ID_MUR:
                    level.walls.push({ x: cx, y: cy, w: TILE, h: TILE });
                    break;
                case ID_PORTE:
                    // La porte de séparation centrale est à x = milieuX.
                    // Elle est liée à la plaque 1. Les autres (salle de sortie) à la plaque 2.
                    const isMainDoor = (x === milieuX);
                    level.doors.push({
                        id: porteId, x: cx, y: cy, w: TILE, h: TILE,
                        linkedButton: (isMainDoor ? 1 : 2), open: false
                    });
                    porteId++;
                    break;
                case ID_PLAQUE:
                    level.buttons.push({
                        id: plaqueId, x: cx + TILE/2, y: cy + TILE/2, r: 30,
                        reqCount: (plaqueId === 1 ? reqCount1 : reqCount2),
                        color: (plaqueId === 1 ? '#3498db' : '#e74c3c'),
                        pressed: false, currentCount: 0, 
                        sticky: (playerCount <= 1 || plaqueId === 1),
                        label: (plaqueId === 1 ? 'PONT' : 'VERROU')
                    });
                    plaqueId++;
                    break;
                case ID_SORTIE:
                    level.exit.x = cx + TILE/2;
                    level.exit.y = cy + TILE/2;
                    break;
                case ID_PIEGE:
                    // On ajoutera plus de pièges aléatoires après
                    level.traps.push({ x: cx + TILE/2, y: cy + TILE/2, active: true });
                    break;
            }
        }
    }

    // Ajout aléatoire de pièces et pièges sur les cases de sol (ID 1)
    for (let y = 1; y < tailleH - 1; y++) {
        for (let x = 1; x < tailleL - 1; x++) {
            if (matrice[y][x] === ID_SOL && !estCaseProtegee(matrice, x, y)) {
                if (Math.random() < 0.15) { // 15% de chance pour une pièce
                    level.coins.push({ x: x * TILE + TILE / 2, y: y * TILE + TILE / 2, collected: false });
                } else if (Math.random() < 0.08) { // 8% pour un piège
                    level.traps.push({ x: x * TILE + TILE / 2, y: y * TILE + TILE / 2, active: true });
                }
            }
        }
    }

    level.quests = [
        { id: "btn1", text: `Activer la plaque Pont (${reqCount1} j.)`, done: false },
        { id: "btn2", text: `Activer la plaque Verrou (${reqCount2} j.)`, done: false },
        { id: "coins", text: `Collecter ${coinGoal} sphères (0/${coinGoal})`, done: false, count: 0, total: coinGoal },
        { id: "exit", text: "Tous rejoindre la SORTIE", done: false }
    ];

    // --- Mécaniques additionnelles (Code Secret) ---
    const colors = ['#e74c3c', '#2ecc71', '#3498db', '#f1c40f', '#9b59b6'];
    level.secretCode = [];
    for(let i=0; i<3; i++) level.secretCode.push(colors[tirerNombreAleatoire(0, colors.length - 1)]);
    level.sequenceIndex = 0;
    
    // Indice placé près du spawn
    level.floorClues = [{ x: level.spawnX + 40, y: level.spawnY + 80, colors: level.secretCode }];

    // Boutons de séquence dans la zone de la sortie
    level.sequenceButtons = [];
    const seqX = level.exit.x - (colors.length * 30);
    const seqY = level.exit.y - 100;
    for(let i=0; i<colors.length; i++) {
        level.sequenceButtons.push({
            id: `seq_${i}`, x: seqX + i*60, y: seqY, r: 20,
            color: colors[i], isPressed: false, cooldown: 0
        });
    }
    level.quests.push({ id: "code", text: "Décoder le secret couleur", done: false });

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
    if (player.isDead) return;
    if (player.invuln > 0) player.invuln--;
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
        if (p.isDead) continue;
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
                if (p.isDead) continue;
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
        const tot = qCoins.total;
        qCoins.text = `Collecter ${tot} sphères (${collectedCoins}/${tot})`;
        qCoins.done = collectedCoins >= tot;
    }

    let codeDone = true;
    if (level.sequenceIndex < level.secretCode.length) {
        codeDone = false;
        for (let sb of level.sequenceButtons) {
            if (sb.cooldown > 0) sb.cooldown--;
            for (let p of pList) {
                if (p.isDead) continue;
                const dx = p.x - sb.x, dy = p.y - sb.y;
                if (dx * dx + dy * dy < (sb.r + PLAYER_R) * (sb.r + PLAYER_R) && sb.cooldown <= 0) {
                    sb.cooldown = 60;
                    if (sb.color === level.secretCode[level.sequenceIndex]) {
                        level.sequenceIndex++;
                    } else {
                        level.sequenceIndex = 0;
                    }
                }
            }
        }
    }
    const qCode = level.quests.find(q => q.id === "code");
    if (qCode) qCode.done = codeDone;

    if (level.traps) {
        for (let p of pList) {
            if (p.isDead || p.invuln > 0) continue;
            for (let t of level.traps) {
                const dx = p.x - t.x, dy = p.y - t.y;
                if (dx * dx + dy * dy < (20 + PLAYER_R) * (20 + PLAYER_R)) {
                    p.hp -= 1;
                    p.invuln = 90;
                    if (p.hp <= 0) p.isDead = true;
                    break;
                }
            }
        }
    }
}

function checkWinCondition(players, level) {
    const pList = Object.values(players);
    if (pList.length === 0 || !level.exit.active) return false;
    let allDead = true;
    for (let p of pList) { if (!p.isDead) allDead = false; }
    if (allDead) return false;
    for (let p of pList) {
        if (p.isDead) continue;
        const dx = p.x - level.exit.x, dy = p.y - level.exit.y;
        if (dx * dx + dy * dy > (level.exit.r + PLAYER_R) * (level.exit.r + PLAYER_R)) return false;
    }
    return true;
}

function adjustDifficulty(level, newPlayerCount) {
    if (!level) return;
    const safeCount = Math.max(1, newPlayerCount);
    for (let b of level.buttons) {
        if (b.reqCount > safeCount) b.reqCount = safeCount;
    }
    const qBtn1 = level.quests.find(q => q.id === "btn1");
    if (qBtn1 && !qBtn1.done) qBtn1.text = `Activer la plaque Pont (${level.buttons.find(b=>b.id===1).reqCount} j.)`;
    const qBtn2 = level.quests.find(q => q.id === "btn2");
    if (qBtn2 && !qBtn2.done) qBtn2.text = `Activer la plaque Verrou (${level.buttons.find(b=>b.id===2).reqCount} j.)`;
}

module.exports = { generateLevel, applyPhysics, updateTriggers, checkWinCondition, adjustDifficulty };
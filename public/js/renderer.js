// ═══════════════════════════════════════════════════════════════════
//  renderer.js – Bancal  |  Système Tilemap + Textures
//  Taille de tuile : 40px (même que le jeu source)
//  Images :
//    feuille.png  → tileset autotile (bitmask 4 voisins, 16 frames)
//    herbe.png    → particules (traînée derrière la bille)
//    piece.png    → sprite animé 10 frames (400×40)
//    pikkux.png   → sprite animé 4 frames (160×40) → piège horizontal
//    pikkuy.png   → sprite animé 4 frames (160×40) → piège vertical
//    sortie.png   → sprite animé 9 frames (360×40)
// ═══════════════════════════════════════════════════════════════════

const socket = io({
    transports: ['websocket'],
    upgrade: false
});
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
});

// ── Paramètres ───────────────────────────────────────────────────────
const TILE = 40; // taille d'une tuile en pixels monde

// IDs de tuile
const T = {
    HERBE: 1, // sol traversable
    PORTE: 2, // porte
    SPAWN: 3, // point de spawn
    SORTIE: 4, // sortie (sprite animé)
    PIEGE: 5, // piège (trou mortel)
    MUR: 6, // mur (autotile feuille.png)
    PIECE: 7, // pièce / sphère
    PLAQUE: 8  // plaque de pression
};

// ── Ressources ───────────────────────────────────────────────────────
const RES = {};
function loadImg(key, src) {
    RES[key] = new Image();
    RES[key].src = src;
}
loadImg('herbe', '/assets/images/herbe.png');
loadImg('feuille', '/assets/images/feuille.png');
loadImg('piece', '/assets/images/piece.png');
loadImg('pikkux', '/assets/images/pikkux.png');
loadImg('pikkuy', '/assets/images/pikkuy.png');
loadImg('sortie', '/assets/images/sortie.png');
loadImg('bille', '/assets/images/bille.png');

// Sprites animés : { img, frames, speed(ms/frame) }
const ANIM = {
    piece: { key: 'piece', frames: 10, speed: 100 },
    pikkux: { key: 'pikkux', frames: 4, speed: 120 },
    pikkuy: { key: 'pikkuy', frames: 4, speed: 120 },
    sortie: { key: 'sortie', frames: 9, speed: 150 },
    bille: { key: 'bille', frames: 20, speed: 150 } 
};

// Cache pour ne pas recalculer les sprites colorés à chaque frame
const coloredBilleCache = {};

function getColoredBille(hexColor) {
    if (coloredBilleCache[hexColor]) return coloredBilleCache[hexColor];
    
    const baseImg = RES['bille'];
    if (!baseImg || !baseImg.complete || baseImg.naturalWidth === 0) return null;

    const buffer = document.createElement('canvas');
    buffer.width = baseImg.naturalWidth;
    buffer.height = baseImg.naturalHeight;
    const bctx = buffer.getContext('2d');

    // 1. Dessiner l'image de base
    bctx.drawImage(baseImg, 0, 0);

    // 2. Appliquer la couleur par-dessus en mode "source-in" 
    // (ne colorie que les pixels non transparents)
    bctx.globalCompositeOperation = "source-in";
    bctx.fillStyle = hexColor;
    bctx.fillRect(0, 0, buffer.width, buffer.height);

    // 3. Remettre l'image de base en mode "multiply" pour garder les ombres/contours noirs
    bctx.globalCompositeOperation = "multiply";
    bctx.drawImage(baseImg, 0, 0);

    coloredBilleCache[hexColor] = buffer;
    return buffer;
}

function drawSprite(anim, cx, cy, size) {
    const img = RES[anim.key];
    if (!img.complete || !img.naturalWidth) return false;
    const fi = Math.floor(Date.now() / anim.speed) % anim.frames;
    const fw = img.naturalWidth / anim.frames;
    ctx.drawImage(img, fi * fw, 0, fw, img.naturalHeight,
        cx - size / 2, cy - size / 2, size, size);
    return true;
}

// ── Tilemap – lecture directe de level.geometrie ─────────────────────
// Plus de buildMatrix intermédiaire : on lit la grille brute à chaque frame.
let tileAppearance = null;  // bitmask précalculé à chaque nouveau niveau
let lastGeometrie = null;   // référence pour détecter un changement de niveau

// Précalcule le bitmask autotile de chaque MUR dans la géométrie.
// Les bords hors-grille comptent comme des murs (comportement original).
function computeAutotile(matrice) {
    const rows = matrice.length;
    const cols = matrice[0].length;
    // isWall : hors-grille = mur, dans la grille = ID 6
    const isWall = (r, c) => {
        if (r < 0 || r >= rows || c < 0 || c >= cols) return true;
        return matrice[r][c] === T.MUR;
    };
    tileAppearance = Array.from({ length: rows }, () => new Array(cols).fill(0));
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (matrice[r][c] !== T.MUR) continue;
            // Bitmask 4 voisins : Haut=1, Gauche=2, Droite=4, Bas=8
            let bitmask = 0;
            if (isWall(r - 1, c)) bitmask += 1; // Haut
            if (isWall(r, c - 1)) bitmask += 2; // Gauche
            if (isWall(r, c + 1)) bitmask += 4; // Droite
            if (isWall(r + 1, c)) bitmask += 8; // Bas
            tileAppearance[r][c] = bitmask;
        }
    }
}

// ── Rendu de la tilemap ───────────────────────────────────────────────
function renderTilemap(level, layerType) {
    const matrice = level.geometrie;
    if (!matrice) return;

    // Recalcule le bitmask si la géométrie a changé (nouveau niveau)
    if (matrice !== lastGeometrie) {
        computeAutotile(matrice);
        lastGeometrie = matrice;
        cachedSegments = null; // invalide le cache fog
    }

    const rows = matrice.length;
    const cols = matrice[0].length;

    // Ensemble des cases occupées par des portes fermées
    const doorSet = new Set();
    for (const d of level.doors) {
        if (!d.open) {
            const c0 = Math.floor(d.x / TILE), r0 = Math.floor(d.y / TILE);
            const c1 = Math.ceil((d.x + d.w) / TILE), r1 = Math.ceil((d.y + d.h) / TILE);
            for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) doorSet.add(`${r},${c}`);
        }
    }

    const imgFeuille = RES['feuille'];
    const feuilleOk = imgFeuille.complete && imgFeuille.naturalWidth > 0;

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const px = c * TILE, py = r * TILE;
            const id = matrice[r][c];
            const isDoor = doorSet.has(`${r},${c}`);

            if (layerType === 'sol') {
                if (id === T.HERBE || id === T.SPAWN) {
                    // Sol standard (première case de feuille.png)
                    if (feuilleOk) {
                        ctx.drawImage(imgFeuille, 0, 0, TILE, TILE, px, py, TILE, TILE);
                    } else {
                        ctx.fillStyle = '#0a0a0a';
                        ctx.fillRect(px, py, TILE, TILE);
                    }
                } else if (id !== T.MUR && !isDoor) {
                    // Autres IDs au sol (porte ouverte, piège, pièce, sortie...) → fond sol standard
                    if (feuilleOk) {
                        ctx.drawImage(imgFeuille, 0, 0, TILE, TILE, px, py, TILE, TILE);
                    } else {
                        ctx.fillStyle = '#0a0a0a';
                        ctx.fillRect(px, py, TILE, TILE);
                    }
                }
            } 
            else if (layerType === 'murs') {
                if (id === T.MUR || isDoor) {
                    // Mur autotile depuis feuille.png (ligne 3, y = 2*TILE pour les murs dorés)
                    const bitmask = isDoor ? 0 : (tileAppearance[r][c] || 0);
                    const srcX = bitmask * TILE;
                    const srcY = 2 * TILE; 
                    if (feuilleOk) {
                        ctx.drawImage(imgFeuille, srcX, srcY, TILE, TILE, px, py, TILE, TILE);
                    } else {
                        ctx.fillStyle = isDoor ? '#7f3030' : '#2a2a3a';
                        ctx.fillRect(px, py, TILE, TILE);
                    }
                }
            }
        }
    }
}

// ── Fog of War ───────────────────────────────────────────────────────
const fogCanvas = document.createElement('canvas');
const fogCtx = fogCanvas.getContext('2d', { willReadFrequently: true });

let cachedSegments = null;
let lastDoorsHash = '';

function getIntersection(ray, seg) {
    const rpx = ray.a.x, rpy = ray.a.y, rdx = ray.b.x - ray.a.x, rdy = ray.b.y - ray.a.y;
    const spx = seg.a.x, spy = seg.a.y, sdx = seg.b.x - seg.a.x, sdy = seg.b.y - seg.a.y;
    if (rdx * sdy === rdy * sdx) return null;
    const T2 = (rdx * (spy - rpy) + rdy * (rpx - spx)) / (sdx * rdy - sdy * rdx);
    const T1 = (spx + sdx * T2 - rpx) / rdx;
    if (T1 > 0 && T2 >= 0 && T2 <= 1) return { x: rpx + rdx * T1, y: rpy + rdy * T1, param: T1 };
    return null;
}

function calcVisibility(origin, segments) {
    const pts = [];
    for (const s of segments) { pts.push(s.a); pts.push(s.b); }
    const angles = [];
    for (const p of pts) {
        const a = Math.atan2(p.y - origin.y, p.x - origin.x);
        angles.push(a - 0.00001, a, a + 0.00001);
    }
    const hits = [];
    for (const angle of angles) {
        const ray = { a: origin, b: { x: origin.x + Math.cos(angle) * 5000, y: origin.y + Math.sin(angle) * 5000 } };
        let best = null;
        for (const s of segments) {
            const h = getIntersection(ray, s);
            if (h && (!best || h.param < best.param)) best = h;
        }
        if (best) { best.angle = angle; hits.push(best); }
    }
    hits.sort((a, b) => a.angle - b.angle);
    return hits;
}

function buildSegments(level) {
    const segs = [];
    const addRect = (x, y, w, h) => {
        segs.push({ a: { x, y }, b: { x: x + w, y } });
        segs.push({ a: { x: x + w, y }, b: { x: x + w, y: y + h } });
        segs.push({ a: { x: x + w, y: y + h }, b: { x, y: y + h } });
        segs.push({ a: { x, y: y + h }, b: { x, y } });
    };
    // Bordure extérieure de la map
    addRect(0, 0, level.width, level.height);
    // Murs depuis la géométrie (ID 6)
    if (level.geometrie) {
        const matrice = level.geometrie;
        for (let r = 0; r < matrice.length; r++) {
            for (let c = 0; c < matrice[0].length; c++) {
                if (matrice[r][c] === T.MUR) {
                    addRect(c * TILE - 0.1, r * TILE - 0.1, TILE + 0.2, TILE + 0.2);
                }
            }
        }
    }
    // Portes fermées
    for (const d of level.doors) if (!d.open) addRect(d.x - 0.1, d.y - 0.1, d.w + 0.2, d.h + 0.2);
    return segs;
}

function drawFog(level, players) {
    if (fogCanvas.width !== canvas.width || fogCanvas.height !== canvas.height) {
        fogCanvas.width = canvas.width; fogCanvas.height = canvas.height;
    }

    const hash = level.doors.map(d => d.open ? 1 : 0).join('');
    if (!cachedSegments || hash !== lastDoorsHash) {
        cachedSegments = buildSegments(level);
        lastDoorsHash = hash;
    }

    fogCtx.globalCompositeOperation = 'source-over';
    fogCtx.clearRect(0, 0, fogCanvas.width, fogCanvas.height);
    fogCtx.fillStyle = '#050510';
    fogCtx.fillRect(0, 0, fogCanvas.width, fogCanvas.height);
    fogCtx.globalCompositeOperation = 'destination-out';

    const pList = Object.values(players);

    for (const p of pList) {
        if (p.isDead) continue;
        let radius = 160;
        for (const o of pList) {
            if (o !== p && !o.isDead) {
                const dx = p.x - o.x, dy = p.y - o.y;
                const d = Math.sqrt(dx * dx + dy * dy);
                if (d < 320) radius = Math.min(420, radius + (320 - d) * 0.4);
            }
        }

        const poly = calcVisibility({ x: p.x, y: p.y }, cachedSegments);
        if (!poly.length) continue;

        fogCtx.save();
        fogCtx.translate(canvas.width / 2, canvas.height / 2);
        fogCtx.scale(camera.scale, camera.scale);
        fogCtx.translate(-camera.x, -camera.y);

        fogCtx.beginPath();
        fogCtx.moveTo(poly[0].x, poly[0].y);
        for (let i = 1; i < poly.length; i++) fogCtx.lineTo(poly[i].x, poly[i].y);
        fogCtx.closePath();

        const g = fogCtx.createRadialGradient(p.x, p.y, radius * 0.1, p.x, p.y, radius);
        g.addColorStop(0, 'rgba(0,0,0,1)');
        g.addColorStop(0.7, 'rgba(0,0,0,0.5)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        fogCtx.fillStyle = g;
        fogCtx.fill();
        fogCtx.restore();
    }
}

// ── Caméra ───────────────────────────────────────────────────────────
let camera = { x: 0, y: 0, scale: 1 };

function updateCamera(level, players) {
    const pIds = Object.keys(players);
    let tx = level.width / 2, ty = level.height / 2, ts = 1.0;

    const alive = pIds.filter(id => !players[id].isDead);
    if (alive.length > 0) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const id of alive) {
            const p = players[id];
            if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y;
            if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y;
        }
        tx = (minX + maxX) / 2; ty = (minY + maxY) / 2;
        const bw = maxX - minX + 600, bh = maxY - minY + 600;
        ts = Math.min(canvas.width / bw, canvas.height / bh, 1.4);
        ts = Math.max(ts, 0.2);
    }
    camera.x += (tx - camera.x) * 0.1;
    camera.y += (ty - camera.y) * 0.1;
    camera.scale += (ts - camera.scale) * 0.1;
}

// ── Dessin d'un joueur ───────────────────────────────────────────────
function drawPlayer(p) {
    ctx.save();
    ctx.translate(p.x, p.y);

    if (p.isDead) {
        ctx.globalAlpha = 0.3;
    } else if (p.invuln > 0) {
        ctx.globalAlpha = (Math.floor(Date.now() / 100) % 2 === 0) ? 0.35 : 1.0;
    }

    // Pseudo
    ctx.fillStyle = '#fff'; ctx.font = 'bold 22px Arial'; ctx.textAlign = 'center';
    ctx.lineWidth = 4; ctx.strokeStyle = '#000';
    ctx.strokeText(p.pseudo, 0, -42); ctx.fillText(p.pseudo, 0, -42);

    // HP ou MORT
    if (!p.isDead) {
        ctx.font = '14px Arial';
        ctx.fillText('❤️'.repeat(p.hp) + '🖤'.repeat(2 - p.hp), 0, -26);
    } else {
        ctx.fillStyle = '#e74c3c'; ctx.font = 'bold 14px Arial';
        ctx.fillText('MORT', 0, -26);
    }

    // --- RENDU DU SPRITE BILLE ---
    const coloredCanvas = getColoredBille(p.color);
    
    if (coloredCanvas) {
        // Animation : On utilise la vitesse du joueur pour animer la bille 
        // Si vx et vy = 0, la frame reste fixe
        const isMoving = (p.vx !== 0 || p.vy !== 0);
        
        let frameIndex = 0;
        if (isMoving) {
            frameIndex = Math.floor(Date.now() / ANIM.bille.speed) % ANIM.bille.frames;
        }

        const fw = coloredCanvas.width / ANIM.bille.frames;
        const size = 40; // Taille d'affichage (Taille originale)

        // Optionnel : Rotation basée sur la direction
        if (isMoving) {
            const angle = Math.atan2(p.vy, p.vx);
            ctx.rotate(angle);
        }

        if (p.actionBlink > 0) {
            ctx.shadowColor = '#fff';
            ctx.shadowBlur = Math.min(20, p.actionBlink * 3);
        }

        ctx.drawImage(coloredCanvas, frameIndex * fw, 0, fw, coloredCanvas.height, -size/2, -size/2, size, size);
    } else {
        // Fallback si l'image n'est pas encore chargée
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.fill();
    }

    // Yeux (Optionnel si la bille a déjà des yeux, mais on les garde pour le style)
    ctx.fillStyle = '#111'; ctx.shadowBlur = 0;
    ctx.beginPath(); ctx.arc(-6, -4, 3, 0, Math.PI * 2); ctx.arc(6, -4, 3, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#111'; ctx.lineWidth = 2;
    ctx.beginPath();
    if (p.isDead) { ctx.arc(0, 10, 6, Math.PI + 0.2, Math.PI * 2 - 0.2); }
    else { ctx.arc(0, 4, 6, 0.2, Math.PI - 0.2); }
    ctx.stroke();
    ctx.restore();
}

// ── Boutons ──────────────────────────────────────────────────────────
function drawButton(b) {
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fillStyle = b.pressed ? '#2ecc71' : b.color;
    if (b.pressed) { ctx.shadowColor = '#2ecc71'; ctx.shadowBlur = 20; }
    ctx.fill(); ctx.shadowBlur = 0;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.stroke();

    ctx.fillStyle = '#000'; ctx.font = 'bold 18px Arial'; ctx.textAlign = 'center';
    ctx.fillText(b.currentCount + '/' + b.reqCount, b.x, b.y + 6);
    if (b.label) {
        ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = 'bold 13px Arial';
        ctx.fillText(b.label, b.x, b.y + b.r + 18);
    }
}

// ── Sortie ───────────────────────────────────────────────────────────
function drawExit(ex) {
    const r = ex.r || 40;
    ctx.save();
    if (ex.active) { ctx.shadowColor = '#2ecc71'; ctx.shadowBlur = 30; }
    else ctx.globalAlpha = 0.55;

    const ok = drawSprite(ANIM.sortie, ex.x, ex.y, r * 2.8);
    if (!ok) {
        ctx.beginPath(); ctx.arc(ex.x, ex.y, r, 0, Math.PI * 2);
        ctx.fillStyle = ex.active ? '#2ecc71' : '#7f8c8d'; ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 20px Arial'; ctx.textAlign = 'center';
    ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
    ctx.strokeText('SORTIE', ex.x, ex.y + 8); ctx.fillText('SORTIE', ex.x, ex.y + 8);
}

// ── Pièces ───────────────────────────────────────────────────────────
function drawCoin(c) {
    const ok = drawSprite(ANIM.piece, c.x, c.y, 36);
    if (!ok) {
        ctx.beginPath(); ctx.arc(c.x, c.y, 14, 0, Math.PI * 2);
        ctx.fillStyle = '#f1c40f'; ctx.fill();
        ctx.strokeStyle = '#f39c12'; ctx.lineWidth = 3; ctx.stroke();
    }
}

// ── Pièges (tiles animés) ─────────────────────────────────────────────
function drawTrap(t) {
    // On dessine le piège comme un sprite 40×40 centré sur t.x, t.y
    // On choisit pikkux (horizontal) ou pikkuy (vertical)
    const ok = drawSprite(ANIM.pikkux, t.x, t.y, TILE);
    if (!ok) {
        ctx.fillStyle = '#c0392b';
        ctx.fillRect(t.x - TILE / 2, t.y - TILE / 2, TILE, TILE);
        ctx.strokeStyle = '#922b21'; ctx.lineWidth = 2;
        ctx.strokeRect(t.x - TILE / 2, t.y - TILE / 2, TILE, TILE);
    }
}

// ── Reliques ─────────────────────────────────────────────────────────
function drawRelic(rel) {
    ctx.save();
    ctx.translate(rel.x, rel.y);
    ctx.rotate(Date.now() / 500);
    ctx.fillStyle = '#9b59b6';
    ctx.shadowColor = '#9b59b6'; ctx.shadowBlur = 15;
    ctx.beginPath(); ctx.moveTo(0, -20); ctx.lineTo(17, 10); ctx.lineTo(-17, 10); ctx.closePath();
    ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
}

// ── Indices au sol ───────────────────────────────────────────────────
function drawFloorClues(clues, level) {
    if (!clues) return;
    for (const clue of clues) {
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.font = 'bold 22px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('🔑 CODE', clue.x + clue.colors.length * 25, clue.y - 14);
        for (let i = 0; i < clue.colors.length; i++) {
            ctx.fillStyle = clue.colors[i];
            ctx.shadowColor = clue.colors[i]; ctx.shadowBlur = 10;
            ctx.beginPath(); ctx.arc(clue.x + i * 54, clue.y + 20, 20, 0, Math.PI * 2); ctx.fill();
            // Numéro
            if (level && level.sequenceIndex !== undefined) {
                ctx.fillStyle = i < level.sequenceIndex ? '#2ecc71' : '#fff';
                ctx.shadowBlur = 0; ctx.font = 'bold 16px Arial';
                ctx.fillText(i + 1, clue.x + i * 54, clue.y + 26);
            }
        }
        ctx.restore();
    }
}

// ── Boutons de séquence ───────────────────────────────────────────────
function drawSequenceButtons(sbs, seqIdx) {
    if (!sbs) return;
    for (const sb of sbs) {
        ctx.beginPath(); ctx.arc(sb.x, sb.y, sb.r, 0, Math.PI * 2);
        ctx.fillStyle = sb.cooldown > 0 ? '#444' : sb.color;
        if (sb.cooldown <= 0) { ctx.shadowColor = sb.color; ctx.shadowBlur = 12; }
        ctx.fill(); ctx.shadowBlur = 0;
        ctx.strokeStyle = sb.cooldown > 0 ? '#888' : '#fff'; ctx.lineWidth = 3; ctx.stroke();
    }
    if (seqIdx !== undefined && sbs.length > 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = 'bold 15px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`Séquence : ${seqIdx}/3`, sbs[0].x + sbs.length * 30, sbs[0].y - 36);
    }
}

// ── Portes dessinées par-dessus le fog ────────────────────────────────
function drawDoors(doors, buttons) {
    for (const d of doors) {
        if (!d.open) {
            const btn = buttons ? buttons.find(b => b.id === d.linkedButton) : null;
            const col = btn ? btn.color : '#e74c3c';
            ctx.fillStyle = col + 'bb'; ctx.fillRect(d.x, d.y, d.w, d.h);
            ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.strokeRect(d.x, d.y, d.w, d.h);
            ctx.font = 'bold 18px Arial'; ctx.textAlign = 'center';
            ctx.fillStyle = '#fff';
            ctx.fillText('🔒', d.x + d.w / 2, d.y + d.h / 2 + 7);
        } else {
            ctx.strokeStyle = '#2ecc71'; ctx.lineWidth = 2;
            ctx.setLineDash([8, 5]); ctx.strokeRect(d.x, d.y, d.w, d.h); ctx.setLineDash([]);
        }
    }
}

// ── UI de jeu (HUD) ──────────────────────────────────────────────────
function drawHUD(state) {
    const pIds = Object.keys(state.players);
    const pCount = pIds.length;
    const alive = pIds.filter(id => !state.players[id].isDead).length;

    // Compteur joueurs
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath(); ctx.roundRect(14, 10, 200, 44, 10); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 20px Arial'; ctx.textAlign = 'left';
    ctx.fillText(`👥 ${alive}/${pCount} en vie`, 26, 38);

    // Timer
    if (state.timeLeft !== undefined) {
        const mins = Math.floor(state.timeLeft / 60);
        const secs = state.timeLeft % 60;
        const ts = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
        const danger = state.timeLeft < 30;
        ctx.fillStyle = danger ? 'rgba(180,30,30,0.75)' : 'rgba(0,0,0,0.55)';
        ctx.beginPath(); ctx.roundRect(canvas.width / 2 - 70, 10, 140, 48, 12); ctx.fill();
        ctx.fillStyle = danger ? '#ff6b6b' : '#fff';
        ctx.font = 'bold 32px Arial'; ctx.textAlign = 'center';
        ctx.fillText(ts, canvas.width / 2, 46);
    }

    // Quêtes
    if (state.status === 'playing' && state.level?.quests) {
        // Détecte si un joueur est sous le panneau
        let underUI = false;
        for (const id of pIds) {
            const p = state.players[id];
            const sx = (p.x - camera.x) * camera.scale + canvas.width / 2;
            const sy = (p.y - camera.y) * camera.scale + canvas.height / 2;
            if (sx > 10 && sx < 430 && sy > 52 && sy < 280) { underUI = true; break; }
        }
        const alpha = underUI ? 0.15 : 0.82;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = 'rgba(12,12,20,1)';
        const qh = 50 + state.level.quests.length * 32;
        ctx.beginPath(); ctx.roundRect(14, 64, 410, qh, 14); ctx.fill();
        ctx.strokeStyle = '#2ecc71'; ctx.lineWidth = 2; ctx.stroke();
        ctx.globalAlpha = 1;

        ctx.globalAlpha = underUI ? 0.2 : 1.0;
        ctx.fillStyle = '#f1c40f'; ctx.font = 'bold 18px Arial'; ctx.textAlign = 'left';
        ctx.fillText('🏆 Quêtes & Objectifs', 30, 94);
        ctx.font = 'bold 14px Arial';
        let qy = 120;
        for (const q of state.level.quests) {
            ctx.fillStyle = q.done ? '#2ecc71' : '#ccc';
            ctx.fillText((q.done ? '✅ ' : '⬜ ') + q.text, 30, qy);
            qy += 30;
        }
        ctx.globalAlpha = 1.0;
    }
}

// ── États spéciaux (overlay) ──────────────────────────────────────────
function drawOverlays(state) {
    if (state.status === 'starting') {
        ctx.fillStyle = 'rgba(0,0,0,0.72)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#f1c40f'; ctx.font = 'bold 140px Arial'; ctx.textAlign = 'center';
        ctx.fillText(state.countdown, canvas.width / 2, canvas.height / 2 + 50);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 28px Arial';
        ctx.fillText('Préparez-vous !', canvas.width / 2, canvas.height / 2 - 90);
    } else if (state.status === 'defeat') {
        ctx.fillStyle = 'rgba(180,30,30,0.82)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 80px Arial'; ctx.textAlign = 'center';
        ctx.fillText('TEMPS ÉCOULÉ', canvas.width / 2, canvas.height / 2 - 20);
        ctx.font = 'bold 32px Arial'; ctx.fillStyle = '#fca5a5';
        ctx.fillText('ou tous morts…', canvas.width / 2, canvas.height / 2 + 50);
    }
}

// ── Lobby / Victory UI ────────────────────────────────────────────────
const lobbyUI = document.getElementById('lobby-ui');
const victoryUI = document.getElementById('victory-ui');
const pCountSpan = document.getElementById('player-count');
const gameCodeDisp = document.getElementById('game-code-display');
const playersList = document.getElementById('players-list');
const joinUrlText = document.getElementById('join-url-text');
const qrCodeImg = document.getElementById('qr-code-img');

// ── Son ───────────────────────────────────────────────────────────────
const bgMusic = new Audio('/assets/son/music.mp3');
bgMusic.loop = true; bgMusic.volume = 0.35;
const walkSound = new Audio('/assets/son/marche.mp3');
walkSound.loop = true; walkSound.volume = 0.4;

function tryBgMusic() { if (bgMusic.paused) bgMusic.play().catch(() => { }); }
function tryWalk() { if (walkSound.paused) walkSound.play().catch(() => { }); }
function stopWalk() { if (!walkSound.paused) { walkSound.pause(); walkSound.currentTime = 0; } }

const unlockAudio = () => {
    tryBgMusic();
    document.removeEventListener('pointerdown', unlockAudio);
    document.removeEventListener('keydown', unlockAudio);
};
tryBgMusic();
document.addEventListener('pointerdown', unlockAudio, { passive: true });
document.addEventListener('keydown', unlockAudio);

// ── État global ───────────────────────────────────────────────────────
let gameState = { players: {}, level: null, status: 'lobby' };
let lastLevelId = null;

socket.emit('createGame', { pseudo: new URLSearchParams(window.location.search).get('pseudo') || 'Host' }, (r) => {
    if (r.success) console.log('Game created:', r.code);
});

socket.on('stateUpdate', (state) => {
    gameState = state;

    // Lobby / Victory UI
    if (state.status === 'lobby' || state.status === 'defeat') {
        if (lobbyUI) lobbyUI.style.display = 'flex';
        if (victoryUI) victoryUI.style.display = 'none';
        if (pCountSpan) pCountSpan.innerText = Object.keys(state.players).length;
        if (gameCodeDisp) gameCodeDisp.innerText = state.code;
        if (playersList) {
            playersList.innerHTML = '';
            for (const id in state.players) {
                const p = state.players[id];
                const coloredBille = getColoredBille(p.color);
                let imgHtml = `<span style="display:inline-block;width:24px;height:24px;background:${p.color};border-radius:50%;margin-right:15px;border:2px solid white;"></span>`;
                
                if (coloredBille) {
                    // Pour le lobby on va créer des petits canvas dynamiquement ou juste utiliser le fallback couleur si trop complexe
                    // Ici on va injecter un canvas id pour le remplir après
                    imgHtml = `<canvas id="bille-icon-${id}" width="40" height="40" style="width:30px;height:30px;margin-right:15px;image-rendering:pixelated;"></canvas>`;
                }

                playersList.innerHTML += `<li style="margin-bottom:12px;display:flex;align-items:center;font-size:1.2rem;font-weight:bold;">
                  ${imgHtml}${p.pseudo}</li>`;
                
                if (coloredBille) {
                    setTimeout(() => {
                        const iconCanvas = document.getElementById(`bille-icon-${id}`);
                        if (iconCanvas) {
                            const ictx = iconCanvas.getContext('2d');
                            ictx.imageSmoothingEnabled = false;
                            const fw = coloredBille.width / ANIM.bille.frames;
                            ictx.drawImage(coloredBille, 0, 0, fw, coloredBille.height, 0, 0, 40, 40);
                        }
                    }, 0);
                }
            }

            // Preview pour "soi-même" si on est sur cet écran
            const myPlayer = state.players[socket.id]; 
            const previewSection = document.getElementById('preview-section');
            if (myPlayer) {
                if (previewSection) previewSection.style.display = 'flex';
                const coloredBille = getColoredBille(myPlayer.color);
                if (coloredBille) {
                    const previewCanvas = document.getElementById('my-bille-preview');
                    if (previewCanvas) {
                        const pCtx = previewCanvas.getContext('2d');
                        pCtx.clearRect(0,0,previewCanvas.width, previewCanvas.height);
                        const fw = coloredBille.width / ANIM.bille.frames;
                        pCtx.drawImage(coloredBille, 0, 0, fw, coloredBille.height, 0, 0, previewCanvas.width, previewCanvas.height);
                    }
                }
            } else {
                if (previewSection) previewSection.style.display = 'none';
            }
        }
        if (state.qrCodeDataUrl && qrCodeImg && qrCodeImg.src !== state.qrCodeDataUrl) {
            if (joinUrlText) joinUrlText.innerText = state.joinUrl;
            qrCodeImg.src = state.qrCodeDataUrl; qrCodeImg.style.display = 'block';
        }
    } else if (state.status === 'victory') {
        if (lobbyUI) lobbyUI.style.display = 'none';
        if (victoryUI) victoryUI.style.display = 'flex';
    } else {
        if (lobbyUI) lobbyUI.style.display = 'none';
        if (victoryUI) victoryUI.style.display = 'none';
    }
});

socket.on('gameClosed', (data) => {
    const msg = (data && data.reason === 'no-players')
        ? "La partie est terminée car tous les joueurs sont partis."
        : "Partie annulée !";
    alert(msg).then(() => { window.location.href = '/'; });
});

window.startGame = () => { tryBgMusic(); socket.emit('startGame'); };
window.cancelGame = () => { socket.emit('cancelGame'); };

// ── Boucle de rendu principale ────────────────────────────────────────
function draw() {
    ctx.fillStyle = '#1e1e24';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const status = gameState.status;
    const level = gameState.level;
    const players = gameState.players;

    if (!level || status === 'lobby') {
        stopWalk(); requestAnimationFrame(draw); return;
    }

    // (Plus besoin de buildMatrix – renderTilemap lit level.geometrie directement)

    updateCamera(level, players);

    const pIds = Object.keys(players);
    const moving = pIds.some(id => { const p = players[id]; return p.vx !== 0 || p.vy !== 0; });
    if (status === 'playing' && moving) tryWalk(); else stopWalk();

    // ── Début du contexte monde ──────────────────────────────────────
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(camera.scale, camera.scale);
    ctx.translate(-camera.x, -camera.y);

    // 1. Tilemap (Sol + Murs de base)
    renderTilemap(level, 'sol');
    renderTilemap(level, 'murs');

    // 2. Labels de salles
    if (level.rooms) {
        const roomLabels = { A: '🏠 SPAWN', B: '🔵 TAMPON', C: '🟠 VERROU', D: '🚪 SORTIE' };
        const roomColors = { A: 'rgba(46,204,113,0.12)', B: 'rgba(52,152,219,0.12)', C: 'rgba(230,126,34,0.12)', D: 'rgba(231,76,60,0.12)' };
        ctx.font = 'bold 26px Arial'; ctx.textAlign = 'center';
        for (const [k, r] of Object.entries(level.rooms)) {
            ctx.fillStyle = roomColors[k]; ctx.fillRect(r.x, r.y, r.w, r.h);
            ctx.fillStyle = roomColors[k].replace('0.12', '0.45');
            ctx.fillText(roomLabels[k], r.x + r.w / 2, r.y + 52);
        }
    }

    // 3. Sortie
    drawExit(level.exit);

    // 4. Boutons
    for (const b of level.buttons) drawButton(b);

    // 5. Pièces
    for (const c of level.coins) if (!c.collected) drawCoin(c);

    // 6. Pièges
    if (level.traps) for (const t of level.traps) drawTrap(t);

    // 7. Reliques
    if (level.relics) for (const r of level.relics) if (!r.collected) drawRelic(r);

    // 8. Indices au sol
    drawFloorClues(level.floorClues, level);

    // 9. Boutons de séquence
    drawSequenceButtons(level.sequenceButtons, level.sequenceIndex);

    // 10. Joueurs
    for (const id of pIds) drawPlayer(players[id]);

    ctx.restore(); // fin monde

    // 11. Fog of War (appliqué en screen-space)
    drawFog(level, players);
    ctx.drawImage(fogCanvas, 0, 0);

    // 12. Murs + Portes dessinés PAR-DESSUS le fog (visible même dans le brouillard)
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(camera.scale, camera.scale);
    ctx.translate(-camera.x, -camera.y);
    
    // Rendu des murs "fantômes" par-dessus le fog (pour la lisibilité)
    ctx.globalAlpha = 0.4;
    renderTilemap(level, 'murs');
    ctx.globalAlpha = 1.0;

    drawDoors(level.doors, level.buttons);
    ctx.restore();

    // 13. HUD
    if (status === 'playing' || status === 'starting') drawHUD(gameState);

    // 14. Overlays
    drawOverlays(gameState);

    requestAnimationFrame(draw);
}

draw();
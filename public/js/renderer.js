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
        PLAQUE: 8,  // plaque de pression
        COEUR: 9   // coeur de soin
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
    loadImg('coeur', '/assets/images/coeur.png');
    loadImg('pikkux', '/assets/images/pikkux.png');
    loadImg('pikkuy', '/assets/images/pikkuy.png');
    loadImg('sortie', '/assets/images/sortie.png');
    loadImg('bille', '/assets/images/bille.png');

    // Sprites animés : { img, frames, speed(ms/frame) }
    const ANIM = {
        piece: { key: 'piece', frames: 10, speed: 100 },
        coeur: { key: 'coeur', frames: 1, speed: 1000 },
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
        bctx.imageSmoothingEnabled = false;

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

    // ── Tilemap – Off-screen Canvas (OPTIMISATION) ────────────────────────
    // La tilemap statique (sol + murs) est pré-rendue UNE SEULE FOIS,
    // puis réutilisée à chaque frame via ctx.drawImage() pour économiser du CPU.
    let tileAppearance = null;  // bitmask précalculé
    let lastGeometrie = null;   // référence pour détecter un changement de niveau

    // Canvas hors-écran partagé pour la tilemap statique
    let offscreenSol = null;
    let offscreenMurs = null;
    let offscreenGeometrie = null; // référence de la géométrie associée au cache

    // Précalcule le bitmask autotile de chaque MUR dans la géométrie.
    function computeAutotile(matrice) {
        const rows = matrice.length;
        const cols = matrice[0].length;
        const isWall = (r, c) => {
            if (r < 0 || r >= rows || c < 0 || c >= cols) return true;
            return matrice[r][c] === T.MUR;
        };
        tileAppearance = Array.from({ length: rows }, () => new Array(cols).fill(0));
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (matrice[r][c] !== T.MUR) continue;
                let bitmask = 0;
                if (isWall(r - 1, c)) bitmask += 1;
                if (isWall(r, c - 1)) bitmask += 2;
                if (isWall(r, c + 1)) bitmask += 4;
                if (isWall(r + 1, c)) bitmask += 8;
                tileAppearance[r][c] = bitmask;
            }
        }
    }

    // Dessine une couche (sol ou murs) sur un canvas cible donné (offscreen ou ctx principal).
    // targetCtx : le contexte de destination
    function _drawTilemapLayer(targetCtx, matrice, layerType, imgFeuille, feuilleOk) {
        const rows = matrice.length;
        const cols = matrice[0].length;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const px = c * TILE, py = r * TILE;
                const id = matrice[r][c];
                if (layerType === 'sol') {
                    // Toutes les cases non-mur ont du sol en dessous
                    if (id !== T.MUR) {
                        if (feuilleOk) {
                            targetCtx.drawImage(imgFeuille, 0, 0, TILE, TILE, px, py, TILE, TILE);
                        } else {
                            targetCtx.fillStyle = '#0a0a0a';
                            targetCtx.fillRect(px, py, TILE, TILE);
                        }
                    }
                } else if (layerType === 'murs') {
                    if (id === T.MUR) {
                        const bitmask = tileAppearance[r][c] || 0;
                        const srcX = bitmask * TILE;
                        const srcY = 2 * TILE;
                        if (feuilleOk) {
                            targetCtx.drawImage(imgFeuille, srcX, srcY, TILE, TILE, px, py, TILE, TILE);
                        } else {
                            targetCtx.fillStyle = '#2a2a3a';
                            targetCtx.fillRect(px, py, TILE, TILE);
                        }
                    }
                }
            }
        }
    }

    // Construit (ou reconstruit) les canvas hors-écran pour la tilemap statique.
    // Appelé une seule fois par niveau. Les portes (dynamiques) sont NON incluses ici.
    function buildOffscreenTilemap(level) {
        const matrice = level.geometrie;
        if (!matrice) return;
        const rows = matrice.length;
        const cols = matrice[0].length;
        const W = cols * TILE, H = rows * TILE;

        const imgFeuille = RES['feuille'];
        const feuilleOk = imgFeuille.complete && imgFeuille.naturalWidth > 0;

        // Canvas sol
        offscreenSol = document.createElement('canvas');
        offscreenSol.width = W; offscreenSol.height = H;
        const solCtx = offscreenSol.getContext('2d');
        solCtx.imageSmoothingEnabled = false;
        _drawTilemapLayer(solCtx, matrice, 'sol', imgFeuille, feuilleOk);

        // Canvas murs
        offscreenMurs = document.createElement('canvas');
        offscreenMurs.width = W; offscreenMurs.height = H;
        const mursCtx = offscreenMurs.getContext('2d');
        mursCtx.imageSmoothingEnabled = false;
        _drawTilemapLayer(mursCtx, matrice, 'murs', imgFeuille, feuilleOk);

        offscreenGeometrie = matrice;
        console.log('[Perf] Off-screen tilemap built:', W, 'x', H);
    }

    // ── Rendu de la tilemap ───────────────────────────────────────────────
    // OPTIMISÉ : dessine uniquement le cache hors-écran si disponible.
    // Les portes (dynamiques) sont dessinées séparément par-dessus.
    function renderTilemap(level, layerType) {
        const matrice = level.geometrie;
        if (!matrice) return;

        // Recalcule autotile + cache si le niveau a changé
        if (matrice !== lastGeometrie) {
            computeAutotile(matrice);
            lastGeometrie = matrice;
            cachedSegments = null; // invalide le cache fog
            offscreenGeometrie = null; // force la reconstruction du cache tilemap
        }

        // Reconstruction du cache si nécessaire (ex: images pas encore chargées)
        if (offscreenGeometrie !== matrice) {
            const imgFeuille = RES['feuille'];
            if (imgFeuille.complete && imgFeuille.naturalWidth > 0) {
                buildOffscreenTilemap(level);
            }
        }

        // Dessin depuis le cache off-screen (très rapide : 1 seul drawImage)
        if (layerType === 'sol' && offscreenSol) {
            ctx.drawImage(offscreenSol, 0, 0);
        } else if (layerType === 'murs' && offscreenMurs) {
            ctx.drawImage(offscreenMurs, 0, 0);
            // Superpose les portes fermées (dynamiques) par-dessus
            _drawDoorOverMurs(level);
        }
    }

    // Dessine les portes fermées par-dessus la couche de murs (portes = dynamiques).
    function _drawDoorOverMurs(level) {
        const imgFeuille = RES['feuille'];
        const feuilleOk = imgFeuille.complete && imgFeuille.naturalWidth > 0;
        for (const d of level.doors) {
            if (!d.open) {
                const c0 = Math.floor(d.x / TILE), r0 = Math.floor(d.y / TILE);
                const c1 = Math.ceil((d.x + d.w) / TILE), r1 = Math.ceil((d.y + d.h) / TILE);
                for (let r = r0; r < r1; r++) {
                    for (let c = c0; c < c1; c++) {
                        const px = c * TILE, py = r * TILE;
                        if (feuilleOk) {
                            ctx.drawImage(imgFeuille, 0, 2 * TILE, TILE, TILE, px, py, TILE, TILE);
                        } else {
                            ctx.fillStyle = '#7f3030';
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
    fogCtx.imageSmoothingEnabled = false;

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

            const cx = Math.floor(canvas.width / 2);
            const cy = Math.floor(canvas.height / 2);

            fogCtx.save();
            fogCtx.translate(cx, cy);
            fogCtx.scale(camera.scale, camera.scale);
            fogCtx.translate(-Math.floor(camera.x), -Math.floor(camera.y));

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
        // Évite les micro-tremblements du scale
        camera.scale = Math.round(camera.scale * 1000) / 1000;
    }

    // ── FRUSTUM CULLING – AABB 2D ───────────────────────────────────────
    // Calcule le rectangle visible en coordonées MONDE à partir de la caméra.
    // Tout sprite dont le AABB ne croise pas ce rectangle est ignoré → 0 drawImage.
    function getCameraAABB() {
        // Demi-dimensions de l'écran en coordonées monde (inverser le scale)
        const hw = (canvas.width  / 2) / camera.scale;
        const hh = (canvas.height / 2) / camera.scale;
        return {
            x: camera.x - hw,
            y: camera.y - hh,
            w: hw * 2,
            h: hh * 2
        };
    }

    /**
     * Test d'intersection AABB rapide (Axis-Aligned Bounding Box).
     * r1 : caméra   r2 : entité  {x, y, w, h}
     * Retourne false si les rectangles ne se touchent pas du tout.
     */
    function intersectsAABB(r1, r2) {
        return !(r2.x         > r1.x + r1.w ||
                r2.x + r2.w < r1.x         ||
                r2.y         > r1.y + r1.h ||
                r2.y + r2.h < r1.y);
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

        // Pseudo au-dessus de la bille
        ctx.save();
        ctx.translate(0, -35);
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.font = 'bold 15px Arial';
        const txt = p.pseudo || '...';
        const tw = ctx.measureText(txt).width;
        ctx.beginPath();
        ctx.roundRect(-tw / 2 - 10, -12, tw + 20, 24, 12);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.fillText(txt, 0, 5);
        ctx.restore();
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

            ctx.drawImage(coloredCanvas, frameIndex * fw, 0, fw, coloredCanvas.height, -size / 2, -size / 2, size, size);
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

    // ── Coeurs (soin) ───────────────────────────────────────────────────────
    function drawHeart(h) {
        const img = RES['coeur'];
        if (img && img.complete && img.naturalWidth > 0) {
            const size = 34;
            ctx.drawImage(img, h.x - size / 2, h.y - size / 2, size, size);
            return;
        }

        // Fallback si l'asset n'est pas encore chargé
        ctx.fillStyle = '#ff4d6d';
        ctx.beginPath();
        ctx.arc(h.x - 7, h.y - 4, 7, 0, Math.PI * 2);
        ctx.arc(h.x + 7, h.y - 4, 7, 0, Math.PI * 2);
        ctx.lineTo(h.x, h.y + 12);
        ctx.closePath();
        ctx.fill();
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
            const panelWidth = 320;
            const panelX = canvas.width - panelWidth - 20;
            const qh = 50 + state.level.quests.length * 32;

            // Détecte si un joueur est sous le panneau
            let underUI = false;
            for (const id of pIds) {
                const p = state.players[id];
                const sx = (p.x - camera.x) * camera.scale + canvas.width / 2;
                const sy = (p.y - camera.y) * camera.scale + canvas.height / 2;
                if (sx > panelX && sx < canvas.width && sy > 52 && sy < 280) { underUI = true; break; }
            }
            const alpha = underUI ? 0.2 : 0.85;
            ctx.globalAlpha = alpha;
            ctx.fillStyle = 'rgba(12,12,20,1)';
            ctx.beginPath(); ctx.roundRect(panelX, 64, panelWidth, qh, 14); ctx.fill();
            ctx.strokeStyle = '#2ecc71'; ctx.lineWidth = 2; ctx.stroke();
            ctx.globalAlpha = 1;

            ctx.globalAlpha = underUI ? 0.3 : 1.0;
            ctx.fillStyle = '#f1c40f'; ctx.font = 'bold 18px Arial'; ctx.textAlign = 'left';
            ctx.fillText('🏆 Missions', panelX + 20, 94);
            ctx.font = 'bold 14px Arial';
            let qy = 120;
            for (const q of state.level.quests) {
                ctx.fillStyle = q.done ? '#2ecc71' : '#ccc';
                ctx.fillText((q.done ? '✅ ' : '⬜ ') + q.text, panelX + 20, qy);
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
    const defeatUI = document.getElementById('defeat-ui');
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

    // ── Interpolation client (OPTIMISATION) ───────────────────────────────
    // targetPlayers contient les positions REÇUES du serveur (snapshots réseau).
    // gameState.players contient les positions INTERPOLÉES affichées à l'écran.
    // La valeur 0.18 = vitesse de lissage. Augmenter pour plus de réactivité,
    // diminuer pour plus de fluidité (au prix d'un léger retard visuel).
    const LERP_FACTOR = 0.18;
    let targetPlayers = {}; // Dernières positions connues (serveur)

    // ── Décompression du payload compact (OPTIMISATION) ──────────────────
    // Le serveur envoie les joueurs sous forme de tableaux compacts.
    // Format : [x, y, vx, vy, hp, isDead, invuln, actionBlink, color, pseudo]
    // Cette fonction recrée un objet player lisible pour le reste du client.
    function decompressPlayers(rawPlayers) {
        const result = {};
        for (const id in rawPlayers) {
            const d = rawPlayers[id];
            // Si c'est déjà un objet (update complet), on le prend tel quel
            if (!Array.isArray(d)) { result[id] = d; continue; }
            result[id] = {
                id,
                x: d[0],
                y: d[1],
                vx: d[2],
                vy: d[3],
                hp: d[4],
                isDead: d[5] === 1,
                invuln: d[6],
                actionBlink: d[7],
                color: d[8],
                pseudo: d[9]
            };
        }
        return result;
    }

    socket.emit('createGame', { pseudo: new URLSearchParams(window.location.search).get('pseudo') || 'Host' }, (r) => {
        if (r.success) console.log('Game created:', r.code);
    });

    socket.on('stateUpdate', (newState) => {
        // ── Décompression du payload compact ─────────────────────────────
        // Le serveur envoie les joueurs compressés en tableaux (_compressed flag).
        // On les convertit en objets avant tout traitement.
        if (newState._compressed && newState.players) {
            newState.players = decompressPlayers(newState.players);
        }

        // Update complet (nouveau niveau, géométrie incluse)
        if (newState.level && newState.level.geometrie) {
            gameState = newState;
            // Synchronise les cibles et positions immédiatement (pas d'interpolation au départ)
            targetPlayers = {};
            for (const id in newState.players) {
                targetPlayers[id] = { ...newState.players[id] };
                gameState.players[id] = { ...newState.players[id] }; // position identique
            }
            // Invalide le cache tilemap car la géométrie a changé
            offscreenGeometrie = null;
        } else {
            // Tick dynamique : on ne téléporte PAS les joueurs, on met à jour les CIBLES
            gameState.status = newState.status;
            gameState.timeLeft = newState.timeLeft;
            gameState.countdown = newState.countdown;

            // Met à jour les cibles réseau pour l'interpolation
            // (les positions visuelles sont lissées dans la boucle draw())
            for (const id in newState.players) {
                if (!targetPlayers[id]) {
                    // Nouveau joueur : initialise directement sans interpolation
                    targetPlayers[id] = { ...newState.players[id] };
                    if (!gameState.players[id]) gameState.players[id] = { ...newState.players[id] };
                } else {
                    // Mise à jour des données cibles (position + état)
                    Object.assign(targetPlayers[id], newState.players[id]);
                }
            }
            // Supprime les joueurs partis
            for (const id in targetPlayers) {
                if (!newState.players[id]) {
                    delete targetPlayers[id];
                    delete gameState.players[id];
                }
            }

            if (newState.level && gameState.level) {
                Object.assign(gameState.level, newState.level);
            }
        }

        // Lobby / Victory UI
        const state = gameState; // Pour compatibilité avec la suite du code
        if (state.status === 'lobby') {
            if (lobbyUI) lobbyUI.style.display = 'flex';
            if (victoryUI) victoryUI.style.display = 'none';
            if (defeatUI) defeatUI.style.display = 'none';
            if (pCountSpan) pCountSpan.innerText = Object.keys(state.players).length;
            if (gameCodeDisp) gameCodeDisp.innerText = state.code;
            if (playersList) {
                playersList.innerHTML = '';
                for (const id in state.players) {
                    const p = state.players[id];
                    const coloredBille = getColoredBille(p.color);
                    let imgHtml = `<span style="display:inline-block;width:24px;height:24px;background:${p.color};border-radius:50%;margin-right:15px;border:2px solid white;"></span>`;

                    if (coloredBille) {
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
                            pCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
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
            if (defeatUI) defeatUI.style.display = 'none';
        } else if (state.status === 'defeat') {
            if (lobbyUI) lobbyUI.style.display = 'none';
            if (victoryUI) victoryUI.style.display = 'none';
            if (defeatUI) defeatUI.style.display = 'flex';
        } else {
            if (lobbyUI) lobbyUI.style.display = 'none';
            if (victoryUI) victoryUI.style.display = 'none';
            if (defeatUI) defeatUI.style.display = 'none';
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
    window.returnToLobby = () => { socket.emit('returnToLobby'); };

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

        // ── INTERPOLATION DES JOUEURS (OPTIMISATION) ──────────────────────
        // À chaque frame, on déplace les positions visuelles vers les cibles
        // réseau par un facteur LERP. Résultat : mouvement fluide à 60 FPS
        // même si le serveur n'envoie des positions que 20 fois par seconde.
        for (const id in targetPlayers) {
            const target = targetPlayers[id];
            const current = players[id];
            if (!current) {
                players[id] = { ...target };
                continue;
            }
            // Lerp sur la position uniquement (les autres champs sont copiés directs)
            current.x += (target.x - current.x) * LERP_FACTOR;
            current.y += (target.y - current.y) * LERP_FACTOR;
            // Copie instantanée des données d'état (HP, invuln, etc.)
            current.vx = target.vx;
            current.vy = target.vy;
            current.hp = target.hp;
            current.isDead = target.isDead;
            current.invuln = target.invuln;
            current.actionBlink = target.actionBlink;
            current.color = target.color;
            current.pseudo = target.pseudo;
        }

        updateCamera(level, players);

        const cx = Math.floor(canvas.width / 2);
        const cy = Math.floor(canvas.height / 2);

        const pIds = Object.keys(players);
        const moving = pIds.some(id => { const p = players[id]; return p.vx !== 0 || p.vy !== 0; });
        if (status === 'playing' && moving) tryWalk(); else stopWalk();

        // ── Début du contexte monde ──────────────────────────────────────
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(camera.scale, camera.scale);
        ctx.translate(-Math.floor(camera.x), -Math.floor(camera.y));

        // 1. Tilemap (Sol + Murs de base)
        renderTilemap(level, 'sol');
        renderTilemap(level, 'murs');

        // ── FRUSTUM CULLING \u2013 Calcul unique du rectangle visible (coordonnées monde) ──
        // Tous les sprites passent par ce test avant tout appel ctx.drawImage().
        const camAABB = getCameraAABB();
        // Marge de sécurité en pixels monde pour éviter les pop-ins visibles au bord
        const CULL_MARGIN = TILE * 2;
        const camAABBMargin = {
            x: camAABB.x - CULL_MARGIN,
            y: camAABB.y - CULL_MARGIN,
            w: camAABB.w + CULL_MARGIN * 2,
            h: camAABB.h + CULL_MARGIN * 2
        };

        // 3. Sortie (toujours visible - petite entité importante)
        drawExit(level.exit);

        // 4. Boutons (taille ~60px : rayon + marge)
        for (const b of level.buttons) {
            if (intersectsAABB(camAABBMargin, { x: b.x - b.r, y: b.y - b.r, w: b.r * 2, h: b.r * 2 }))
                drawButton(b);
        }

        // 5. Pièces (sprite 36px centré sur c.x, c.y)
        for (const c of level.coins) {
            if (!c.collected && intersectsAABB(camAABBMargin, { x: c.x - 18, y: c.y - 18, w: 36, h: 36 }))
                drawCoin(c);
        }

        // 5bis. Coeurs (sprite 34px)
        if (level.hearts) for (const h of level.hearts) {
            if (!h.collected && intersectsAABB(camAABBMargin, { x: h.x - 17, y: h.y - 17, w: 34, h: 34 }))
                drawHeart(h);
        }

        // 6. Pièges (sprite TILE×TILE)
        if (level.traps) for (const t of level.traps) {
            if (intersectsAABB(camAABBMargin, { x: t.x - TILE / 2, y: t.y - TILE / 2, w: TILE, h: TILE }))
                drawTrap(t);
        }

        // 10. Joueurs (bille 40px)
        for (const id of pIds) {
            const p = players[id];
            if (intersectsAABB(camAABBMargin, { x: p.x - 20, y: p.y - 20, w: 40, h: 40 }))
                drawPlayer(p);
        }

        // 11. Portes (dessinées en dernier dans le monde pour être au-dessus)
        drawDoors(level.doors, level.buttons);

        ctx.restore(); // fin monde

        // 13. HUD
        if (status === 'playing' || status === 'starting') drawHUD(gameState);

        // 14. Overlays
        drawOverlays(gameState);

        requestAnimationFrame(draw);
    }

    draw();
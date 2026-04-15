/**
 * Fonction utilitaire pour tirer un nombre entier aléatoire
 */
function tirerNombreAleatoire(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Génère la structure de base (murs extérieurs et herbe)
 */
function genererStructureBase(taille) {
    let geometrie = [];
    const ID_MUR = 6;
    const ID_SOL = 1;

    for (let y = 0; y < taille; y++) {
        let ligne = [];
        for (let x = 0; x < largeurCalculée(taille); x++) {
            if (y === 0 || y === taille - 1 || x === 0 || x === largeurCalculée(taille) - 1) {
                ligne.push(ID_MUR);
            } else {
                ligne.push(ID_SOL);
            }
        }
        geometrie.push(ligne);
    }
    return geometrie;
}

/**
 * Calcule la largeur pour accommoder deux compartiments
 */
function largeurCalculée(taille) {
    return Math.floor(taille * 1.5);
}

/**
 * Vérifie si une case est "protégée" (ne doit pas devenir un mur de labyrinthe ou un piège)
 */
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
            // On protège si le voisin n'est ni du sol, ni un mur extérieur, ni un autre élément décoratif (comme une pièce ou un piège déjà posé)
            // En gros, on protège si c'est une porte, un départ, une plaque ou une sortie
            if (idVoisin !== ID_SOL && idVoisin !== ID_MUR_EXTERIEUR && idVoisin !== 7 && idVoisin !== 5) {
                return true;
            }
        }
    }
    return false;
}

/**
 * Ajoute des murs aléatoires pour créer un labyrinthe
 */
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

/**
 * Ajoute des pièces (coins) dans les espaces vides
 */
function ajouterPieces(matrice) {
    const ID_SOL = 1;
    const ID_PIECE = 7;
    
    for (let y = 0; y < matrice.length; y++) {
        for (let x = 0; x < matrice[0].length; x++) {
            if (matrice[y][x] === ID_SOL && !estCaseProtegee(matrice, x, y)) {
                if (Math.random() < 0.12) { // 12% de chance
                    matrice[y][x] = ID_PIECE;
                }
            }
        }
    }
}

/**
 * Ajoute des pièges (ID 5 - trous mortels)
 */
function ajouterPieges(matrice) {
    const ID_SOL = 1;
    const ID_PIEGE = 5;
    
    for (let y = 0; y < matrice.length; y++) {
        for (let x = 0; x < matrice[0].length; x++) {
            // On place des pièges uniquement sur le sol, avec une probabilité assez basse
            // pour ne pas rendre le niveau impossible
            if (matrice[y][x] === ID_SOL && !estCaseProtegee(matrice, x, y)) {
                if (Math.random() < 0.08) { // 8% de chance
                    matrice[y][x] = ID_PIEGE;
                }
            }
        }
    }
}

/**
 * Construit une salle de 5x5 autour d'un point central avec une porte
 */
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
            if (cy - 3 > 0) matrice[cy - 3][cx] = ID_SOL; 
            break;
        case "bas":
            matrice[cy + 2][cx] = ID_PORTE;
            matrice[cy + 1][cx] = ID_SOL;
            if (cy + 3 < matrice.length - 1) matrice[cy + 3][cx] = ID_SOL;
            break;
        case "gauche":
            matrice[cy][cx - 2] = ID_PORTE;
            matrice[cy][cx - 1] = ID_SOL;
            if (cx - 3 > 0) matrice[cy][cx - 3] = ID_SOL;
            break;
        case "droite":
            matrice[cy][cx + 2] = ID_PORTE;
            matrice[cy][cx + 1] = ID_SOL;
            if (cx + 3 < matrice[0].length - 1) matrice[cy][cx + 3] = ID_SOL;
            break;
    }
}

/**
 * Génère une map complète avec labyrinthes, portes, plaques, pièces et pièges
 */
function genererMapMultijoueur(nombreJoueurs) {
    const ID_MUR = 6;
    const ID_SOL = 1;
    const ID_PORTE = 2;
    const ID_DEPART = 3;
    const ID_PLAQUE = 8;
    
    const tailleH = 12 + (nombreJoueurs * 2);
    const tailleL = largeurCalculée(tailleH);
    
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

    const milieuX = Math.floor(tailleL / 2);
    for (let y = 1; y < tailleH - 1; y++) {
        matrice[y][milieuX] = ID_MUR;
    }
    
    const porteSeparationY = tirerNombreAleatoire(2, tailleH - 3);
    matrice[porteSeparationY][milieuX] = ID_PORTE;

    const departX = tirerNombreAleatoire(1, milieuX - 1);
    const departY = tirerNombreAleatoire(1, tailleH - 2);
    matrice[departY][departX] = ID_DEPART;

    let plaque1X, plaque1Y;
    do {
        plaque1X = tirerNombreAleatoire(1, milieuX - 1);
        plaque1Y = tirerNombreAleatoire(1, tailleH - 2);
    } while (plaque1X === departX && plaque1Y === departY);
    matrice[plaque1Y][plaque1X] = ID_PLAQUE;

    const margin = 4;
    const arriveX = tirerNombreAleatoire(milieuX + margin, tailleL - margin - 1);
    const arriveY = tirerNombreAleatoire(margin, tailleH - margin - 1);

    construireSalleSortie(matrice, arriveX, arriveY);

    let plaque2X, plaque2Y;
    let plaque2Ok = false;
    while (!plaque2Ok) {
        plaque2X = tirerNombreAleatoire(milieuX + 1, tailleL - 2);
        plaque2Y = tirerNombreAleatoire(1, tailleH - 2);
        if (matrice[plaque2Y][plaque2X] === ID_SOL) {
            plaque2Ok = true;
        }
    }
    matrice[plaque2Y][plaque2X] = ID_PLAQUE;

    // Ajout du labyrinthe
    ajouterLabyrinthe(matrice, 1, milieuX - 1, 1, tailleH - 2);
    ajouterLabyrinthe(matrice, milieuX + 1, tailleL - 2, 1, tailleH - 2);

    // Ajout des pièces
    ajouterPieces(matrice);

    // Ajout des pièges
    ajouterPieges(matrice);

    return {
        nbJoueurs: nombreJoueurs,
        largeur: tailleL,
        hauteur: tailleH,
        geometrie: matrice
    };
}

/**
 * Affiche la map dans la console
 */
function afficherMap(mapData) {
    console.log(`\n=== DONJON DANGEREUX POUR ${mapData.nbJoueurs} JOUEUR(S) ===`);
    
    for (let y = 0; y < mapData.geometrie.length; y++) {
        console.log(mapData.geometrie[y].map(cell => {
            if (cell === 4) return "A"; // Arrivée
            if (cell === 3) return "D"; // Départ
            if (cell === 2) return "P"; // Porte
            if (cell === 8) return "S"; // Plaque
            if (cell === 7) return "o"; // Pièce
            if (cell === 5) return "!"; // Piège (Trou)
            if (cell === 6) return "X"; // Mur
            return ".";                // Sol
        }).join('  '));
    }
}

// --- Test ---
const maMap = genererMapMultijoueur(2);
afficherMap(maMap);
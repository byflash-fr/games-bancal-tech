/**
 * Fonction utilitaire pour tirer un nombre entier aléatoire
 */
function tirerNombreAleatoire(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Calcule la largeur pour accommoder deux compartiments
 */
function largeurCalculée(taille) {
    return Math.floor(taille * 1.5);
}

/**
 * Vérifie si une case est "protégée" (ne doit pas devenir un mur de labyrinthe ou un piège)
 * Avec des couloirs de 3 de large, on vérifie un périmètre plus large.
 */
const PROTECTED_IDS = new Set([2, 3, 4, 8]);
function estCaseProtegee(matrice, x, y) {
    const ID_SOL = 1;

    // On ne remplace pas ce qui n'est plus du sol
    if (matrice[y][x] !== ID_SOL) return true;

    // Rayon de protection de 2 cases autour des éléments interactifs
    for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
            let nx = x + dx;
            let ny = y + dy;
            if (ny >= 0 && ny < matrice.length && nx >= 0 && nx < matrice[0].length) {
                let idVoisin = matrice[ny][nx];
                // On protège un large espace autour de : Porte(2), Départ(3), Sortie(4), Plaque(8)
                if (PROTECTED_IDS.has(idVoisin)) {
                    return true;
                }
            }
        }
    }
    return false;
}

/**
 * Ajoute des murs aléatoires pour créer un labyrinthe avec des COULOIRS DE 3 DE LARGE
 */
function ajouterLabyrinthe(matrice, minX, maxX, minY, maxY) {
    const ID_MUR = 6;
    const ESPACEMENT = 4; // 1 bloc pour le mur + 3 blocs pour le couloir = 4

    for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
            // Création basée sur une macro-grille pour garantir la largeur de 3
            if (x % ESPACEMENT === 0 && y % ESPACEMENT === 0) {
                if (!estCaseProtegee(matrice, x, y)) {
                    // On augmente les chances de murs pour bien remplir les grandes zones
                    if (Math.random() > 0.25) {
                        matrice[y][x] = ID_MUR;
                        const directions = [{ dx: 1, dy: 0 }, { dx: 0, dy: 1 }];
                        let dir = directions[tirerNombreAleatoire(0, 1)];

                        // On prolonge le mur pour relier au prochain point de la grille espacée
                        for (let i = 1; i <= ESPACEMENT; i++) {
                            let ex = x + dir.dx * i;
                            let ey = y + dir.dy * i;

                            // On s'arrête si on touche un bord protégé
                            if (ey <= maxY && ex <= maxX && !estCaseProtegee(matrice, ex, ey)) {
                                matrice[ey][ex] = ID_MUR;
                            } else {
                                break;
                            }
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
                if (Math.random() < 0.05) { // Probabilité baissée car la carte est énorme
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
            if (matrice[y][x] === ID_SOL && !estCaseProtegee(matrice, x, y)) {
                if (Math.random() < 0.03) { // Probabilité baissée pour adapter à la grande taille
                    matrice[y][x] = ID_PIEGE;
                }
            }
        }
    }
}

/**
 * Construit une salle de 9x9 (pour accueillir une porte de 3)
 */
function construireSalleSortie(matrice, cx, cy) {
    const ID_MUR = 6;
    const ID_SOL = 1;
    const ID_SORTIE = 4;
    const ID_PORTE = 2;

    // Rayon de 4 pour obtenir une salle 9x9
    const R = 4;

    for (let dy = -R; dy <= R; dy++) {
        for (let dx = -R; dx <= R; dx++) {
            let targetX = cx + dx;
            let targetY = cy + dy;

            if (targetY >= 0 && targetY < matrice.length && targetX >= 0 && targetX < matrice[0].length) {
                if (Math.abs(dx) === R || Math.abs(dy) === R) {
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

    // Les portes font 3 de large, on les place sur i allant de -1 à 1
    switch (choix) {
        case "haut":
            for (let i = -1; i <= 1; i++) {
                matrice[cy - R][cx + i] = ID_PORTE;
                matrice[cy - R + 1][cx + i] = ID_SOL; // Dégage l'intérieur
                if (cy - R - 1 > 0) matrice[cy - R - 1][cx + i] = ID_SOL; // Dégage l'extérieur
            }
            break;
        case "bas":
            for (let i = -1; i <= 1; i++) {
                matrice[cy + R][cx + i] = ID_PORTE;
                matrice[cy + R - 1][cx + i] = ID_SOL;
                if (cy + R + 1 < matrice.length - 1) matrice[cy + R + 1][cx + i] = ID_SOL;
            }
            break;
        case "gauche":
            for (let i = -1; i <= 1; i++) {
                matrice[cy + i][cx - R] = ID_PORTE;
                matrice[cy + i][cx - R + 1] = ID_SOL;
                if (cx - R - 1 > 0) matrice[cy + i][cx - R - 1] = ID_SOL;
            }
            break;
        case "droite":
            for (let i = -1; i <= 1; i++) {
                matrice[cy + i][cx + R] = ID_PORTE;
                matrice[cy + i][cx + R - 1] = ID_SOL;
                if (cx + R + 1 < matrice[0].length - 1) matrice[cy + i][cx + R + 1] = ID_SOL;
            }
            break;
    }
}

/**
 * Génère une map complète
 */
function genererMapMultijoueur(nombreJoueurs) {
    const ID_MUR = 6;
    const ID_SOL = 1;
    const ID_PORTE = 2;
    const ID_DEPART = 3;
    const ID_PLAQUE = 8;

    // On augmente énormément la taille de base pour avoir de la place pour les couloirs de 3
    const tailleH = 32 + (nombreJoueurs * 10);
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

    // Porte centrale de 3 cases de large
    const porteSeparationY = tirerNombreAleatoire(4, tailleH - 5);
    for (let i = -1; i <= 1; i++) {
        matrice[porteSeparationY + i][milieuX] = ID_PORTE;
    }

    // Sécurité de marge pour ne pas coller aux murs extérieurs
    const margin = 6;

    // Point de départ
    const departX = tirerNombreAleatoire(margin, milieuX - margin);
    const departY = tirerNombreAleatoire(margin, tailleH - margin);
    matrice[departY][departX] = ID_DEPART;

    // Plaque compartiment 1
    let plaque1X, plaque1Y;
    do {
        plaque1X = tirerNombreAleatoire(margin, milieuX - margin);
        plaque1Y = tirerNombreAleatoire(margin, tailleH - margin);
    } while (Math.abs(plaque1X - departX) < 4 && Math.abs(plaque1Y - departY) < 4); // On s'assure qu'elle n'est pas trop collée au départ
    matrice[plaque1Y][plaque1X] = ID_PLAQUE;

    // Arrivée (dans compartiment 2)
    const arriveX = tirerNombreAleatoire(milieuX + margin, tailleL - margin);
    const arriveY = tirerNombreAleatoire(margin, tailleH - margin);

    construireSalleSortie(matrice, arriveX, arriveY);

    // Plaque compartiment 2
    let plaque2X, plaque2Y;
    let plaque2Ok = false;
    while (!plaque2Ok) {
        plaque2X = tirerNombreAleatoire(milieuX + margin, tailleL - margin);
        plaque2Y = tirerNombreAleatoire(margin, tailleH - margin);
        // On évite la salle de sortie
        if (matrice[plaque2Y][plaque2X] === ID_SOL) {
            plaque2Ok = true;
        }
    }
    matrice[plaque2Y][plaque2X] = ID_PLAQUE;

    // Ajout des labyrinthes dans chaque moitié
    ajouterLabyrinthe(matrice, 1, milieuX - 1, 1, tailleH - 2);
    ajouterLabyrinthe(matrice, milieuX + 1, tailleL - 2, 1, tailleH - 2);

    // Ajout des décorations/dangers
    ajouterPieces(matrice);
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
    console.log(`Taille: ${mapData.largeur}x${mapData.hauteur}\n`);

    for (let y = 0; y < mapData.geometrie.length; y++) {
        console.log(mapData.geometrie[y].map(cell => {
            if (cell === 4) return "A"; // Arrivée
            if (cell === 3) return "D"; // Départ
            if (cell === 2) return "P"; // Porte
            if (cell === 8) return "S"; // Plaque
            if (cell === 7) return "o"; // Pièce
            if (cell === 5) return "!"; // Piège (Trou)
            if (cell === 6) return "X"; // Mur
            return " ";                 // Sol (remplacé le point par un espace pour la lisibilité)
        }).join(' '));
    }
}

// --- Test ---
const maMap = genererMapMultijoueur(2);
afficherMap(maMap);
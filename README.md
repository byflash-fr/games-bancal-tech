# Bancal 🎮

**Bancal** est un jeu vidéo 2D coopératif multijoueur local, axé sur la coordination, la communication et la gestion du temps. Conçu pour 2 à 20 joueurs, le jeu exige une entraide totale pour franchir des niveaux fermés ("Box") générés de manière procédurale avant la fin du temps imparti.

## 🌐 Accès et Création de Salle
Pour jouer et créer une salle (room), nous utilisons notre nom de domaine officiel :
**👉 [games.bancal.tech](https://games.bancal.tech)**

L'architecture est basée sur un modèle de type "AirConsole" avec un écran centralisé. Les joueurs utilisent simplement leur smartphone comme manette en scannant un code QR ou en se rendant directement sur ce nom de domaine pour rejoindre la partie instantanément.

## 📖 Mécaniques Principales (Core Mechanics)
* **Champ de Vision Limité (Fog of War) :** C'est la mécanique de difficulté centrale. Chaque joueur ne voit qu'une zone circulaire restreinte autour de son personnage et la vision ne traverse pas les murs. Cela oblige les joueurs à communiquer vocalement en permanence pour se décrire mutuellement leur environnement.
* **Coopération Obligatoire :** Aucune victoire individuelle n'est possible. Les joueurs doivent résoudre des énigmes logiques nécessitant une synchronisation précise (activer des plaques de pression, récupérer des clés, se déplacer en étant liés physiquement).
* **Génération Procédurale :** L'enchaînement et la structure des niveaux sont générés par un algorithme (Arbre de décision/Decision Tree) qui adapte la complexité en fonction du nombre de joueurs présents.

## 🖥️ Affichage et Contrôles

* **Serveur (Écran Principal) :** Centralise la logique du jeu, le chronomètre global et l'affichage de la carte.
    * **Vue Dynamique Intelligente :** L'écran utilise un système de caméra adaptative capable de **zoomer et dézoomer automatiquement**.
    * **Visibilité Totale :** Quelle que soit la distance entre les participants, la caméra ajuste son champ de vision pour maintenir l'ensemble des joueurs visibles à l'écran en permanence.
    * **Fluidité :** Élimine le besoin de scinder l'écran (split-screen), offrant une vue d'ensemble claire et unifiée pour tous les spectateurs et joueurs.

* **Clients (Smartphones) :** Utilisés comme manettes de jeu.
    * **Accès Simplifié :** Aucune application à télécharger ; tout se passe via le **navigateur web mobile**.
    * **Réactivité :** Envoi instantané des commandes de mouvement et d'action au serveur pour une expérience de jeu fluide.

## 🛠️ Architecture et Technologies
L'architecture technique repose sur un modèle Client-Serveur centralisé conçu pour le temps réel et une très faible latence :
* **Serveur Central :** Construit avec `Node.js`, il gère la logique du jeu, la physique, la génération de niveaux et le chronomètre.
* **Réseau (Temps Réel) :** Utilisation de `WebSockets` via la bibliothèque `Socket.io` pour assurer une communication bidirectionnelle ultra-rapide entre les smartphones et l'écran principal.
* **Affichage :** Technologies Web standards (HTML5 Canvas / JS) pour le moteur de rendu et la gestion du brouillard de guerre.

## 👥 Équipe et Organisation
Projet conçu et développé par le groupe **TP4F-4G** :
* Ahmed Ashry
* Paul
* Walid Boussaa
* Thai Son Hoang

**Méthodes de travail :**
* **Planification :** Utilisation d'une structure WBS, couplée à des diagrammes de PERT et de GANTT pour le suivi des délais. Gestion quotidienne via Trello.
* **Qualité du code :** Utilisation du **Pair Programming** pour les modules complexes (synchronisation réseau, systèmes critiques) afin de réduire les erreurs.
* **Versionning :** Git/GitHub pour la gestion du code source.

@echo off
title Serveur Bancal
echo =======================================
echo     Demarrage du Serveur Bancal
echo =======================================
echo Appuyez sur Ctrl+C ou fermez cette fenetre pour arreter le jeu.
cd /d "%~dp0"
node server.js
pause

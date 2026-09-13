import { Game } from './Game.js';

const menu = document.getElementById('mainMenu');
const btnStart = document.getElementById('btnStartGame');
const btnQuit = document.getElementById('btnQuit');
const gameOverlay = document.getElementById('gameOverlay');

let game = null;

function startGame() {
    menu.classList.add('hidden');
    gameOverlay.classList.add('active');
    if (!game) {
        game = new Game();
        game.init();
        window.__game = game;
    } else {
        game.restartLevels();
    }
}

btnStart.addEventListener('click', startGame);
btnQuit.addEventListener('click', () => {
    if (confirm('Quit game?')) {
        window.close();
    }
});

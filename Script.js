import { Game } from './Game.js';

const menu = document.getElementById('mainMenu');
const btnStart = document.getElementById('btnStartGame');

let game = null;

function startGame() {
    menu.classList.add('hidden');
    if (!game) {
        game = new Game();
        game.init();
        window.__game = game;
    }
}

btnStart.addEventListener('click', startGame);

import { Game } from './Game.js';

const menu = document.getElementById('mainMenu');
const btnStart = document.getElementById('btnStartGame');

const menuAudio = new Audio('MainMenu.mp3');
menuAudio.loop = true;
menuAudio.volume = 0.5;

let menuMusicStarted = false;
function startMenuMusic() {
    if (menuMusicStarted) return;
    menuMusicStarted = true;
    menuAudio.play().catch(() => {});
}
document.addEventListener('click', startMenuMusic, { once: true });
document.addEventListener('keydown', startMenuMusic, { once: true });

window.__startMenuMusic = () => { menuMusicStarted = true; menuAudio.play().catch(() => {}); };
window.__stopMenuMusic  = () => { menuAudio.pause(); menuAudio.currentTime = 0; };

let game = null;

function startGame() {
    window.__stopMenuMusic();
    menu.classList.add('hidden');
    if (!game) {
        game = new Game();
        game.init();
        window.__game = game;
    }
}

btnStart.addEventListener('click', startGame);

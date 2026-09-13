import { Game } from './Game.js';

const introSequence = document.getElementById('introSequence');
const introBlack = document.getElementById('introBlack');
const introText = document.getElementById('introText');

const loadingScreen = document.getElementById('loadingScreen');
const loadingBarFill = document.getElementById('loadingBarFill');
const loadingDots = document.getElementById('loadingDots');

const menu = document.getElementById('mainMenu');
const menuBgWrap = document.getElementById('menuBgWrap');
const menuBg = document.getElementById('menuBg');
const btnPlay = document.getElementById('btnPlay');
const btnSettings = document.getElementById('btnSettings');
const btnCredits = document.getElementById('btnCredits');
const btnExit = document.getElementById('btnExit');
const logsBtn = document.getElementById('logsBtn');
const logsPanel = document.getElementById('logsPanel');
const logsClose = document.getElementById('logsClose');

const creditsScreen = document.getElementById('creditsScreen');
const creditsText = document.getElementById('creditsText');

const gameOverlay = document.getElementById('gameOverlay');

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

window.__startMenuMusic = () => {
    menuMusicStarted = true;
    menuAudio.play().catch(() => {});
};
window.__stopMenuMusic = () => {
    menuAudio.pause();
    menuAudio.currentTime = 0;
};

function playIntro() {
    return new Promise((resolve) => {
        setTimeout(() => { introBlack.classList.add('show'); }, 400);
        setTimeout(() => { introText.classList.add('show'); }, 1600);
        setTimeout(() => { introSequence.classList.add('fadeOut'); }, 3600);
        setTimeout(() => {
            introSequence.style.display = 'none';
            resolve();
        }, 4700);
    });
}

let targetRotX = 0, targetRotY = 0;
let curRotX = 0, curRotY = 0;
let mouseNX = 0, mouseNY = 0;
let menuParallaxActive = true;

document.addEventListener('mousemove', (e) => {
    if (!menuParallaxActive) return;
    if (menu.classList.contains('hidden')) return;

    mouseNX = (e.clientX / window.innerWidth) * 2 - 1;
    mouseNY = (e.clientY / window.innerHeight) * 2 - 1;
    targetRotY = mouseNX * 3.2;
    targetRotX = -mouseNY * 2.4;
});

function parallaxLoop() {
    if (menuParallaxActive && !menu.classList.contains('hidden') && menuBgWrap) {
        curRotX += (targetRotX - curRotX) * 0.08;
        curRotY += (targetRotY - curRotY) * 0.08;
        const tx = -mouseNX * 12;
        const ty = -mouseNY * 12;
        menuBgWrap.style.transform =
            `translate(${tx}px, ${ty}px) rotateX(${curRotX}deg) rotateY(${curRotY}deg) scale(1.05)`;
    }
    requestAnimationFrame(parallaxLoop);
}
parallaxLoop();

logsBtn.addEventListener('click', () => logsPanel.classList.add('open'));
logsClose.addEventListener('click', () => logsPanel.classList.remove('open'));

function showToast(msg) {
    let toast = document.getElementById('menuToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'menuToast';
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(window.__toastTimeout);
    window.__toastTimeout = setTimeout(() => toast.classList.remove('show'), 2000);
}

let creditsRunning = false;

function playCreditsAndExit() {
    if (creditsRunning) return;
    creditsRunning = true;

    window.__stopMenuMusic();
    menuParallaxActive = false;
    menu.classList.add('hidden');
    logsPanel.classList.remove('open');

    document.querySelectorAll('audio').forEach(a => {
        try { a.pause(); a.currentTime = 0; } catch (e) {}
    });

    creditsScreen.classList.add('active');

    void creditsScreen.offsetWidth;
    creditsScreen.classList.add('visible');

    creditsText.classList.remove('scrolling');
    creditsText.style.top = '100%';
    void creditsText.offsetWidth;

    setTimeout(() => {
        const scrollArea = creditsScreen.querySelector('.credits-scroll-area');
        const areaHeight = scrollArea.clientHeight;
        const textHeight = creditsText.offsetHeight;

        creditsText.style.top = areaHeight + 'px';
        void creditsText.offsetWidth;

        const endTop = -textHeight - 40;

        creditsText.classList.add('scrolling');
        creditsText.style.top = endTop + 'px';

        setTimeout(tryCloseWindow, 27500);
    }, 300);
}

function tryCloseWindow() {

    try {
        if (window.pywebview && window.pywebview.api && window.pywebview.api.close_app) {
            window.pywebview.api.close_app();
            return;
        }
    } catch (e) {}

    try {
        window.close();
    } catch (e) {}

    setTimeout(() => {

        const msg = document.createElement('div');
        msg.style.cssText = [
            'position:fixed', 'inset:0', 'background:#000',
            'display:flex', 'align-items:center', 'justify-content:center',
            'color:#fff', 'font-family:"Times New Roman",serif',
            'font-size:24px', 'letter-spacing:6px', 'text-align:center',
            'padding:40px', 'z-index:99999999'
        ].join(';');
        msg.textContent = 'You may now close this tab.';
        document.body.appendChild(msg);
    }, 400);
}

let game = null;
let isStarting = false;

function fillBar(duration) {
    return new Promise((resolve) => {
        const start = performance.now();
        function step() {
            const elapsed = performance.now() - start;
            const progress = Math.min(1, elapsed / duration);
            loadingBarFill.style.width = (progress * 100) + '%';
            if (progress < 1) requestAnimationFrame(step);
            else resolve();
        }
        requestAnimationFrame(step);
    });
}

async function startGame() {
    if (isStarting) return;
    isStarting = true;

    window.__stopMenuMusic();
    menuParallaxActive = false;

    menu.classList.add('hidden');
    logsPanel.classList.remove('open');

    loadingScreen.classList.add('active');
    loadingBarFill.style.width = '0%';

    let dotsFrame = 0;
    const dotsInterval = setInterval(() => {
        dotsFrame = (dotsFrame + 1) % 4;
        loadingDots.textContent = '.'.repeat(dotsFrame);
    }, 300);

    const gameInitPromise = new Promise((resolve) => {
        setTimeout(() => {
            gameOverlay.classList.add('active');
            if (!game) {
                game = new Game();
                game.init();
                window.__game = game;
            } else {
                game.restartLevels();
            }
            resolve();
        }, 400);
    });

    await fillBar(4000);
    await gameInitPromise;

    clearInterval(dotsInterval);
    loadingScreen.classList.remove('active');

    setTimeout(() => { isStarting = false; }, 500);
}

btnPlay.addEventListener('click', startGame);

btnSettings.addEventListener('click', () => {
    showToast('Settings — coming soon');
});

btnCredits.addEventListener('click', () => {
    showToast('Credits — see Exit or check the Logs panel');
});

btnExit.addEventListener('click', playCreditsAndExit);

(async function boot() {
    await playIntro();
    menu.classList.remove('hidden');
    menuParallaxActive = true;
    menuAudio.play().catch(() => {});
})();

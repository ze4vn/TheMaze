export class GameScreen {
    constructor() {
        this.timerEl = document.getElementById('timerContainer');
        this.sanityLetter = document.getElementById('sanityLetter');
        this.sanityCircle = document.getElementById('sanityCircle');
        this.staminaBar = document.getElementById('staminaBar');
        this.levelTitleContainer = document.getElementById('levelTitleContainer');
        this.levelTitleMain = document.getElementById('levelTitleMain');
        this.levelTitleSub = document.getElementById('levelTitleSub');
        this.deathOverlay = document.getElementById('deathOverlay');
        this.deathWhite = document.getElementById('deathWhiteFlash');
        this.deathBlack = document.getElementById('deathBlackFade');
        this.deathContent = document.getElementById('deathContent');
        this.deathTitle = document.getElementById('deathTitle');
        this.deathButtons = document.getElementById('deathButtons');
        this._titleTimeout = null;
    }

    formatTime(seconds) {
        const c = Math.max(0, seconds);
        const m = Math.floor(c / 60);
        const s = Math.floor(c % 60);
        const ms = Math.floor((c % 1) * 1000);
        return `${m}:${s}:${ms}`;
    }

    updateTimerUI(seconds) {
        this.timerEl.textContent = this.formatTime(seconds);
        this.timerEl.classList.remove('low-time', 'critical-time');
        if (seconds <= 0) this.timerEl.classList.add('critical-time');
        else if (seconds < 120) this.timerEl.classList.add('low-time');
    }

    getSanityLevel(v) {
        if (v > 83) return 'A';
        if (v > 66) return 'B';
        if (v > 50) return 'C';
        if (v > 33) return 'D';
        if (v > 16) return 'E';
        return 'F';
    }

    updateSanityUI(v) {
        const level = this.getSanityLevel(v);
        this.sanityLetter.textContent = level;
        this.sanityLetter.className = '';
        if (v <= 16) {
            this.sanityLetter.classList.add('level-below-f');
            this.sanityCircle.classList.add('danger');
        } else {
            this.sanityLetter.classList.add('level-' + level);
            this.sanityCircle.classList.remove('danger');
        }
    }

    updateStaminaUI(v, sanity) {
        const pct = Math.max(0, Math.min(100, (v / 160) * 100));
        this.staminaBar.style.width = pct + '%';
        this.staminaBar.classList.toggle('low', pct < 25);
        if (sanity < 30) this.staminaBar.classList.add('fight-or-flight');
        else this.staminaBar.classList.remove('fight-or-flight');
    }

    showLevelTitle(level, subtitle) {
        this.levelTitleMain.textContent = `Level ${level}`;
        this.levelTitleSub.textContent = subtitle || '';
        this.levelTitleContainer.classList.remove('visible');
        void this.levelTitleContainer.offsetWidth;
        this.levelTitleContainer.classList.add('visible');
        clearTimeout(this._titleTimeout);
        this._titleTimeout = setTimeout(() => this.levelTitleContainer.classList.remove('visible'), 3500);
    }

    showDeathOverlay() {
        const overlay = this.deathOverlay;
        const white = this.deathWhite;
        const black = this.deathBlack;
        const content = this.deathContent;
        const title = this.deathTitle;
        const buttons = this.deathButtons;

        overlay.classList.add('active');
        white.classList.remove('on', 'off');
        black.classList.remove('on');
        content.classList.remove('show');
        title.classList.remove('anim');
        buttons.classList.remove('visible');
        void overlay.offsetWidth;

        white.classList.add('on');
        setTimeout(() => {
            white.classList.remove('on');
            white.classList.add('off');
        }, 90);

        setTimeout(() => {
            black.classList.add('on');
        }, 180);

        setTimeout(() => {
            content.classList.add('show');
            title.classList.add('anim');
        }, 1100);

        setTimeout(() => {
            buttons.classList.add('visible');
        }, 2600);
    }

    hideDeathOverlay() {
        this.deathOverlay.classList.remove('active');
        this.deathWhite.classList.remove('on', 'off');
        this.deathBlack.classList.remove('on');
        this.deathContent.classList.remove('show');
        this.deathTitle.classList.remove('anim');
        this.deathButtons.classList.remove('visible');
    }
}

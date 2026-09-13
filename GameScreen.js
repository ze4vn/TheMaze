export class GameScreen {
    constructor(game) {
        this.game = game;
        this.timerEl = document.getElementById('timerContainer');
        this.sanityLetter = document.getElementById('sanityLetter');
        this.sanityCircle = document.getElementById('sanityCircle');
        this.staminaBar = document.getElementById('staminaBar');
        this.staminaContainer = document.getElementById('staminaContainer');
        this.levelTitleContainer = document.getElementById('levelTitleContainer');
        this.levelTitleMain = document.getElementById('levelTitleMain');
        this.levelTitleSub = document.getElementById('levelTitleSub');
        this.deathOverlay = document.getElementById('deathOverlay');
        this.deathRed = document.getElementById('deathRedOverlay');
        this.deathWhite = document.getElementById('deathWhiteFlash');
        this.deathContent = document.getElementById('deathContent');
        this.deathTitle = document.getElementById('deathTitle');
        this.deathSub = document.getElementById('deathSub');
        this.flashlightHint = document.getElementById('flashlightHint');
        this.winOverlay = document.getElementById('winOverlay');
        this._titleTimeout = null;
    }

    formatTime(seconds) {
        const clamped = Math.max(0, seconds);
        const mins = Math.floor(clamped / 60);
        const secs = Math.floor(clamped % 60);
        const ms = Math.floor((clamped % 1) * 1000);
        return `${mins}:${secs}:${ms}`;
    }

    updateTimerUI(seconds) {
        this.timerEl.textContent = this.formatTime(seconds);
        this.timerEl.classList.remove('low-time', 'critical-time');
        if (seconds <= 0) this.timerEl.classList.add('critical-time');
        else if (seconds < 60) this.timerEl.classList.add('low-time');
    }

    getSanityLevel(value) {
        if (value > 83) return 'A';
        if (value > 66) return 'B';
        if (value > 50) return 'C';
        if (value > 33) return 'D';
        if (value > 16) return 'E';
        return 'F';
    }

    updateSanityUI(value) {
        const level = this.getSanityLevel(value);
        this.sanityLetter.textContent = level;
        this.sanityLetter.className = '';
        if (value < 10) {
            this.sanityLetter.classList.add('level-below-f');
            this.sanityCircle.classList.add('danger');
        } else {
            this.sanityLetter.classList.add('level-' + level);
            this.sanityCircle.classList.remove('danger');
        }
    }

    updateStaminaUI(value) {
        const pct = Math.max(0, Math.min(100, (value / 160) * 100));
        this.staminaBar.style.width = pct + '%';
        this.staminaBar.classList.toggle('low', pct < 25);
        if (this.game && this.game.sanity < 30) this.staminaBar.classList.add('fight-or-flight');
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

    showDeathOverlay(cause) {
        this.deathOverlay.classList.add('active');
        if (cause === 'time') {
            this.deathTitle.textContent = 'Time\'s Up.';
            this.deathSub.textContent = 'You ran out of time.';
        } else {
            this.deathTitle.textContent = 'You Have Died.';
            this.deathSub.textContent = 'Your sanity crumbled.';
        }
        setTimeout(() => this.deathRed.classList.add('show'), 50);
        setTimeout(() => {
            this.deathWhite.classList.add('flash');
            setTimeout(() => this.deathWhite.classList.remove('flash'), 150);
        }, 400);
        setTimeout(() => this.deathContent.classList.add('show'), 800);
    }

    hideDeathOverlay() {
        this.deathOverlay.classList.remove('active');
        this.deathRed.classList.remove('show');
        this.deathContent.classList.remove('show');
    }

    showFlashlightHint(show) {
        this.flashlightHint.classList.toggle('visible', show);
    }

    showWinOverlay() {
        this.winOverlay.classList.add('active');
    }
}

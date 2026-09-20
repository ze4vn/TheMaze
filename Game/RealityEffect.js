export class RealityEffect {
    constructor() {
        this.overlay = document.getElementById('realityOverlay');
        this.canvas = document.getElementById('staticCanvas');
        this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
        if (this.canvas) {
            this.canvas.width = 320;
            this.canvas.height = 180;
        }
        this.marksContainer = document.getElementById('questionMarks');
        this.marks = [];
        this.staticAccum = 0;
        this.markAccum = 0;
        this.active = false;
    }

    activate() {
        if (this.active) return;
        this.active = true;
        if (this.overlay) this.overlay.classList.add('active');
        this._drawStatic();
        this._reseedMarks();
    }

    deactivate() {
        if (!this.active) return;
        this.active = false;
        if (this.overlay) this.overlay.classList.remove('active');
        for (const m of this.marks) m.remove();
        this.marks = [];
    }

    update(dt) {
        if (!this.active) return;

        this.staticAccum += dt;
        if (this.staticAccum > 0.28) {
            this.staticAccum = 0;
            this._drawStatic();
        }

        this.markAccum += dt;
        if (this.markAccum > 0.55) {
            this.markAccum = 0;
            this._reseedMarks();
        }
    }

    _drawStatic() {
        if (!this.ctx) return;
        const w = this.canvas.width;
        const h = this.canvas.height;
        const img = this.ctx.createImageData(w, h);
        const d = img.data;
        for (let i = 0; i < d.length; i += 4) {
            const v = Math.random() * 255;
            d[i]     = v;
            d[i + 1] = v;
            d[i + 2] = v;
            d[i + 3] = 28;
        }
        this.ctx.putImageData(img, 0, 0);
    }

    _reseedMarks() {
        if (!this.marksContainer) return;
        for (const m of this.marks) m.remove();
        this.marks = [];

        const count = Math.random() < 0.55 ? 0 : 1;
        for (let i = 0; i < count; i++) {
            const span = document.createElement('span');
            span.className = 'qmark';
            span.textContent = '?';
            span.style.left = (Math.random() * 90) + '%';
            span.style.top  = (Math.random() * 90) + '%';
            span.style.fontSize = (14 + Math.random() * 14) + 'px';
            span.style.opacity = (0.20 + Math.random() * 0.25).toFixed(2);
            this.marksContainer.appendChild(span);
            this.marks.push(span);
        }
    }
}

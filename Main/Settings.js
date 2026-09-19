
class SettingsManager {
    constructor() {
        this.fov = 84;
        this.sensitivity = 1.0;
        this._listeners = [];
        this.load();
    }

    load() {
        try {
            const raw = localStorage.getItem('themaze_settings');
            if (!raw) return;
            const s = JSON.parse(raw);
            if (typeof s.fov === 'number' && s.fov >= 60 && s.fov <= 120) this.fov = s.fov;
            if (typeof s.sensitivity === 'number' && s.sensitivity >= 0.2 && s.sensitivity <= 3) {
                this.sensitivity = s.sensitivity;
            }
        } catch (e) {
            console.warn('[Settings] load failed:', e);
        }
    }

    save() {
        try {
            localStorage.setItem('themaze_settings', JSON.stringify({
                fov: this.fov,
                sensitivity: this.sensitivity
            }));
        } catch (e) {
            console.warn('[Settings] save failed:', e);
        }
    }

    setFov(v) {
        this.fov = Math.max(60, Math.min(120, v));
        this.save();
        this._emit();
    }

    setSensitivity(v) {
        this.sensitivity = Math.max(0.2, Math.min(3, v));
        this.save();
        this._emit();
    }

    onChange(fn) { this._listeners.push(fn); }
    _emit() { for (const fn of this._listeners) fn(this); }
}

export const Settings = new SettingsManager();

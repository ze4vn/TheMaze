import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { GameScreen } from './GameScreen.js';
import { generateMap2 } from './GameMap2.js';
import { generateMap3 } from './GameMap3.js';
import { generateMap4 } from './GameMap4.js';
import { generateMapObj } from './GameMapObj.js';
import { generateRealityMap } from './GameMapReality.js';
import { Entity } from './Entity/Entity.js';
import { GamePlayer } from './GamePlayer.js';
import { RealityEffect } from './RealityEffect.js';
import { Settings } from '../Main/Settings.js';

const MAZE_SIZE = 16;
const wallHeight = 3.6;
const tileSize = 2.8;
const START_TIME = 300;

const ENTITY_LIGHT_FLASH_RADIUS = 10;
const ENTITY_LIGHT_TOGGLE_MIN = 0.05;
const ENTITY_LIGHT_TOGGLE_MAX = 0.22;

class SoundManager {
    constructor() {
        this.sounds = {
            map1: new Audio('../Audio/Map1_Ambiance.mp3'),
            map2: new Audio('../Audio/Map2_Ambiance.mp3'),
            map3: new Audio('../Audio/Map3_Ambiance.mp3'),
            map4: new Audio('../Audio/Map4_Ambiance.mp3'),
            bloodage: new Audio('../Audio/Bloodage.mp3'),
            death: new Audio('../Audio/Death.mp3'),
            entity: new Audio('../Audio/Entity.mp3'),
            reality: new Audio('../Audio/ReOfReality.mp3'),
            flashlight: new Audio('../Audio/FlashLight.mp3')
        };
        for (const k in this.sounds) this.sounds[k].loop = true;
        this.sounds.map1.volume = 0.4;
        this.sounds.map2.volume = 0.4;
        this.sounds.map3.volume = 0.4;
        this.sounds.map4.volume = 0.4;
        this.sounds.bloodage.volume = 0.55;
        this.sounds.death.loop = false;
        this.sounds.death.volume = 0.85;
        this.sounds.entity.volume = 0.0;
        this.sounds.reality.volume = 0.55;
        this.sounds.flashlight.loop = false;
        this.sounds.flashlight.volume = 0.7;
    }
    play(name) {
        const s = this.sounds[name];
        if (!s) return;
        try { s.currentTime = 0; s.play().catch(() => {}); } catch (e) {}
    }
    loop(name, on) {
        const s = this.sounds[name];
        if (!s) return;
        if (on) { if (s.paused) s.play().catch(() => {}); }
        else { if (!s.paused) s.pause(); }
    }
    stop(name) {
        const s = this.sounds[name];
        if (!s) return;
        try { s.pause(); s.currentTime = 0; } catch (e) {}
    }
    stopAll() {
        for (const k in this.sounds) this.stop(k);
    }
    setVolume(name, v) {
        const s = this.sounds[name];
        if (s) s.volume = Math.max(0, Math.min(1, v));
    }
    playJumpLand() {
        const playOne = (delayMs, vol) => {
            setTimeout(() => {
                const a = new Audio('../Audio/JumpLand.mp3');
                a.volume = vol;
                a.play().catch(() => {});
            }, delayMs);
        };
        playOne(0,    1.00);
        playOne(180,  0.55);
        playOne(380,  0.32);
        playOne(610,  0.18);
        playOne(870,  0.10);
        playOne(1160, 0.05);
    }
}

export class Game {
    constructor() {
        this.scene = null;
        this.renderer = null;
        this.composer = null;
        this.realismPass = null;

        this.currentLevel = 0;
        this.mazeGroup = null;
        this.mazeData = null;
        this.exitX = 0; this.exitZ = 0;
        this.spawnX = 0; this.spawnZ = 0;
        this.teleporterPos = { x: 0, z: 0 };
        this.entitySpawnOverride = null;
        this.gameRunning = true;
        this.isTransitioning = false;
        this.currentSize = MAZE_SIZE;
        this.currentHalf = (MAZE_SIZE - 1) / 2;

        this.gameTime = START_TIME;

        this.isLocked = false;
        this.isPaused = false;
        this.settingsReturnTo = 'pause';

        this.wallMeshes = [];
        this.wallShiftSeed = 0;
        this.lightSources = [];
        this.flickerLights = [];
        this.waterReflector = null;
        this.totalSize = 0;

        this.collisionMeshes = null;
        this.useMeshCollision = false;

        this.entity = null;

        this.sound = new SoundManager();
        this._bloodageActive = false;

        this.consoleEl = null;
        this.consoleInput = null;
        this.consoleOpen = false;

        this._brightMode = false;
        this._ambientLight = null;
        this._hemiLight = null;

        this._spawnProtectionTimer = 0;

        this._spawnCheckPoint = new THREE.Vector3(0, 0, 0);
        this._playerHasLeftSpawn = false;
        this._MIN_MOVE_BEFORE_EXIT = 5.0;

        this.realityEffect = new RealityEffect();

        this.container = document.getElementById('threeContainer');
        this.screen = new GameScreen();
        this.stopped = false;
        this.prevTime = 0;
        this.animationId = null;

        this.player = new GamePlayer(this);

        this.camera = null;
        this.cameraGroup = null;

        this.animate = this.animate.bind(this);
        this.resize = this.resize.bind(this);
        this.onKeyDown = this.onKeyDown.bind(this);
        this.onKeyUp = this.onKeyUp.bind(this);
        this.onMouseMove = this.onMouseMove.bind(this);
        this.onPointerLockChange = this.onPointerLockChange.bind(this);
        this.onClick = this.onClick.bind(this);
        this.onWheel = this.onWheel.bind(this);
    }

    init() {
        this.setupThree();
        this.player.setup(this.scene, this.cameraAspect());
        this.camera = this.player.camera;
        this.cameraGroup = this.player.cameraGroup;
        this.setupPostProcessing();
        this.setupInput();
        this.setupConsole();
        this.setupPauseMenu();
        this.generateLevel(0);

        this.screen.updateTimerUI(this.gameTime);
        this.screen.updateSanityUI(this.player.sanity);
        this.screen.updateStaminaUI(this.player.stamina, this.player.sanity);

        this.prevTime = performance.now();
        this.animate(this.prevTime);

        setTimeout(() => {
            if (!this.isLocked && !this.stopped && !this.consoleOpen && !this.isPaused) {
                try { this.renderer.domElement.requestPointerLock(); } catch (e) {}
            }
        }, 600);
    }

    cameraAspect() {
        return this.container.clientWidth / this.container.clientHeight;
    }

    setupThree() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x040406);
        this.scene.fog = new THREE.FogExp2(0x040406, 0.012);

        this._ambientLight = new THREE.AmbientLight(0x0a0a0e, 0.22);
        this._hemiLight = new THREE.HemisphereLight(0x1a1a22, 0x08080a, 0.15);
        this.scene.add(this._ambientLight);
        this.scene.add(this._hemiLight);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.container.appendChild(this.renderer.domElement);

        window.addEventListener('resize', this.resize);
    }

    resize() {
        const w = this.container.clientWidth, h = this.container.clientHeight;
        if (this.player && this.player.camera) {
            this.player.camera.aspect = w / h;
            this.player.camera.updateProjectionMatrix();
        }
        this.renderer.setSize(w, h);
        if (this.composer) this.composer.setSize(w, h);
    }

    setupPostProcessing() {
        const composer = new EffectComposer(this.renderer);
        composer.addPass(new RenderPass(this.scene, this.player.camera));

        const realismShader = {
            uniforms: {
                tDiffuse: { value: null }, time: { value: 0 },
                movementX: { value: 0 }, movementY: { value: 0 },
                distortion: { value: 0.15 }, aberration: { value: 0.025 },
                vignetteStrength: { value: 0.75 }, blurAmount: { value: 0.015 },
                fovScale: { value: 1.0 }, staminaVignette: { value: 0.0 },
                lensDirt: { value: 0.0 }, sanityGlitch: { value: 0.0 },
                sanityDarkness: { value: 0.0 }, redTint: { value: 0.0 },
                motionBlurX: { value: 0.0 }, motionBlurY: { value: 0.0 },
                mazeShift: { value: 0.0 }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
            `,
            fragmentShader: `
                uniform sampler2D tDiffuse;
                uniform float time, movementX, movementY, distortion, aberration;
                uniform float vignetteStrength, blurAmount, fovScale, staminaVignette;
                uniform float lensDirt, sanityGlitch, sanityDarkness, redTint;
                uniform float motionBlurX, motionBlurY, mazeShift;
                varying vec2 vUv;
                float random(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
                vec4 blur(sampler2D tex, vec2 uv, vec2 dir, float radius) {
                    vec4 sum = vec4(0.0); float total = 0.0;
                    for (float i = -6.0; i <= 6.0; i += 1.0) {
                        float w = exp(-(i * i) / 10.0);
                        vec2 offset = dir * radius * (i / 5.0);
                        sum += texture2D(tex, uv + offset) * w; total += w;
                    }
                    return sum / total;
                }
                void main() {
                    vec2 uv = vUv; vec2 center = vec2(0.5, 0.5);
                    vec2 offset = vec2(movementX * 0.04, movementY * 0.04);
                    float motionAmount = length(vec2(motionBlurX, motionBlurY)) * 0.04;
                    vec2 motionDir = normalize(vec2(motionBlurX, motionBlurY) + 0.001);
                    float motionStrength = clamp(motionAmount, 0.0, 0.06);
                    float glitchAmount = sanityGlitch * 0.06;
                    vec2 glitchOffset = vec2(
                        random(vec2(floor(time * 12.0), 0.0)) * glitchAmount * 2.0 - glitchAmount,
                        random(vec2(0.0, floor(time * 12.0))) * glitchAmount * 2.0 - glitchAmount
                    );
                    vec2 shiftedUv = uv + offset + glitchOffset;
                    float shiftAmount = mazeShift * 0.03;
                    shiftedUv += vec2(
                        sin(time * 0.05 + shiftedUv.y * 3.0) * shiftAmount,
                        cos(time * 0.04 + shiftedUv.x * 3.0) * shiftAmount
                    );
                    vec2 fovDir = shiftedUv - center;
                    shiftedUv = center + fovDir * fovScale;
                    vec2 dir = shiftedUv - center;
                    float dist = length(dir);
                    vec2 distortedUv = clamp(center + dir * (1.0 + (distortion + sanityGlitch * 0.2) * dist * dist), 0.0, 1.0);
                    float edgeFactor = smoothstep(0.2, 0.92, dist);
                    float abAmount = edgeFactor * (aberration + sanityGlitch * 0.04) * 2.5;
                    vec2 rUv = clamp(distortedUv + dir * abAmount * 1.5, 0.0, 1.0);
                    vec2 bUv = clamp(distortedUv - dir * abAmount * 1.3, 0.0, 1.0);
                    vec4 rColor = blur(tDiffuse, rUv, dir, (blurAmount + sanityGlitch * 0.02) * edgeFactor * 0.8);
                    vec4 gColor = blur(tDiffuse, distortedUv, dir, (blurAmount + sanityGlitch * 0.02) * edgeFactor * 0.8);
                    vec4 bColor = blur(tDiffuse, bUv, dir, (blurAmount + sanityGlitch * 0.02) * edgeFactor * 0.8);
                    vec3 color = vec3(rColor.r, gColor.g, bColor.b);
                    float red = clamp(redTint, 0.0, 0.6);
                    color.r += red * 0.3;
                    color.g *= (1.0 - red * 0.25);
                    color.b *= (1.0 - red * 0.35);
                    color += vec3(red * 0.05, 0.0, 0.0);
                    float vignette = 1.0 - smoothstep(0.1, 0.85 - sanityDarkness * 0.08, dist) * (vignetteStrength + sanityDarkness * 0.2);
                    vignette *= 1.0 - staminaVignette * 0.2;
                    color += vec3(0.06 + redTint * 0.1, 0.01, 0.08 + redTint * 0.05) * smoothstep(0.6, 0.95, dist) * 0.5;
                    color *= vignette;
                    if (motionStrength > 0.001) {
                        vec4 mbColor = vec4(0.0);
                        float mt = 0.0;
                        for (float i = -6.0; i <= 6.0; i += 1.0) {
                            float w = exp(-(i * i) / 8.0);
                            vec2 sampleUv = uv + motionDir * (i / 5.0) * motionStrength * 0.6;
                            mbColor += texture2D(tDiffuse, sampleUv) * w;
                            mt += w;
                        }
                        mbColor /= mt;
                        color = mix(color, mbColor.rgb, clamp(motionAmount * 4.0, 0.0, 0.7));
                    }
                    color = pow(color, vec3(0.94));
                    gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
                }
            `
        };
        this.realismPass = new ShaderPass(realismShader);
        composer.addPass(this.realismPass);
        composer.addPass(new UnrealBloomPass(
            new THREE.Vector2(this.container.clientWidth, this.container.clientHeight),
            0.18, 0.20, 0.42
        ));
        composer.addPass(new OutputPass());
        this.composer = composer;
    }

    setupInput() {
        document.addEventListener('keydown', this.onKeyDown);
        document.addEventListener('keyup', this.onKeyUp);
        document.addEventListener('mousemove', this.onMouseMove);
        document.addEventListener('pointerlockchange', this.onPointerLockChange);
        this.renderer.domElement.addEventListener('click', this.onClick);
        this.renderer.domElement.addEventListener('wheel', this.onWheel, { passive: false });

        document.getElementById('btnRespawn').addEventListener('click', () => this.respawn());
        document.getElementById('btnMainMenu').addEventListener('click', () => this.goToMainMenu());
        document.getElementById('btnRestartLevels').addEventListener('click', () => this.restartLevels());
        document.getElementById('winContinue').addEventListener('click', () => this.goToMainMenu());
    }

    setupPauseMenu() {
        document.getElementById('btnResume').addEventListener('click', () => this.resume());
        document.getElementById('btnPauseRespawn').addEventListener('click', () => {
            this.resume();
            this.restartLevels();
        });
        document.getElementById('btnPauseSettings').addEventListener('click', () => {
            this.settingsReturnTo = 'pause';
            this.openSettings();
        });
        document.getElementById('btnPauseMainMenu').addEventListener('click', () => {
            this.resume();
            this.goToMainMenu();
        });

        document.getElementById('btnSettingsClose').addEventListener('click', () => {
            this.closeSettings();
        });

        const fovSlider = document.getElementById('fovSlider');
        const fovValue = document.getElementById('fovValue');
        const sensSlider = document.getElementById('sensSlider');
        const sensValue = document.getElementById('sensValue');

        fovSlider.value = Settings.fov;
        fovValue.textContent = Settings.fov;
        sensSlider.value = Settings.sensitivity;
        sensValue.textContent = Settings.sensitivity.toFixed(2);

        fovSlider.addEventListener('input', (e) => {
            const v = parseInt(e.target.value, 10);
            fovValue.textContent = v;
            Settings.setFov(v);
            if (this.player && this.player.camera) {
                this.player.camera.fov = v;
                this.player.camera.updateProjectionMatrix();
            }
        });
        sensSlider.addEventListener('input', (e) => {
            const v = parseFloat(e.target.value);
            sensValue.textContent = v.toFixed(2);
            Settings.setSensitivity(v);
        });

        window.__refreshSettingsUI = () => {
            fovSlider.value = Settings.fov;
            fovValue.textContent = Settings.fov;
            sensSlider.value = Settings.sensitivity;
            sensValue.textContent = Settings.sensitivity.toFixed(2);
        };
    }

    openSettings() {
        window.__refreshSettingsUI && window.__refreshSettingsUI();
        const settings = document.getElementById('settingsMenu');
        settings.classList.add('active');
        void settings.offsetWidth;
        settings.classList.add('visible');
    }

    closeSettings() {
        const settings = document.getElementById('settingsMenu');
        settings.classList.remove('visible');
        setTimeout(() => {
            settings.classList.remove('active');
        }, 320);
    }

    setupConsole() {
        this.consoleEl = document.getElementById('devConsole');
        this.consoleInput = document.getElementById('consoleInput');
        this.consoleInput.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Enter') {
                const cmd = this.consoleInput.value.trim();
                this.consoleInput.value = '';
                this.executeConsoleCommand(cmd);
            } else if (e.key === 'Escape') {
                this.closeConsole();
            }
        });
    }

    toggleConsole() {
        if (this.isPaused) return;
        if (this.consoleOpen) this.closeConsole(); else this.openConsole();
    }

    openConsole() {
        if (this.consoleOpen) return;
        this.consoleOpen = true;
        this.consoleEl.classList.add('active');
        if (document.pointerLockElement) document.exitPointerLock();
        setTimeout(() => { this.consoleInput.focus(); this.consoleInput.select(); }, 30);
    }

    closeConsole() {
        if (!this.consoleOpen) return;
        this.consoleOpen = false;
        this.consoleEl.classList.remove('active');
        this.consoleInput.blur();
        if (!this.player.isDead && !this.isTransitioning && !this.player.gameWon && !this.isPaused) {
            setTimeout(() => { try { this.renderer.domElement.requestPointerLock(); } catch (e) {} }, 80);
        }
    }

    executeConsoleCommand(cmd) {
        if (!cmd) return;
        const lower = cmd.toLowerCase();

        const levelMatch = cmd.match(/^!Level\.(\d+)$/i);
        if (levelMatch) {
            const levelNum = parseInt(levelMatch[1], 10);
            if (levelNum < 0 || levelNum > 4) {
                console.log(`[console] Level ${levelNum} not implemented. (use 0-4)`);
                return;
            }
            this.closeConsole();
            this.teleportToLevel(levelNum);
            return;
        }

        if (lower === '!immortal') {
            this.player.invincible = !this.player.invincible;
            if (!this.player.invincible && this.player.sanity <= 0) this.player.sanity = 100;
            console.log(`[console] Immortal: ${this.player.invincible ? 'ON' : 'OFF'}`);
            return;
        }

        if (lower === '!clearnight') {
            this.toggleBrightMode();
            console.log(`[console] ClearNight (bright mode): ${this._brightMode ? 'ON' : 'OFF'}`);
            return;
        }

        if (lower === '!fly') {
            this.player.flyMode = !this.player.flyMode;
            this.player.velocity.set(0, 0, 0);
            this.player.keys = {};
            console.log(`[console] Fly: ${this.player.flyMode ? 'ON' : 'OFF'}`);
            return;
        }

        if (lower === '!help' || lower === '!commands') {
            console.log('[console] Commands:');
            console.log('  !Level.0  — The Beginning   (OBJ map)');
            console.log('  !Level.1  — The Woodland');
            console.log('  !Level.2  — The Null Sewers');
            console.log('  !Level.3  — The Labratory');
            console.log('  !Level.4  — Questionable Reality');
            console.log('  !Immortal     — toggle invincibility');
            console.log('  !ClearNight   — toggle bright mode');
            console.log('  !Fly          — toggle free-fly (no clip)');
            console.log('  !Help         — this list');
            return;
        }

        console.log(`[console] Unknown command: ${cmd}  (try !help)`);
    }

    toggleBrightMode() {
        this.setBrightMode(!this._brightMode);
    }

    setBrightMode(on) {
        this._brightMode = !!on;
        if (!this._ambientLight || !this._hemiLight) return;

        if (this._brightMode) {
            this._ambientLight.intensity = 1.6;
            this._ambientLight.color.setHex(0xffffff);
            this._hemiLight.intensity = 1.2;
            this._hemiLight.color.setHex(0xffffff);
            this._hemiLight.groundColor.setHex(0x999999);
            this.scene.background = new THREE.Color(0x222428);
            this.scene.fog = new THREE.FogExp2(0x222428, 0.006);
        } else {
            this._ambientLight.intensity = 0.22;
            this._ambientLight.color.setHex(0x0a0a0e);
            this._hemiLight.intensity = 0.15;
            this._hemiLight.color.setHex(0x1a1a22);
            this._hemiLight.groundColor.setHex(0x08080a);
            this.scene.background = new THREE.Color(0x040406);
            this.scene.fog = new THREE.FogExp2(0x040406, 0.012);
        }
    }

    teleportToLevel(internalLevel) {
        this.screen.hideDeathOverlay();
        document.getElementById('winOverlay').classList.remove('active');
        this.currentLevel = internalLevel;
        this.generateLevel(internalLevel);
        this.gameTime = START_TIME;
        this.screen.updateTimerUI(this.gameTime);
    }

    onKeyDown(e) {
        if (e.key === 'Escape') {
            if (this.player.isDead || this.player.gameWon || this.isTransitioning) return;
            if (document.getElementById('settingsMenu').classList.contains('active')) {
                this.closeSettings();
                return;
            }
            if (this.isPaused) {
                this.resume();
            } else if (this.isLocked || this.gameRunning) {
                this.pause();
            }
            return;
        }

        if (e.key === '`' || e.key === '~') { e.preventDefault(); this.toggleConsole(); return; }
        if (this.consoleOpen || this.isPaused) return;

        this.player.onKeyDown(e, this.consoleOpen);
        if (e.key === 'i' || e.key === 'I') {
            const p = document.getElementById('infoPanel');
            p.style.display = p.style.display === 'block' ? 'none' : 'block';
        }
    }

    onKeyUp(e) {
        if (this.consoleOpen || this.isPaused) return;
        this.player.onKeyUp(e, this.consoleOpen);
    }

    onMouseMove(e) {
        this.player.handleMouseMove(e, this.isLocked, this.isTransitioning, this.consoleOpen);
    }

    onWheel(e) {
        e.preventDefault();
        this.player.handleWheel(e.deltaY, this.isLocked, this.player.isDead, this.isTransitioning, this.consoleOpen);
    }

    onPointerLockChange() {
        const wasLocked = this.isLocked;
        this.isLocked = document.pointerLockElement === this.renderer.domElement;

        if (wasLocked && !this.isLocked &&
            !this.player.isDead && !this.player.gameWon &&
            !this.isTransitioning && this.gameRunning &&
            !this.consoleOpen && !this.isPaused &&
            !document.getElementById('settingsMenu').classList.contains('active')) {
            this.pause();
        }
    }

    onClick() {
        if (this.consoleOpen || this.isPaused) return;
        if (this.player.gameWon) return;
        if (this.isLocked) {
            this.player.toggleFlashlight();
            this.sound.play('flashlight');
        } else if (!this.isTransitioning && !this.player.isDead) {
            try { this.renderer.domElement.requestPointerLock(); } catch (e) {}
        }
    }

    pause() {
        if (this.isPaused) return;
        if (this.player.isDead || this.player.gameWon || this.isTransitioning) return;
        this.isPaused = true;

        if (document.pointerLockElement) document.exitPointerLock();

        const menu = document.getElementById('pauseMenu');
        menu.classList.add('active');
        void menu.offsetWidth;
        menu.classList.add('visible');

        this.sound.loop('map1', false);
        this.sound.loop('map2', false);
        this.sound.loop('map3', false);
        this.sound.loop('map4', false);
        this.sound.loop('reality', false);
        this.sound.loop('bloodage', false);
        this.sound.loop('entity', false);
    }

    resume() {
        if (!this.isPaused) return;
        this.isPaused = false;

        const menu = document.getElementById('pauseMenu');
        menu.classList.remove('visible');
        setTimeout(() => menu.classList.remove('active'), 320);

        this.player.keys = {};
        this.player.isSprinting = false;

        const lvl = this.currentLevel;
        this.sound.loop('map1', lvl === 0);
        this.sound.loop('map2', lvl === 1);
        this.sound.loop('map3', lvl === 2);
        this.sound.loop('map4', lvl === 3);
        this.sound.loop('reality', lvl === 4);
        if (this._bloodageActive) this.sound.loop('bloodage', true);

        try { this.renderer.domElement.requestPointerLock(); } catch (e) {}
    }

    generateLevel(level, startAmbiance = true) {
        console.log('[Game] generateLevel called with level =', level);

        if (this.mazeGroup) { this.scene.remove(this.mazeGroup); this.mazeGroup = null; }
        this.waterReflector = null;
        this.totalSize = 0;
        this.collisionMeshes = null;
        this.useMeshCollision = false;

        let result;
        if (level === 0)      result = generateMapObj(this.scene, MAZE_SIZE, wallHeight, tileSize);
        else if (level === 1) result = generateMap2(this.scene, MAZE_SIZE, wallHeight, tileSize);
        else if (level === 2) result = generateMap3(this.scene, MAZE_SIZE, wallHeight, tileSize);
        else if (level === 3) result = generateMap4(this.scene, MAZE_SIZE, wallHeight, tileSize);
        else if (level === 4) result = generateRealityMap(this.scene, MAZE_SIZE, wallHeight, tileSize);
        else                  result = generateMapObj(this.scene, MAZE_SIZE, wallHeight, tileSize);

        this.mazeGroup = result.group;
        this.mazeData = result.data;
        this.spawnX = result.spawnPos.x;
        this.spawnZ = result.spawnPos.z;
        this.exitX = result.exitPos.x;
        this.exitZ = result.exitPos.z;
        this.teleporterPos = { x: this.exitX, z: this.exitZ };
        this.entitySpawnOverride = result.entitySpawnPos || null;
        this.lightSources = result.lightSources || [];
        this.flickerLights = result.flickerLights || [];
        this.wallMeshes = result.wallMeshes || [];
        this.waterReflector = result.waterReflector || null;
        this.totalSize = result.totalSize || (MAZE_SIZE * tileSize);
        this.collisionMeshes = result.collisionMeshes || null;
        this.useMeshCollision = result.useMeshCollision === true;
        this.wallShiftSeed = Math.random() * 1000;
        this.gameTime = START_TIME;

        console.log('[Game] Level', level, '— spawn:[' + this.spawnX.toFixed(1) + ',' + this.spawnZ.toFixed(1) + '] exit:[' + this.exitX.toFixed(1) + ',' + this.exitZ.toFixed(1) + ']');

        for (const fl of this.flickerLights) {
            if (fl.bulb && fl.bulb.material) {
                fl.bulb.material = fl.bulb.material.clone();
                fl.bulb.userData.baseEmissive = fl.bulb.material.emissiveIntensity || 1;
            }
            fl.entityFlashOn = true;
            fl.entityFlashActive = false;
        }

        this.player.spawnAt(this.spawnX, this.spawnZ);
        this._ensurePlayerNotStuck();

        this.screen.updateTimerUI(this.gameTime);
        this.screen.updateSanityUI(this.player.sanity);
        this.screen.updateStaminaUI(this.player.stamina, this.player.sanity);

        if (level === 0)      this.screen.showLevelTitle(0, 'The Beginning');
        else if (level === 1) this.screen.showLevelTitle(1, 'The Woodland');
        else if (level === 2) this.screen.showLevelTitle(2, 'The Null Sewers');
        else if (level === 3) this.screen.showLevelTitle(3, 'The Labratory');
        else if (level === 4) this.screen.showLevelTitle(4, 'Questionable Reality');

        this.currentLevel = level;

        this.setBrightMode(level === 4);

        if (level === 4) this.realityEffect.activate();
        else this.realityEffect.deactivate();

        if (startAmbiance) {
            this.sound.loop('map1', level === 0);
            this.sound.loop('map2', level === 1);
            this.sound.loop('map3', level === 2);
            this.sound.loop('map4', level === 3);
            this.sound.loop('reality', level === 4);
        }

        const shouldHaveEntity = (level !== 4) && (result.hasEntity !== false);
        if (shouldHaveEntity) {
            this.spawnEntity();
        } else {
            if (this.entity) { this.entity.dispose(); this.entity = null; }
            this.sound.loop('entity', false);
        }

        this._spawnProtectionTimer = 5.0;
        this._spawnCheckPoint.set(this.spawnX, 0, this.spawnZ);
        this._playerHasLeftSpawn = false;
    }

    _ensurePlayerNotStuck() {
        if (!this.collisionMeshes || this.collisionMeshes.length === 0) return;

        const raycaster = new THREE.Raycaster();
        const dirs = [
            [1,0],[-1,0],[0,1],[0,-1],
            [0.707,0.707],[-0.707,0.707],[0.707,-0.707],[-0.707,-0.707]
        ];
        const heights = [0.25, 0.9, 1.45];
        const probe = 0.42;

        const isFree = (x, z) => {
            for (const [dx, dz] of dirs) {
                const dir = new THREE.Vector3(dx, 0, dz).normalize();
                for (const y of heights) {
                    raycaster.set(new THREE.Vector3(x, y, z), dir);
                    raycaster.far = probe;
                    const hits = raycaster.intersectObjects(this.collisionMeshes, true);
                    for (const h of hits) {
                        if (h.object.visible !== false) return false;
                    }
                }
            }
            return true;
        };

        const px = this.player.cameraGroup.position.x;
        const pz = this.player.cameraGroup.position.z;
        if (isFree(px, pz)) return;

        console.log('[Game] Spawn is inside geometry — searching for clear spot…');

        for (let r = 0.4; r < 12; r += 0.4) {
            for (let a = 0; a < 20; a++) {
                const angle = (a / 20) * Math.PI * 2;
                const tx = px + Math.cos(angle) * r;
                const tz = pz + Math.sin(angle) * r;
                if (isFree(tx, tz)) {
                    console.log('[Game] Relocated player to ' + tx.toFixed(2) + ',' + tz.toFixed(2));
                    this.player.cameraGroup.position.x = tx;
                    this.player.cameraGroup.position.z = tz;
                    this.spawnX = tx;
                    this.spawnZ = tz;
                    this._spawnCheckPoint.set(tx, 0, tz);
                    return;
                }
            }
        }
        console.warn('[Game] Could not find clear spawn — player may be stuck');
    }

    findEntitySpawnTile(playerTile, exitTile) {
        const size = this.currentSize;
        const data = this.mazeData;
        const dist = Array.from({ length: size }, () => Array(size).fill(Infinity));
        dist[playerTile.y][playerTile.x] = 0;
        const queue = [{ x: playerTile.x, y: playerTile.y }];
        let qi = 0;
        while (qi < queue.length) {
            const { x, y } = queue[qi++];
            const cell = data[y] && data[y][x];
            if (!cell) continue;
            const d0 = dist[y][x];
            const nbs = [];
            if (!cell.top && y > 0) nbs.push({ x, y: y - 1 });
            if (!cell.bottom && y < size - 1) nbs.push({ x, y: y + 1 });
            if (!cell.left && x > 0) nbs.push({ x: x - 1, y });
            if (!cell.right && x < size - 1) nbs.push({ x: x + 1, y });
            for (const d of nbs) {
                if (dist[d.y][d.x] > d0 + 1) { dist[d.y][d.x] = d0 + 1; queue.push(d); }
            }
        }
        let bestTile = null, bestScore = -1;
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                if (dist[y][x] === Infinity) continue;
                if (x === exitTile.x && y === exitTile.y) continue;
                if (x === playerTile.x && y === playerTile.y) continue;
                if (dist[y][x] > bestScore) { bestScore = dist[y][x]; bestTile = { x, y }; }
            }
        }
        return bestTile || { x: size - 1, y: size - 1 };
    }

    spawnEntity() {
        if (this.entity) { this.entity.dispose(); this.entity = null; }
        let spawnTile;

        if (this.entitySpawnOverride) {
            let tx = Math.round(this.entitySpawnOverride.x / tileSize + this.currentHalf);
            let ty = Math.round(this.entitySpawnOverride.z / tileSize + this.currentHalf);
            tx = Math.max(0, Math.min(this.currentSize - 1, tx));
            ty = Math.max(0, Math.min(this.currentSize - 1, ty));
            spawnTile = { x: tx, y: ty };
        } else {
            const playerTile = {
                x: Math.max(0, Math.min(this.currentSize - 1,
                    Math.round(this.spawnX / tileSize + this.currentHalf))),
                y: Math.max(0, Math.min(this.currentSize - 1,
                    Math.round(this.spawnZ / tileSize + this.currentHalf)))
            };
            const exitTile = {
                x: Math.max(0, Math.min(this.currentSize - 1,
                    Math.round(this.exitX / tileSize + this.currentHalf))),
                y: Math.max(0, Math.min(this.currentSize - 1,
                    Math.round(this.exitZ / tileSize + this.currentHalf)))
            };
            spawnTile = this.findEntitySpawnTile(playerTile, exitTile);
        }

        this.entity = new Entity(this.scene, this.mazeData, this.currentSize,
            this.currentHalf, tileSize, wallHeight, spawnTile);
        this.entity.onKill = () => this.triggerDeath('entity');

        this.entity.killEnabled = false;
        const entRef = this.entity;
        setTimeout(() => {
            if (this.entity === entRef) this.entity.killEnabled = true;
        }, 5000);
    }

    updateEntityLightFlicker(dt) {
        const entityNear = this.entity && this.entity.isActive && !this.player.isDead && !this.isTransitioning;
        for (const fl of this.flickerLights) {
            if (!fl.light) continue;
            let proximity = 0;
            if (entityNear) {
                const dx = this.entity.position.x - fl.light.position.x;
                const dz = this.entity.position.z - fl.light.position.z;
                const d = Math.hypot(dx, dz);
                if (d < ENTITY_LIGHT_FLASH_RADIUS) proximity = 1 - d / ENTITY_LIGHT_FLASH_RADIUS;
            }
            if (proximity > 0) {
                fl.entityFlashActive = true;
                const toggleChance = ENTITY_LIGHT_TOGGLE_MIN + (ENTITY_LIGHT_TOGGLE_MAX - ENTITY_LIGHT_TOGGLE_MIN) * proximity;
                if (Math.random() < toggleChance) fl.entityFlashOn = !fl.entityFlashOn;
                if (!fl.entityFlashOn) {
                    fl.light.intensity = 0;
                    if (fl.bulb && fl.bulb.material && fl.bulb.material.emissiveIntensity !== undefined)
                        fl.bulb.material.emissiveIntensity = 0.0;
                } else {
                    const boost = 1.0 + proximity * 0.9;
                    fl.light.intensity = fl.baseIntensity * boost;
                    if (fl.bulb && fl.bulb.material && fl.bulb.material.emissiveIntensity !== undefined) {
                        const base = fl.bulb.userData.baseEmissive ?? 0.8;
                        fl.bulb.material.emissiveIntensity = base * boost;
                    }
                }
            } else if (fl.entityFlashActive) {
                fl.entityFlashActive = false;
                fl.entityFlashOn = true;
            }
        }
    }

    triggerDeath(cause) {
        if (this.player.isDead) return;
        if (this.player.invincible || this.player.gameWon) return;

        if (this._spawnProtectionTimer > 0) {
            if (cause === 'entity') {
                if (this.entity) {
                    const dir = new THREE.Vector3(
                        this.entity.position.x - this.cameraGroup.position.x,
                        0,
                        this.entity.position.z - this.cameraGroup.position.z
                    );
                    if (dir.lengthSq() < 0.0001) dir.set(1, 0, 1);
                    dir.normalize();
                    this.entity.position.x = this.cameraGroup.position.x + dir.x * 15;
                    this.entity.position.z = this.cameraGroup.position.z + dir.z * 15;
                    this.entity.currentPath = [];
                    this.entity.pathIndex = 0;
                    this.entity.lastKnownPlayerTile = null;
                }
                return;
            }
            if (cause === 'sanity' || cause === 'time') {
                return;
            }
        }

        this.player.isDead = true;
        this.isLocked = false;
        if (document.pointerLockElement) document.exitPointerLock();

        this.sound.loop('map1', false);
        this.sound.loop('map2', false);
        this.sound.loop('map3', false);
        this.sound.loop('map4', false);
        this.sound.loop('reality', false);
        this.sound.loop('bloodage', false);
        this.sound.loop('entity', false);
        this._bloodageActive = false;
        this.sound.play('death');

        this.screen.showDeathOverlay();
    }

    triggerWin() {
        if (this.player.gameWon) return;
        this.player.gameWon = true;
        this.player.invincible = true;
        this.isLocked = false;
        if (document.pointerLockElement) document.exitPointerLock();

        if (this.entity) this.entity.isActive = false;

        this.sound.loop('map1', false);
        this.sound.loop('map2', false);
        this.sound.loop('map3', false);
        this.sound.loop('map4', false);
        this.sound.loop('reality', false);
        this.sound.loop('bloodage', false);
        this.sound.loop('entity', false);
        this._bloodageActive = false;

        this.realityEffect.deactivate();

        document.getElementById('winOverlay').classList.add('active');
    }

    respawn() {
        if (!this.player.isDead) return;
        this.player.isDead = false;
        this.player.gameWon = false;
        this.screen.hideDeathOverlay();
        document.getElementById('winOverlay').classList.remove('active');
        this.sound.stop('death');

        this.gameTime = START_TIME;
        this.screen.updateTimerUI(this.gameTime);
        this.player.spawnAt(this.spawnX, this.spawnZ);

        this.isLocked = true;
        try { this.renderer.domElement.requestPointerLock(); } catch (e) {}

        if (this.currentLevel !== 4) {
            this.spawnEntity();
        }
        this._spawnProtectionTimer = 5.0;
        this._spawnCheckPoint.set(this.spawnX, 0, this.spawnZ);
        this._playerHasLeftSpawn = false;

        this.sound.loop('map1', this.currentLevel === 0);
        this.sound.loop('map2', this.currentLevel === 1);
        this.sound.loop('map3', this.currentLevel === 2);
        this.sound.loop('map4', this.currentLevel === 3);
        this.sound.loop('reality', this.currentLevel === 4);
    }

    restartLevels() {
        this.screen.hideDeathOverlay();
        document.getElementById('winOverlay').classList.remove('active');
        this.sound.stop('death');
        this.player.gameWon = false;
        this.player.isDead = false;
        this.isPaused = false;
        document.getElementById('pauseMenu').classList.remove('active', 'visible');
        this.gameTime = START_TIME;
        this.currentLevel = 0;
        this.generateLevel(0);
        this.isLocked = true;
        try { this.renderer.domElement.requestPointerLock(); } catch (e) {}
        this.screen.updateTimerUI(this.gameTime);
        document.getElementById('levelTitleContainer').classList.remove('visible');
    }

    goToMainMenu() {
        this.sound.stopAll();
        this._bloodageActive = false;

        document.querySelectorAll('audio').forEach(a => {
            try { a.pause(); a.currentTime = 0; } catch (e) {}
        });

        this.screen.hideDeathOverlay();
        document.getElementById('winOverlay').classList.remove('active');
        document.getElementById('pauseMenu').classList.remove('active', 'visible');
        document.getElementById('settingsMenu').classList.remove('active', 'visible');

        if (document.pointerLockElement) document.exitPointerLock();
        this.isLocked = false;
        this.isPaused = false;

        this.realityEffect.deactivate();

        this.player.isDead = false;
        this.player.gameWon = false;
        this.player.keys = {};
        this.player.isSprinting = false;
        this.gameRunning = true;
        this.gameTime = START_TIME;
        this.currentLevel = 0;

        this.generateLevel(0, false);

        this.prevTime = performance.now();

        document.getElementById('mainMenu').classList.remove('hidden');
        window.__startMenuMusic && window.__startMenuMusic();
    }

    animate(time) {
        if (this.stopped) return;
        const dt = Math.min((time - this.prevTime) / 1000, 0.05);
        this.prevTime = time;

        if (this.isPaused) {
            this.composer.render();
            this.animationId = requestAnimationFrame(this.animate);
            return;
        }

        if (this.player.gameWon) {
            this.composer.render();
            this.animationId = requestAnimationFrame(this.animate);
            return;
        }

        if (this._spawnProtectionTimer > 0) {
            this._spawnProtectionTimer -= dt;
        }

        if (!this._playerHasLeftSpawn) {
            const distFromSpawn = Math.hypot(
                this.cameraGroup.position.x - this._spawnCheckPoint.x,
                this.cameraGroup.position.z - this._spawnCheckPoint.z
            );
            if (distFromSpawn > this._MIN_MOVE_BEFORE_EXIT) {
                this._playerHasLeftSpawn = true;
                console.log('[Game] Player has left spawn — exit is now armed');
            }
        }

        if (!this.player.isDead && this.gameRunning && !this.player.invincible) {
            this.gameTime -= dt;
            if (this.gameTime < 0) this.gameTime = 0;
            this.screen.updateTimerUI(this.gameTime);
            if (this.gameTime <= 0 && !this.player.isDead) this.triggerDeath('time');
        }

        if (!this.player.isDead) {
            const shouldPlay = (this.gameTime < 120 || this.player.sanity <= 16);
            if (shouldPlay && !this._bloodageActive) {
                this._bloodageActive = true;
                this.sound.loop('bloodage', true);
            } else if (!shouldPlay && this._bloodageActive) {
                this._bloodageActive = false;
                this.sound.loop('bloodage', false);
            }
        }

        this.player.update(dt, time);
        this.updateMazeShifting(time, dt);

        if (!this.isTransitioning && this.gameRunning && this.isLocked) this.checkTeleporter();

        if (this.entity && this.entity.isActive && !this.isTransitioning && !this.player.isDead) {
            this.entity.update(dt, this.cameraGroup.position, this.player.flashlightOn,
                this.player.playerJustJumped, this.player.sanity, this.gameTime);

            if (this._spawnProtectionTimer > 0) {
                const dxE = this.entity.position.x - this.cameraGroup.position.x;
                const dzE = this.entity.position.z - this.cameraGroup.position.z;
                const distE = Math.hypot(dxE, dzE);
                if (distE < 3.0) {
                    const nx = distE > 0.001 ? dxE / distE : 1;
                    const nz = distE > 0.001 ? dzE / distE : 0;
                    this.entity.position.x = this.cameraGroup.position.x + nx * 20;
                    this.entity.position.z = this.cameraGroup.position.z + nz * 20;
                    this.entity.currentPath = [];
                    this.entity.pathIndex = 0;
                    this.entity.lastKnownPlayerTile = null;
                }
            }
        }

        this.updateEntityLightFlicker(dt);

        if (this.entity && this.entity.isActive && !this.player.isDead) {
            const dx = this.cameraGroup.position.x - this.entity.position.x;
            const dz = this.cameraGroup.position.z - this.entity.position.z;
            const distE = Math.hypot(dx, dz);
            const maxHear = 20;
            if (distE < maxHear) {
                const vol = Math.pow(1 - distE / maxHear, 1.5) * 0.85;
                this.sound.setVolume('entity', vol);
                this.sound.loop('entity', true);
            } else {
                this.sound.loop('entity', false);
            }
        } else {
            this.sound.loop('entity', false);
        }

        if (this.player) {
            const shouldShow = !this.isTransitioning
                && !this.player.isDead
                && !this.player.gameWon
                && !this.isPaused;
            this.player.setViewmodelVisible(shouldShow);
        }

        this.realityEffect.update(dt);

        const p = document.getElementById('infoPanel');
        if (p.style.display === 'block') {
            const pos = this.cameraGroup.position;
            document.getElementById('infoContent').innerHTML =
                `<span class="label">Coordinates</span> > ${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}<br>` +
                `<span class="label">Time Remaining</span> > ${this.screen.formatTime(this.gameTime)}<br>` +
                `<span class="label">Sanity</span> > ${this.screen.getSanityLevel(this.player.sanity)} (${Math.round(this.player.sanity)}%)<br>` +
                `<span class="label">Flashlight Focus</span> > ${Math.round(this.player.flashlightZoom * 100)}%<br>` +
                `<span class="label">Dev</span> > ` +
                `${this.player.invincible ? 'IMMORTAL ' : ''}` +
                `${this._brightMode ? 'BRIGHT ' : ''}` +
                `${this.player.flyMode ? 'FLY' : ''}`;
        }

        this.composer.render();
        this.animationId = requestAnimationFrame(this.animate);
    }

    updateMazeShifting(time, dt) {
        const sanity = this.player.sanity;
        if (sanity > 30 || this.wallMeshes.length === 0) {
            for (const wall of this.wallMeshes) {
                if (wall.userData.shiftOffset) {
                    wall.userData.shiftOffset.lerp(new THREE.Vector3(0, 0, 0), 0.02);
                    wall.position.lerp(wall.userData.origPos.clone().add(wall.userData.shiftOffset), 0.05);
                }
            }
            if (this.realismPass) this.realismPass.uniforms.mazeShift.value += (0 - this.realismPass.uniforms.mazeShift.value) * 0.02;
            return;
        }
        const camPos = this.cameraGroup.position;
        const camDir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.player.camera.quaternion);
        const shiftAmount = (1 - sanity / 30) * 0.6;
        if (this.realismPass) this.realismPass.uniforms.mazeShift.value += (shiftAmount * 0.5 - this.realismPass.uniforms.mazeShift.value) * 0.02;
        for (const wall of this.wallMeshes) {
            const wallPos = wall.userData.origPos;
            const toWall = new THREE.Vector3().copy(wallPos).sub(camPos);
            const dist = toWall.length();
            toWall.normalize();
            const isLookingAt = toWall.dot(camDir) > 0.3 && dist < 6;
            if (!isLookingAt && dist < 12) {
                const seed = this.wallShiftSeed + wall.id;
                const angle = seed * 0.1 + time * 0.0003;
                const targetOffset = new THREE.Vector3(
                    Math.sin(angle + wall.id * 0.7) * shiftAmount * 0.5, 0,
                    Math.cos(angle * 0.7 + wall.id * 0.5) * shiftAmount * 0.5
                );
                wall.userData.shiftOffset.lerp(targetOffset, 0.015 + shiftAmount * 0.02);
                wall.position.lerp(wall.userData.origPos.clone().add(wall.userData.shiftOffset), 0.03 + shiftAmount * 0.04);
            } else {
                wall.userData.shiftOffset.lerp(new THREE.Vector3(0, 0, 0), 0.03);
                wall.position.lerp(wall.userData.origPos.clone().add(wall.userData.shiftOffset), 0.04);
            }
        }
    }

    checkTeleporter() {
        if (this.isTransitioning || this.player.isDead || this.player.gameWon) return;

        if (this._spawnProtectionTimer > 0) return;
        if (!this._playerHasLeftSpawn) return;

        const px = this.cameraGroup.position.x, pz = this.cameraGroup.position.z;
        const dist = Math.sqrt((px - this.teleporterPos.x) ** 2 + (pz - this.teleporterPos.z) ** 2);
        if (dist < 1.0) {
            if (this.currentLevel === 0) this.transitionToNextLevel(1);
            else if (this.currentLevel === 1) this.transitionToNextLevel(2);
            else if (this.currentLevel === 2) this.transitionToNextLevel(3);
            else if (this.currentLevel === 3) this.transitionToNextLevel(4);
            else if (this.currentLevel === 4) this.triggerWin();
        }
    }

    async transitionToNextLevel(nextLevel) {
        this.isTransitioning = true;
        const white = document.getElementById('whiteFlash');
        white.style.opacity = '1';
        await this.sleep(250);
        white.style.opacity = '0';
        this.currentLevel = nextLevel;
        this.generateLevel(nextLevel);
        if (nextLevel === 1) setTimeout(() => this.screen.showLevelTitle(1, 'The Woodland'), 300);
        else if (nextLevel === 2) setTimeout(() => this.screen.showLevelTitle(2, 'The Null Sewers'), 300);
        else if (nextLevel === 3) setTimeout(() => this.screen.showLevelTitle(3, 'The Labratory'), 300);
        else if (nextLevel === 4) setTimeout(() => this.screen.showLevelTitle(4, 'Questionable Reality'), 300);
        this.gameTime = START_TIME;
        this.screen.updateTimerUI(this.gameTime);
        if (this.realismPass) {
            this.realismPass.uniforms.distortion.value = 0.3;
            setTimeout(() => { this.realismPass.uniforms.distortion.value = 0.15; }, 600);
        }
        this.isTransitioning = false;
    }

    sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
}

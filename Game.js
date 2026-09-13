import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { GameScreen } from './GameScreen.js';
import { generateMap1 } from './GameMap1.js';
import { generateMap2 } from './GameMap2.js';
import { Entity } from './Entity.js';

const MAZE_SIZE = 16;
const wallHeight = 3.6;
const tileSize = 2.8;
const PLAYER_RADIUS = 0.30;
const WALL_MARGIN = 0.18;
const GRAVITY = -22;
const JUMP_SPEED = 6.0;
const BASE_MOVE_SPEED = 5.0;
const SPRINT_MOVE_SPEED = 9.0;
const FIGHT_FLIGHT_MOVE_SPEED = 6.8;
const FIGHT_FLIGHT_SPRINT_SPEED = 11.0;
const AIR_ACCEL = 8.0;
const MAX_SPEED = 25;
const LAND_SHAKE_AMOUNT = 0.12;
const MAX_STAMINA = 160;
const STAMINA_DRAIN = 18;
const STAMINA_REGEN = 15;
const STAMINA_REGEN_WALK = 22;
const SANITY_DRAIN_FLASHLIGHT = 0.75;
const SANITY_DRAIN_DARKNESS = 0.18;
const SANITY_REGEN_NEAR_LIGHT = 6.5;
const LIGHT_DETECTION_RADIUS = 5.5;
const START_TIME = 300;

export class Game {
    constructor() {
        this.scene = null; this.camera = null; this.cameraGroup = null;
        this.renderer = null; this.composer = null; this.realismPass = null;

        this.currentLevel = 0;
        this.mazeGroup = null; this.mazeData = null;
        this.exitX = 0; this.exitZ = 0;
        this.spawnX = 0; this.spawnZ = 0;
        this.teleporterPos = { x: 0, z: 0 };
        this.gameRunning = true;
        this.isTransitioning = false;
        this.playerHeight = 1.55;
        this.currentSize = MAZE_SIZE;
        this.currentHalf = (MAZE_SIZE - 1) / 2;

        this.stamina = MAX_STAMINA;
        this.isSprinting = false;
        this.sanity = 100;
        this.gameTime = START_TIME;
        this.isDead = false;

        this.keys = {};
        this.isLocked = false;
        this.yaw = 0; this.pitch = 0;
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.onGround = false;
        this.landShake = 0;
        this.bobTime = 0; this.breathPhase = 0;
        this.smoothMoveX = 0; this.smoothMoveY = 0;
        this.headTilt = 0; this.smoothHeadTilt = 0;
        this.mouseSpeed = 0;
        this.isSchizo = false; this.schizoTimer = 0;
        this.flashlightOffTime = 0; this.nearLightSource = false;
        this.wallMeshes = [];
        this.wallShiftSeed = 0;
        this.lightSources = []; this.flickerLights = [];
        this.flashlightOn = true;
        this.flashlight = null; this.lensBounce = null;
        this._flashDir = new THREE.Vector3();
        this.smoothFlashPos = new THREE.Vector3();
        this.smoothFlashTarget = new THREE.Vector3();
        this.isFirstFlash = true;
        this.flickerTimer = 0;
        this.flickerInterval = 15 + Math.random() * 12;
        this.isFlickering = false;
        this.flickerPhase = 0;
        this.FLICKER_DURATION = 0.5;

        this.entity = null;
        this.playerJustJumped = false;
        this.playerJumpHeardTimer = 0;
        this._entityKillInterval = null;

        this.container = document.getElementById('threeContainer');
        this.screen = new GameScreen();
        this.stopped = false;
        this.prevTime = 0;
        this.animationId = null;

        this.animate = this.animate.bind(this);
        this.resize = this.resize.bind(this);
        this.onKeyDown = this.onKeyDown.bind(this);
        this.onKeyUp = this.onKeyUp.bind(this);
        this.onMouseMove = this.onMouseMove.bind(this);
        this.onPointerLockChange = this.onPointerLockChange.bind(this);
        this.onClick = this.onClick.bind(this);
    }

    init() {
        this.setupThree();
        this.setupLights();
        this.setupPostProcessing();
        this.setupInput();
        this.generateLevel(0);
        this.screen.updateTimerUI(this.gameTime);
        this.screen.updateSanityUI(this.sanity);
        this.screen.updateStaminaUI(this.stamina, this.sanity);
        this.prevTime = performance.now();
        this.animate(this.prevTime);

        setTimeout(() => {
            if (!this.isLocked && !this.stopped) {
                try { this.renderer.domElement.requestPointerLock(); } catch (e) {}
            }
        }, 600);
    }

    setupThree() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x040406);
        this.scene.fog = new THREE.FogExp2(0x040406, 0.012);

        this.cameraGroup = new THREE.Object3D();
        this.scene.add(this.cameraGroup);
        this.camera = new THREE.PerspectiveCamera(84, this.container.clientWidth / this.container.clientHeight, 0.08, 100);
        this.camera.position.set(0, 0, 0);
        this.camera.rotation.order = 'YXZ';
        this.cameraGroup.add(this.camera);
        this.cameraGroup.position.set(0, this.playerHeight, 0);

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
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
        this.composer.setSize(w, h);
    }

    setupLights() {
        this.scene.add(new THREE.AmbientLight(0x0a0a0e, 0.25));
        this.scene.add(new THREE.HemisphereLight(0x1a1a22, 0x08080a, 0.18));

        const flashlight = new THREE.SpotLight(0xfff2df, 60, 26, Math.PI / 4.0, 0.7, 1.6);
        flashlight.castShadow = true;
        flashlight.shadow.mapSize.set(2048, 2048);
        flashlight.shadow.camera.near = 0.1;
        flashlight.shadow.camera.far = 28;
        flashlight.shadow.bias = -0.0012;
        flashlight.shadow.normalBias = 0.025;
        flashlight.map = this.createFlashlightTexture();
        this.scene.add(flashlight);
        this.scene.add(flashlight.target);
        this.flashlight = flashlight;

        this.lensBounce = new THREE.PointLight(0xffdca8, 0.6, 2.8, 2);
        this.scene.add(this.lensBounce);
    }

    createFlashlightTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 256; canvas.height = 256;
        const ctx = canvas.getContext('2d');
        const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
        grad.addColorStop(0.0, 'rgba(255,255,245,1.0)');
        grad.addColorStop(0.3, 'rgba(255,248,235,1.0)');
        grad.addColorStop(0.6, 'rgba(255,235,205,1.0)');
        grad.addColorStop(0.85, 'rgba(255,215,160,1.0)');
        grad.addColorStop(1.0, 'rgba(255,200,140,0.8)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 256, 256);
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
    }

    setupPostProcessing() {
        const composer = new EffectComposer(this.renderer);
        composer.addPass(new RenderPass(this.scene, this.camera));

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
            0.25, 0.15, 0.08
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

        document.getElementById('btnRespawn').addEventListener('click', () => this.respawn());
        document.getElementById('btnMainMenu').addEventListener('click', () => this.goToMainMenu());
        document.getElementById('btnRestartLevels').addEventListener('click', () => this.restartLevels());
        document.getElementById('winContinue').addEventListener('click', () => location.reload());

        document.getElementById('btnEntityRespawn').addEventListener('click', () => this.respawn());
        document.getElementById('btnEntityMainMenu').addEventListener('click', () => this.goToMainMenu());
        document.getElementById('btnEntityRestart').addEventListener('click', () => this.restartLevels());
    }

    onKeyDown(e) {
        if (e.key === ' ') e.preventDefault();
        const k = e.key.length === 1 ? e.key.toUpperCase() : e.key;
        this.keys[k] = true;
        if (e.key === 'Shift') this.isSprinting = true;
        if (e.key === 'i' || e.key === 'I') {
            const p = document.getElementById('infoPanel');
            p.style.display = p.style.display === 'block' ? 'none' : 'block';
        }
    }
    onKeyUp(e) {
        this.keys[e.key.length === 1 ? e.key.toUpperCase() : e.key] = false;
        if (e.key === 'Shift') this.isSprinting = false;
    }
    onMouseMove(e) {
        if (!this.isLocked || this.isTransitioning) return;
        const sens = 0.0018;
        const dx = e.movementX * sens, dy = e.movementY * sens;
        this.yaw -= dx; this.pitch -= dy;
        this.pitch = Math.max(-Math.PI / 2 + 0.08, Math.min(Math.PI / 2 - 0.08, this.pitch));
        this.camera.rotation.y = this.yaw;
        this.camera.rotation.x = this.pitch;
        this.smoothMoveX += e.movementX * 0.0008;
        this.smoothMoveY += e.movementY * 0.0008;
        this.smoothMoveX *= 0.92; this.smoothMoveY *= 0.92;
        this.headTilt = -dx * 2.5;
        this.smoothHeadTilt += (this.headTilt - this.smoothHeadTilt) * 0.08;
        this.mouseSpeed = Math.sqrt(e.movementX * e.movementX + e.movementY * e.movementY) * 0.02;
    }
    onPointerLockChange() {
        this.isLocked = document.pointerLockElement === this.renderer.domElement;
    }
    onClick() {
        if (this.isLocked) this.flashlightOn = !this.flashlightOn;
        else if (!this.isTransitioning && !this.isDead) {
            try { this.renderer.domElement.requestPointerLock(); } catch (e) {}
        }
    }

    generateLevel(level) {
        if (this.mazeGroup) { this.scene.remove(this.mazeGroup); this.mazeGroup = null; }
        const result = level === 0
            ? generateMap1(this.scene, MAZE_SIZE, wallHeight, tileSize)
            : generateMap2(this.scene, MAZE_SIZE, wallHeight, tileSize);
        this.mazeGroup = result.group;
        this.mazeData = result.data;
        this.spawnX = result.spawnPos.x; this.spawnZ = result.spawnPos.z;
        this.exitX = result.exitPos.x; this.exitZ = result.exitPos.z;
        this.teleporterPos = { x: this.exitX, z: this.exitZ };
        this.cameraGroup.position.set(this.spawnX, this.playerHeight, this.spawnZ);
        this.camera.position.set(0, 0, 0);
        this.velocity.set(0, 0, 0);
        this.onGround = true; this.landShake = 0; this.breathPhase = 0;
        this.stamina = MAX_STAMINA;
        this.isSprinting = false;
        this.lightSources = result.lightSources || [];
        this.flickerLights = result.flickerLights || [];
        this.wallMeshes = result.wallMeshes || [];
        this.sanity = 100;
        this.isSchizo = false;
        this.wallShiftSeed = Math.random() * 1000;
        this.gameTime = START_TIME;
        this.screen.updateTimerUI(this.gameTime);
        this.screen.updateSanityUI(this.sanity);
        this.screen.updateStaminaUI(this.stamina, this.sanity);
        if (level === 1) this.screen.showLevelTitle(1, 'The Woodland');
        this.currentLevel = level;
        this.spawnEntity();
    }

    // ── ENTITY (INVISIBLE) ──
    findEntitySpawnTile(playerTile, exitTile) {
        const size = this.currentSize;
        const data = this.mazeData;
        const dist = Array.from({ length: size }, () => Array(size).fill(Infinity));
        dist[playerTile.y][playerTile.x] = 0;
        const queue = [{ x: playerTile.x, y: playerTile.y }];
        let qi = 0;
        while (qi < queue.length) {
            const { x, y } = queue[qi++];
            const cell = data[y][x];
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
        const playerTile = {
            x: Math.round(this.spawnX / tileSize + this.currentHalf),
            y: Math.round(this.spawnZ / tileSize + this.currentHalf)
        };
        const exitTile = {
            x: Math.round(this.exitX / tileSize + this.currentHalf),
            y: Math.round(this.exitZ / tileSize + this.currentHalf)
        };
        const spawnTile = this.findEntitySpawnTile(playerTile, exitTile);
        this.entity = new Entity(this.mazeData, this.currentSize, this.currentHalf, tileSize, spawnTile);
        this.entity.onKill = () => this.triggerEntityKill();
    }

    triggerEntityKill() {
        if (this.isDead) return;
        this.isDead = true;
        this.isLocked = false;
        if (document.pointerLockElement) document.exitPointerLock();

        const overlay = document.getElementById('entityKillOverlay');
        const img = document.getElementById('entityKillFrame');
        const buttons = document.getElementById('entityKillButtons');
        overlay.classList.add('active');
        buttons.classList.remove('visible');

        const frames = ['e1.png', 'e2.png', 'e3.png', 'e4.png'];
        let frame = 0;
        img.src = frames[0];
        if (this._entityKillInterval) clearInterval(this._entityKillInterval);
        this._entityKillInterval = setInterval(() => {
            frame = (frame + 1) % frames.length;
            img.src = frames[frame];
        }, 500);
        setTimeout(() => buttons.classList.add('visible'), 2200);
    }

    hideEntityKillOverlay() {
        document.getElementById('entityKillOverlay').classList.remove('active');
        document.getElementById('entityKillButtons').classList.remove('visible');
        if (this._entityKillInterval) { clearInterval(this._entityKillInterval); this._entityKillInterval = null; }
    }

    animate(time) {
        if (this.stopped) return;
        const dt = Math.min((time - this.prevTime) / 1000, 0.05);
        this.prevTime = time;

        if (this.playerJumpHeardTimer > 0) this.playerJumpHeardTimer -= dt;
        else this.playerJustJumped = false;

        if (!this.isDead && this.gameRunning) {
            this.gameTime -= dt;
            if (this.gameTime < 0) this.gameTime = 0;
            this.screen.updateTimerUI(this.gameTime);
            if (this.gameTime <= 0 && !this.isDead) this.triggerDeath('time');
        }

        this.updateSanity(dt);
        this.updateSchizophrenia(time, dt);
        this.updateMazeShifting(time, dt);
        this.updateStamina(dt);
        this.updateMovement(dt);
        this.updateFlashlight();

        if (!this.isTransitioning && this.gameRunning && this.isLocked) this.checkTeleporter();

        // Entity update (invisible — no rendering)
        if (this.entity && this.entity.isActive && !this.isTransitioning && !this.isDead) {
            this.entity.update(dt, this.cameraGroup.position, this.flashlightOn,
                this.playerJustJumped, this.sanity, this.gameTime);
        }

        // Info panel
        const p = document.getElementById('infoPanel');
        if (p.style.display === 'block') {
            const pos = this.cameraGroup.position;
            document.getElementById('infoContent').innerHTML =
                `<span class="label">Coordinates</span> > ${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}<br>` +
                `<span class="label">Time Remaining</span> > ${this.screen.formatTime(this.gameTime)}<br>` +
                `<span class="label">Sanity</span> > ${this.screen.getSanityLevel(this.sanity)} (${Math.round(this.sanity)}%)`;
        }

        this.composer.render();
        this.animationId = requestAnimationFrame(this.animate);
    }

    updateSanity(dt) {
        this.nearLightSource = this.checkNearbyLights();
        if (!this.isDead) {
            if (this.flashlightOn) {
                this.sanity = Math.max(0, this.sanity - SANITY_DRAIN_FLASHLIGHT * dt);
                this.flashlightOffTime = 0;
            } else {
                if (this.nearLightSource) {
                    this.sanity = Math.min(100, this.sanity + SANITY_REGEN_NEAR_LIGHT * dt);
                    this.flashlightOffTime = 0;
                } else {
                    this.flashlightOffTime += dt;
                    if (this.flashlightOffTime > 2.0) this.sanity = Math.max(0, this.sanity - SANITY_DRAIN_DARKNESS * dt);
                    else this.sanity = Math.max(0, this.sanity - SANITY_DRAIN_DARKNESS * dt * 0.3);
                }
            }
            if (this.sanity <= 0) { this.sanity = 0; if (!this.isDead) this.triggerDeath('sanity'); }
        }
        this.screen.updateSanityUI(this.sanity);
    }

    checkNearbyLights() {
        const pos = this.cameraGroup.position;
        let nearest = Infinity;
        for (const src of this.lightSources) {
            if (!src.position) continue;
            const d = pos.distanceTo(src.position);
            if (d < nearest) nearest = d;
        }
        return nearest < LIGHT_DETECTION_RADIUS;
    }

    updateSchizophrenia(time, dt) {
        const isBelowF = this.sanity < 10;
        if (isBelowF !== this.isSchizo) this.isSchizo = isBelowF;
        const schizoOverlay = document.getElementById('schizoOverlay');
        const schizoIntensity = Math.min(1, (1 - (this.sanity / 100)) * 1.8);

        if (this.isSchizo && !this.isDead) {
            this.schizoTimer += dt;
            schizoOverlay.classList.add('active');
            if (this.sanity < 5) schizoOverlay.classList.add('intense');
            else schizoOverlay.classList.remove('intense');
            if (this.realismPass) {
                const glitch = 0.15 + 0.65 * schizoIntensity * (0.5 + 0.5 * Math.sin(time * 0.004 + this.schizoTimer));
                this.realismPass.uniforms.sanityGlitch.value = Math.min(0.9, glitch);
                this.realismPass.uniforms.sanityDarkness.value = 0.05 + 0.25 * schizoIntensity * (0.5 + 0.5 * Math.sin(time * 0.002));
                this.realismPass.uniforms.aberration.value = 0.025 + 0.05 * schizoIntensity * (0.5 + 0.5 * Math.sin(time * 0.006 + this.schizoTimer));
                this.realismPass.uniforms.redTint.value = 0.05 + 0.35 * schizoIntensity * (0.5 + 0.5 * Math.sin(time * 0.003 + this.schizoTimer * 0.7));
                this.realismPass.uniforms.distortion.value = 0.15 + 0.25 * schizoIntensity;
            }
            for (const fl of this.flickerLights) {
                const flicker = 0.05 + 0.95 * (0.5 + 0.5 * Math.sin(time * 0.025 + fl.phase + this.schizoTimer * 4));
                fl.light.intensity += (fl.baseIntensity * flicker * 0.5 - fl.light.intensity) * 0.12;
            }
            if (this.flashlightOn && Math.random() < 0.12) this.flashlight.intensity *= (0.3 + Math.random() * 0.7);
            if (this.realismPass) {
                const blurX = this.smoothMoveX * 0.5 + this.mouseSpeed * 0.2;
                const blurY = this.smoothMoveY * 0.5 + this.mouseSpeed * 0.2;
                this.realismPass.uniforms.motionBlurX.value += (blurX - this.realismPass.uniforms.motionBlurX.value) * 0.08;
                this.realismPass.uniforms.motionBlurY.value += (blurY - this.realismPass.uniforms.motionBlurY.value) * 0.08;
            }
        } else {
            schizoOverlay.classList.remove('active', 'intense');
            if (this.realismPass) {
                this.realismPass.uniforms.sanityGlitch.value += (0 - this.realismPass.uniforms.sanityGlitch.value) * 0.03;
                this.realismPass.uniforms.sanityDarkness.value += (0 - this.realismPass.uniforms.sanityDarkness.value) * 0.03;
                this.realismPass.uniforms.aberration.value += (0.025 - this.realismPass.uniforms.aberration.value) * 0.03;
                this.realismPass.uniforms.redTint.value += (0 - this.realismPass.uniforms.redTint.value) * 0.03;
                this.realismPass.uniforms.distortion.value += (0.15 - this.realismPass.uniforms.distortion.value) * 0.03;
                this.realismPass.uniforms.motionBlurX.value += (0 - this.realismPass.uniforms.motionBlurX.value) * 0.05;
                this.realismPass.uniforms.motionBlurY.value += (0 - this.realismPass.uniforms.motionBlurY.value) * 0.05;
            }
            this.schizoTimer = 0;
            for (const fl of this.flickerLights) {
                const flicker = 0.6 + 0.4 * Math.sin(time * 0.001 * fl.speed + fl.phase);
                const target = fl.baseIntensity * (0.5 + 0.5 * flicker);
                fl.light.intensity += (target - fl.light.intensity) * 0.05;
            }
        }
    }

    updateMazeShifting(time, dt) {
        if (this.sanity > 30 || this.wallMeshes.length === 0) {
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
        const camDir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
        const shiftAmount = (1 - this.sanity / 30) * 0.6;
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

    updateStamina(dt) {
        const isMoving = this.keys['W'] || this.keys['S'] || this.keys['A'] || this.keys['D'] ||
            this.keys['ArrowUp'] || this.keys['ArrowDown'] || this.keys['ArrowLeft'] || this.keys['ArrowRight'];
        const fightOrFlightActive = this.sanity < 30 && !this.isDead;
        const canSprint = this.isSprinting && isMoving && this.onGround && this.stamina > 0 && !this.isDead;

        if (canSprint) {
            this.stamina = Math.max(0, this.stamina - STAMINA_DRAIN * dt * (fightOrFlightActive ? 0.8 : 1.0));
            if (this.stamina <= 0) this.isSprinting = false;
        } else if (isMoving && this.onGround && !this.isDead) {
            this.stamina = Math.min(MAX_STAMINA, this.stamina + STAMINA_REGEN_WALK * dt * (fightOrFlightActive ? 1.2 : 1.0));
        } else if (!this.isDead) {
            this.stamina = Math.min(MAX_STAMINA, this.stamina + STAMINA_REGEN * dt * (fightOrFlightActive ? 1.1 : 1.0));
        }
        this.screen.updateStaminaUI(this.stamina, this.sanity);
        document.getElementById('staminaContainer').style.opacity = (this.isSprinting && isMoving && this.onGround) ? '0.9' : '0';
        const staminaPct = this.stamina / MAX_STAMINA;
        if (this.realismPass) {
            const target = (staminaPct < 0.3) ? (1 - staminaPct / 0.3) * 0.5 : 0;
            const current = this.realismPass.uniforms.staminaVignette.value || 0;
            this.realismPass.uniforms.staminaVignette.value = current + (target - current) * 0.03;
        }
    }

    updateMovement(dt) {
        if (this.isTransitioning || !this.gameRunning || !this.isLocked || this.isDead) return;

        const fightOrFlightActive = this.sanity < 30 && !this.isDead;
        const sprintActive = this.isSprinting && this.onGround && this.stamina > 0 && !this.isDead;
        const currentMoveSpeed = sprintActive
            ? (fightOrFlightActive ? FIGHT_FLIGHT_SPRINT_SPEED : SPRINT_MOVE_SPEED)
            : (fightOrFlightActive ? FIGHT_FLIGHT_MOVE_SPEED : BASE_MOVE_SPEED);

        const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
        const strafe = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

        const wasOnGround = this.onGround;
        this.onGround = (this.cameraGroup.position.y <= this.playerHeight + 0.05 && this.velocity.y <= 0);
        if (this.onGround && !wasOnGround && this.velocity.y <= 0) {
            this.landShake = LAND_SHAKE_AMOUNT * (sprintActive ? 1.6 : (fightOrFlightActive ? 1.3 : 1.0));
        }
        if (this.landShake > 0.0001) {
            this.landShake *= 0.90;
            if (this.landShake < 0.0001) this.landShake = 0;
            this.cameraGroup.position.y -= this.landShake * dt * 22;
        }

        if (this.keys[' '] && this.onGround) {
            this.velocity.y = JUMP_SPEED * (sprintActive ? 1.12 : (fightOrFlightActive ? 1.08 : 1.0));
            this.onGround = false;
            this.playerJustJumped = true;
            this.playerJumpHeardTimer = 0.4;
        }
        this.velocity.y += GRAVITY * dt;

        let moveX = 0, moveZ = 0;
        if (this.keys['W'] || this.keys['ArrowUp']) { moveX += forward.x; moveZ += forward.z; }
        if (this.keys['S'] || this.keys['ArrowDown']) { moveX -= forward.x; moveZ -= forward.z; }
        if (this.keys['A'] || this.keys['ArrowLeft']) { moveX -= strafe.x; moveZ -= strafe.z; }
        if (this.keys['D'] || this.keys['ArrowRight']) { moveX += strafe.x; moveZ += strafe.z; }

        const inputLen = Math.sqrt(moveX * moveX + moveZ * moveZ);
        let desiredDir = new THREE.Vector3(moveX, 0, moveZ);
        if (inputLen > 0) desiredDir.normalize();

        if (this.onGround) {
            if (inputLen > 0) {
                const accel = currentMoveSpeed * 5.5;
                this.velocity.x += desiredDir.x * accel * dt;
                this.velocity.z += desiredDir.z * accel * dt;
            }
            const friction = sprintActive ? 5.0 : (fightOrFlightActive ? 5.5 : 6.5);
            this.velocity.x *= (1 - dt * friction);
            this.velocity.z *= (1 - dt * friction);
            const horSpeed = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);
            if (horSpeed > currentMoveSpeed) {
                this.velocity.x = (this.velocity.x / horSpeed) * currentMoveSpeed;
                this.velocity.z = (this.velocity.z / horSpeed) * currentMoveSpeed;
            }
        } else {
            if (inputLen > 0 && (this.keys['A'] || this.keys['ArrowLeft'] || this.keys['D'] || this.keys['ArrowRight'])) {
                const addSpeed = AIR_ACCEL * dt;
                this.velocity.x += desiredDir.x * addSpeed;
                this.velocity.z += desiredDir.z * addSpeed;
                const newSpeed = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);
                if (newSpeed > MAX_SPEED) {
                    this.velocity.x = (this.velocity.x / newSpeed) * MAX_SPEED;
                    this.velocity.z = (this.velocity.z / newSpeed) * MAX_SPEED;
                }
            }
            this.velocity.x *= (1 - dt * 0.7);
            this.velocity.z *= (1 - dt * 0.7);
        }

        const moveDelta = new THREE.Vector3(this.velocity.x * dt, this.velocity.y * dt, this.velocity.z * dt);
        const newX = this.cameraGroup.position.x + moveDelta.x;
        const newZ = this.cameraGroup.position.z + moveDelta.z;

        if (this.isWalkableDynamic(this.mazeData, this.currentSize, this.currentHalf, newX, this.cameraGroup.position.z)) {
            this.cameraGroup.position.x = newX;
        } else this.velocity.x = 0;
        if (this.isWalkableDynamic(this.mazeData, this.currentSize, this.currentHalf, this.cameraGroup.position.x, newZ)) {
            this.cameraGroup.position.z = newZ;
        } else this.velocity.z = 0;

        this.cameraGroup.position.y += moveDelta.y;
        if (this.cameraGroup.position.y < this.playerHeight) {
            this.cameraGroup.position.y = this.playerHeight;
            if (this.velocity.y < 0) this.velocity.y = 0;
            this.onGround = true;
        }
        if (this.cameraGroup.position.y > this.playerHeight + wallHeight) {
            this.cameraGroup.position.y = this.playerHeight + wallHeight;
            if (this.velocity.y > 0) this.velocity.y = 0;
        }

        const targetFov = sprintActive ? 92 : (fightOrFlightActive ? 88 : 84);
        if (!this.isDead) {
            this.camera.fov += (targetFov - this.camera.fov) * 0.04;
            this.camera.updateProjectionMatrix();
        }
        if (this.realismPass) {
            const target = sprintActive ? 1.04 : (fightOrFlightActive ? 1.02 : 1.0);
            const cur = this.realismPass.uniforms.fovScale.value || 1.0;
            this.realismPass.uniforms.fovScale.value = cur + (target - cur) * 0.04;
        }

        const breathSpeedMult = sprintActive ? 1.9 : (fightOrFlightActive ? 1.4 : 1.0);
        if (!this.isDead) this.breathPhase += dt * 0.7 * breathSpeedMult;
        const breath = Math.sin(this.breathPhase * Math.PI * 2);
        const breathOffset = breath * 0.018 * breathSpeedMult;
        const breathTilt = breath * 0.003 * breathSpeedMult;

        let bobY = 0, bobX = 0;
        const isMoving = inputLen > 0;
        if (isMoving && this.onGround && !this.isTransitioning && !this.isDead) {
            const bobSpeed = sprintActive ? 2.2 : (fightOrFlightActive ? 1.6 : 1.0);
            const bobAmp = sprintActive ? 0.075 : (fightOrFlightActive ? 0.06 : 0.04);
            this.bobTime += dt * 2 * Math.PI * bobSpeed;
            bobY = Math.sin(this.bobTime) * bobAmp;
            bobX = Math.sin(this.bobTime * 0.7) * bobAmp * 0.5;
        }
        if (!this.isTransitioning && !this.isDead) {
            this.camera.position.y = breathOffset + bobY;
            this.camera.position.x = bobX + this.smoothHeadTilt * 0.02;
            this.camera.rotation.z = breathTilt * 0.5 + this.smoothHeadTilt * 0.015;
            this.camera.rotation.x += breathTilt * 0.3;
        } else {
            this.camera.position.set(0, 0, 0);
            this.camera.rotation.z = 0;
        }
        this.smoothHeadTilt += (this.headTilt - this.smoothHeadTilt) * 0.06;

        const moveX2 = this.smoothMoveX + this.velocity.x * 0.012;
        const moveY2 = this.smoothMoveY + this.velocity.z * 0.012;
        if (this.realismPass) {
            this.realismPass.uniforms.movementX.value = Math.max(-1, Math.min(1, moveX2));
            this.realismPass.uniforms.movementY.value = Math.max(-1, Math.min(1, moveY2));
            this.realismPass.uniforms.time.value = performance.now() * 0.001;
            const dirtTarget = sprintActive ? 0.5 : 0.15;
            const curDirt = this.realismPass.uniforms.lensDirt.value || 0;
            this.realismPass.uniforms.lensDirt.value = curDirt + (dirtTarget - curDirt) * 0.02;
        }
        this.mouseSpeed *= 0.95;
    }

    isWalkableDynamic(mazeData, size, half, worldX, worldZ) {
        for (let i = 0; i < 12; i++) {
            const angle = (i / 12) * Math.PI * 2;
            const px = worldX + Math.cos(angle) * PLAYER_RADIUS;
            const pz = worldZ + Math.sin(angle) * PLAYER_RADIUS;
            const gx = px / tileSize + half;
            const gz = pz / tileSize + half;
            const ix = Math.round(gx);
            const iz = Math.round(gz);
            if (ix < 0 || ix >= size || iz < 0 || iz >= size) return false;
            const cell = mazeData[iz][ix];
            const localX = gx - ix, localZ = gz - iz;
            if (localX < -0.5 + WALL_MARGIN && cell.left) return false;
            if (localX > 0.5 - WALL_MARGIN && cell.right) return false;
            if (localZ < -0.5 + WALL_MARGIN && cell.top) return false;
            if (localZ > 0.5 - WALL_MARGIN && cell.bottom) return false;
        }
        return true;
    }

    updateFlashlight() {
        const camPos = new THREE.Vector3();
        this.camera.getWorldPosition(camPos);
        const camQuat = new THREE.Quaternion();
        this.camera.getWorldQuaternion(camQuat);
        const offset = new THREE.Vector3(0.38, -0.18, -0.58);
        const flashWorldPos = camPos.clone().add(offset.clone().applyQuaternion(camQuat));
        this._flashDir.set(0, 0, -1).applyQuaternion(camQuat).normalize();
        const flashTargetPos = flashWorldPos.clone().addScaledVector(this._flashDir, 8);
        if (this.isFirstFlash) {
            this.smoothFlashPos.copy(flashWorldPos);
            this.smoothFlashTarget.copy(flashTargetPos);
            this.isFirstFlash = false;
        }
        this.smoothFlashPos.lerp(flashWorldPos, 0.10);
        this.smoothFlashTarget.lerp(flashTargetPos, 0.10);
        this.flashlight.position.copy(this.smoothFlashPos);
        this.flashlight.target.position.copy(this.smoothFlashTarget);
        this.lensBounce.position.copy(this.smoothFlashPos).addScaledVector(this._flashDir, 0.1);

        let targetIntensity = this.flashlightOn ? 60 : 0;
        if (this.isFlickering) {
            targetIntensity = this.flashlightOn ? (Math.random() > 0.5 ? 0 : 60) : 0;
            this.flickerPhase += 0.05;
            if (this.flickerPhase > this.FLICKER_DURATION) {
                this.isFlickering = false;
                this.flickerPhase = 0;
                this.flickerInterval = 15 + Math.random() * 12;
                this.flickerTimer = 0;
            }
        }
        if (this.flashlightOn && !this.isFlickering && Math.random() < 0.002) targetIntensity *= (0.7 + Math.random() * 0.3);
        this.flashlight.intensity += (targetIntensity - this.flashlight.intensity) * 0.4;
        this.lensBounce.intensity += ((this.flashlightOn ? 0.6 : 0) - this.lensBounce.intensity) * 0.4;
        this.flickerTimer += 1 / 60;
        if (this.flickerTimer >= this.flickerInterval && !this.isFlickering) {
            this.isFlickering = true;
            this.flickerPhase = 0;
        }
    }

    checkTeleporter() {
        if (this.isTransitioning || this.isDead) return;
        const px = this.cameraGroup.position.x, pz = this.cameraGroup.position.z;
        const dist = Math.sqrt((px - this.teleporterPos.x) ** 2 + (pz - this.teleporterPos.z) ** 2);
        if (dist < 1.0) {
            if (this.currentLevel === 0) this.transitionToNextLevel();
            else if (this.currentLevel === 1) document.getElementById('winOverlay').classList.add('active');
        }
    }

    async transitionToNextLevel() {
        this.isTransitioning = true;
        const white = document.getElementById('whiteFlash');
        white.style.opacity = '1';
        await this.sleep(250);
        white.style.opacity = '0';
        this.currentLevel = 1;
        this.generateLevel(1);
        setTimeout(() => this.screen.showLevelTitle(1, 'The Woodland'), 300);
        this.gameTime = START_TIME;
        this.screen.updateTimerUI(this.gameTime);
        if (this.realismPass) {
            this.realismPass.uniforms.distortion.value = 0.3;
            setTimeout(() => { this.realismPass.uniforms.distortion.value = 0.15; }, 600);
        }
        this.isTransitioning = false;
    }

    sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

    triggerDeath(cause) {
        if (this.isDead) return;
        this.isDead = true;
        this.isLocked = false;
        if (document.pointerLockElement) document.exitPointerLock();
        this.screen.showDeathOverlay(cause);
    }

    respawn() {
        if (!this.isDead) return;
        this.isDead = false;
        this.hideEntityKillOverlay();
        this.screen.hideDeathOverlay();
        this.sanity = 100;
        this.stamina = MAX_STAMINA;
        this.gameTime = START_TIME;
        this.screen.updateTimerUI(this.gameTime);
        this.cameraGroup.position.set(this.spawnX, this.playerHeight, this.spawnZ);
        this.camera.position.set(0, 0, 0);
        this.velocity.set(0, 0, 0);
        this.onGround = true;
        this.landShake = 0;
        this.breathPhase = 0;
        this.isSchizo = false;
        this.schizoTimer = 0;
        this.isLocked = true;
        try { this.renderer.domElement.requestPointerLock(); } catch (e) {}
        this.spawnEntity();
    }

    restartLevels() {
        this.hideEntityKillOverlay();
        this.screen.hideDeathOverlay();
        this.gameTime = START_TIME;
        this.currentLevel = 0;
        this.isDead = false;
        this.generateLevel(0);
        this.sanity = 100;
        this.stamina = MAX_STAMINA;
        this.cameraGroup.position.set(this.spawnX, this.playerHeight, this.spawnZ);
        this.velocity.set(0, 0, 0);
        this.onGround = true;
        this.isLocked = true;
        try { this.renderer.domElement.requestPointerLock(); } catch (e) {}
        this.screen.updateTimerUI(this.gameTime);
        document.getElementById('levelTitleContainer').classList.remove('visible');
    }

    goToMainMenu() {
        this.hideEntityKillOverlay();
        this.screen.hideDeathOverlay();
        document.getElementById('mainMenu').classList.remove('hidden');
        document.getElementById('winOverlay').classList.remove('active');
        this.isDead = false;
        this.gameRunning = true;
        this.gameTime = START_TIME;
        this.sanity = 100;
        this.stamina = MAX_STAMINA;
        this.currentLevel = 0;
        this.generateLevel(0);
        this.prevTime = performance.now();
    }
}

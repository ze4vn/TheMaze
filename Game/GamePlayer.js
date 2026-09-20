import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { Settings } from '../Main/Settings.js';

const tileSize = 2.8;
const wallHeight = 3.6;
const playerHeight = 1.55;
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

const FLASH_ANGLE_NORMAL = Math.PI / 4;
const FLASH_ANGLE_ZOOMED = Math.PI / 14;
const FLASH_DIST_NORMAL = 26;
const FLASH_DIST_ZOOMED = 55;
const FLASH_PENUMBRA_NORMAL = 0.7;
const FLASH_PENUMBRA_ZOOMED = 0.35;
const FLASH_INTENSITY_NORMAL = 60;
const FLASH_INTENSITY_ZOOMED = 135;
const FLASH_ZOOM_STEP = 0.12;

const FLASH_COLOR_NORMAL = new THREE.Color(0xfff2df);
const FLASH_COLOR_ZOOMED = new THREE.Color(0xffffff);

const FLASH_POS_LERP   = 0.16;
const FLASH_TARGET_LERP = 0.055;

const FLY_SPEED = 10;
const FLY_SPRINT_SPEED = 24;

export class GamePlayer {
    constructor(game) {
        this.game = game;

        this.scene = null;
        this.camera = null;
        this.cameraGroup = null;
        this.flashlight = null;
        this.lensBounce = null;

        this.velocity = new THREE.Vector3(0, 0, 0);
        this.yaw = 0;
        this.pitch = 0;
        this.onGround = true;
        this.landShake = 0;

        this.stamina = MAX_STAMINA;
        this.sanity = 100;
        this.isSprinting = false;

        this.isDead = false;
        this.gameWon = false;
        this.invincible = false;

        this.flyMode = false;

        this.bobTime = 0;
        this.breathPhase = 0;
        this.smoothMoveX = 0;
        this.smoothMoveY = 0;
        this.headTilt = 0;
        this.smoothHeadTilt = 0;
        this.mouseSpeed = 0;

        this.flashlightOn = true;
        this.flashlightZoom = 0;
        this.flashlightOffTime = 0;
        this.nearLightSource = false;
        this._flashDir = new THREE.Vector3();
        this.smoothFlashPos = new THREE.Vector3();
        this.smoothFlashTarget = new THREE.Vector3();
        this._flashColorTarget = new THREE.Color();
        this.isFirstFlash = true;
        this.flickerTimer = 0;
        this.flickerInterval = 15 + Math.random() * 12;
        this.isFlickering = false;
        this.flickerPhase = 0;
        this.FLICKER_DURATION = 0.5;

        this.isSchizo = false;
        this.schizoTimer = 0;

        this.keys = {};
        this.playerJustJumped = false;
        this.playerJumpHeardTimer = 0;

        this.viewmodel = null;
        this.viewmodelBaseX = 0.32;
        this.viewmodelBaseY = -0.28;
        this.viewmodelBaseZ = -0.55;
        this.viewmodelScale = 0.012;

        this._wallRaycaster = null;
    }

    setup(scene, aspect) {
        this.scene = scene;

        this.cameraGroup = new THREE.Object3D();
        scene.add(this.cameraGroup);

        this.camera = new THREE.PerspectiveCamera(Settings.fov, aspect, 0.08, 100);
        this.camera.position.set(0, 0, 0);
        this.camera.rotation.order = 'YXZ';
        this.cameraGroup.add(this.camera);
        this.cameraGroup.position.set(0, playerHeight, 0);

        const flashlight = new THREE.SpotLight(
            FLASH_COLOR_NORMAL.getHex(),
            FLASH_INTENSITY_NORMAL,
            FLASH_DIST_NORMAL,
            FLASH_ANGLE_NORMAL,
            FLASH_PENUMBRA_NORMAL,
            1.6
        );
        flashlight.castShadow = true;
        flashlight.shadow.mapSize.set(2048, 2048);
        flashlight.shadow.camera.near = 0.1;
        flashlight.shadow.camera.far = FLASH_DIST_NORMAL + 2;
        flashlight.shadow.bias = -0.0012;
        flashlight.shadow.normalBias = 0.025;
        flashlight.map = this._createFlashlightTexture();
        scene.add(flashlight);
        scene.add(flashlight.target);
        this.flashlight = flashlight;

        this.lensBounce = new THREE.PointLight(0xffdca8, 0.6, 2.8, 2);
        scene.add(this.lensBounce);

        this._loadViewmodel();
    }

    _createFlashlightTexture() {
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

    _loadViewmodel() {
        const loader = new FBXLoader();
        const url = '../Model/flashlight/source/Flashlight.fbx';
        loader.load(
            url,
            (fbx) => {
                const texLoader = new THREE.TextureLoader();
                const baseColor = texLoader.load('../Model/flashlight/textures/BaseColor.png');
                const roughness = texLoader.load('../Model/flashlight/textures/Roughness.png');
                const emissive  = texLoader.load('../Model/flashlight/textures/Emissive.png');
                baseColor.colorSpace = THREE.SRGBColorSpace;
                emissive.colorSpace = THREE.SRGBColorSpace;
                baseColor.anisotropy = 16;
                roughness.anisotropy = 16;

                const mat = new THREE.MeshStandardMaterial({
                    map: baseColor,
                    roughnessMap: roughness,
                    emissiveMap: emissive,
                    emissive: new THREE.Color(0xffffff),
                    emissiveIntensity: 0.5,
                    roughness: 0.6,
                    metalness: 0.85,
                });

                fbx.traverse((child) => {
                    if (child.isMesh) {
                        child.material = mat;
                        child.castShadow = false;
                        child.receiveShadow = false;
                        child.frustumCulled = false;
                    }
                });

                fbx.scale.setScalar(this.viewmodelScale);

                fbx.rotation.set(Math.PI, 0, 0);
                fbx.position.set(this.viewmodelBaseX, this.viewmodelBaseY, this.viewmodelBaseZ);

                this.camera.add(fbx);
                this.viewmodel = fbx;
                console.log('[Viewmodel] Flashlight loaded');
            },
            undefined,
            (err) => { console.warn('[Viewmodel] FBX load failed:', err); }
        );
    }

    _updateViewmodel(dt) {
        if (!this.viewmodel) return;
        const moving = this.isMoving();
        const sprintActive = this.isSprinting && moving && this.onGround;

        let tx = this.viewmodelBaseX;
        let ty = this.viewmodelBaseY;
        const tz = this.viewmodelBaseZ;

        if (moving && this.onGround && !this.flyMode) {
            const bobSpeed = sprintActive ? 2.2 : 1.0;
            const bobAmp = sprintActive ? 0.035 : 0.018;
            tx += Math.sin(this.bobTime) * bobAmp;
            ty += Math.sin(this.bobTime * 2) * bobAmp * 0.4;
        }

        tx += -this.smoothMoveX * 0.08;
        ty += this.smoothMoveY * 0.08;

        this.viewmodel.position.x += (tx - this.viewmodel.position.x) * 0.12;
        this.viewmodel.position.y += (ty - this.viewmodel.position.y) * 0.12;
        this.viewmodel.position.z += (tz - this.viewmodel.position.z) * 0.12;

        const tRotZ = -this.smoothMoveX * 0.3 - (moving && !this.flyMode ? Math.sin(this.bobTime) * 0.02 : 0);
        const tRotX = -this.smoothMoveY * 0.2;
        this.viewmodel.rotation.z += (tRotZ - this.viewmodel.rotation.z) * 0.12;
        this.viewmodel.rotation.x += (tRotX - this.viewmodel.rotation.x) * 0.12;
    }

    setViewmodelVisible(v) {
        if (this.viewmodel) this.viewmodel.visible = v;
    }

    spawnAt(worldX, worldZ) {
        this.cameraGroup.position.set(worldX, playerHeight, worldZ);
        this.camera.position.set(0, 0, 0);
        this.camera.rotation.set(0, 0, 0);
        this.velocity.set(0, 0, 0);
        this.yaw = 0;
        this.pitch = 0;
        this.onGround = true;
        this.landShake = 0;
        this.breathPhase = 0;
        this.bobTime = 0;
        this.flashlightZoom = 0;
        this.sanity = 100;
        this.stamina = MAX_STAMINA;
        this.isSprinting = false;
        this.isSchizo = false;
        this.schizoTimer = 0;
        this.flashlightOffTime = 0;
        this.smoothMoveX = 0;
        this.smoothMoveY = 0;
        this.headTilt = 0;
        this.smoothHeadTilt = 0;
        this.mouseSpeed = 0;
        this.playerJustJumped = false;
        this.playerJumpHeardTimer = 0;
        this.isDead = false;
        this.gameWon = false;
        this.keys = {};
        this.isFirstFlash = true;
    }

    update(dt, time) {
        const g = this.game;

        if (this.playerJumpHeardTimer > 0) this.playerJumpHeardTimer -= dt;
        else this.playerJustJumped = false;

        this.updateSanity(dt, g.lightSources);
        this.updateSchizophrenia(time, dt);
        this.updateStamina(dt);
        this.updateMovement(dt);
        this.updateFlashlight();
        this._updateViewmodel(dt);

        g.screen.updateSanityUI(this.sanity);
        g.screen.updateStaminaUI(this.stamina, this.sanity);
        const moving = this.isMoving();
        const sprintingNow = this.isSprinting && moving && this.onGround && !this.flyMode;
        document.getElementById('staminaContainer').style.opacity = sprintingNow ? '0.9' : '0';
    }

    isMoving() {
        return !!(this.keys['W'] || this.keys['S'] || this.keys['A'] || this.keys['D'] ||
                  this.keys['ArrowUp'] || this.keys['ArrowDown'] || this.keys['ArrowLeft'] || this.keys['ArrowRight']);
    }

    updateSanity(dt, lightSources) {
        this.nearLightSource = this.checkNearbyLights(lightSources);
        if (this.isDead) return;

        if (this.invincible) {
            this.sanity = 100;
            return;
        }

        if (this.flashlightOn) {
            this.sanity = Math.max(0, this.sanity - SANITY_DRAIN_FLASHLIGHT * dt);
            this.flashlightOffTime = 0;
        } else {
            if (this.nearLightSource) {
                this.sanity = Math.min(100, this.sanity + SANITY_REGEN_NEAR_LIGHT * dt);
                this.flashlightOffTime = 0;
            } else {
                this.flashlightOffTime += dt;
                if (this.flashlightOffTime > 2.0) {
                    this.sanity = Math.max(0, this.sanity - SANITY_DRAIN_DARKNESS * dt);
                } else {
                    this.sanity = Math.max(0, this.sanity - SANITY_DRAIN_DARKNESS * dt * 0.3);
                }
            }
        }
        if (this.sanity <= 0) {
            this.sanity = 0;
            if (!this.isDead) this.game.triggerDeath('sanity');
        }
    }

    checkNearbyLights(lightSources) {
        const pos = this.cameraGroup.position;
        let nearest = Infinity;
        for (const src of lightSources) {
            if (!src.position) continue;
            const d = pos.distanceTo(src.position);
            if (d < nearest) nearest = d;
        }
        return nearest < LIGHT_DETECTION_RADIUS;
    }

    updateStamina(dt) {
        const moving = this.isMoving();
        const fightOrFlight = this.sanity < 30 && !this.isDead;
        const canSprint = this.isSprinting && moving && this.onGround && this.stamina > 0 && !this.isDead && !this.flyMode;

        if (canSprint) {
            this.stamina = Math.max(0, this.stamina - STAMINA_DRAIN * dt * (fightOrFlight ? 0.8 : 1.0));
            if (this.stamina <= 0) this.isSprinting = false;
        } else if (moving && this.onGround && !this.isDead) {
            this.stamina = Math.min(MAX_STAMINA, this.stamina + STAMINA_REGEN_WALK * dt * (fightOrFlight ? 1.2 : 1.0));
        } else if (!this.isDead) {
            this.stamina = Math.min(MAX_STAMINA, this.stamina + STAMINA_REGEN * dt * (fightOrFlight ? 1.1 : 1.0));
        }
    }

    updateMovement(dt) {
        const g = this.game;
        if (g.isTransitioning || !g.gameRunning || !g.isLocked || this.isDead || g.consoleOpen) return;

        if (this.flyMode) {
            this.updateFlyMovement(dt);
            return;
        }

        const fightOrFlight = this.sanity < 30 && !this.isDead;
        const sprintActive = this.isSprinting && this.onGround && this.stamina > 0 && !this.isDead;
        const speed = sprintActive
            ? (fightOrFlight ? FIGHT_FLIGHT_SPRINT_SPEED : SPRINT_MOVE_SPEED)
            : (fightOrFlight ? FIGHT_FLIGHT_MOVE_SPEED : BASE_MOVE_SPEED);

        const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
        const strafe = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

        const wasOnGround = this.onGround;
        this.onGround = (this.cameraGroup.position.y <= playerHeight + 0.05 && this.velocity.y <= 0);
        if (this.onGround && !wasOnGround && this.velocity.y <= 0) {
            this.landShake = LAND_SHAKE_AMOUNT * (sprintActive ? 1.6 : (fightOrFlight ? 1.3 : 1.0));
            g.sound.playJumpLand();
        }
        if (this.landShake > 0.0001) {
            this.landShake *= 0.90;
            if (this.landShake < 0.0001) this.landShake = 0;
            this.cameraGroup.position.y -= this.landShake * dt * 22;
        }

        if (this.keys[' '] && this.onGround) {
            this.velocity.y = JUMP_SPEED * (sprintActive ? 1.12 : (fightOrFlight ? 1.08 : 1.0));
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
        const desiredDir = new THREE.Vector3(moveX, 0, moveZ);
        if (inputLen > 0) desiredDir.normalize();

        if (this.onGround) {
            if (inputLen > 0) {
                const accel = speed * 5.5;
                this.velocity.x += desiredDir.x * accel * dt;
                this.velocity.z += desiredDir.z * accel * dt;
            }
            const friction = sprintActive ? 5.0 : (fightOrFlight ? 5.5 : 6.5);
            this.velocity.x *= (1 - dt * friction);
            this.velocity.z *= (1 - dt * friction);
            const horSpeed = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);
            if (horSpeed > speed) {
                this.velocity.x = (this.velocity.x / horSpeed) * speed;
                this.velocity.z = (this.velocity.z / horSpeed) * speed;
            }
        } else {
            if (inputLen > 0 && (this.keys['A'] || this.keys['ArrowLeft'] || this.keys['D'] || this.keys['ArrowRight'])) {
                const addSpeed = AIR_ACCEL * dt;
                this.velocity.x += desiredDir.x * addSpeed;
                this.velocity.z += desiredDir.z * addSpeed;
                const ns = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);
                if (ns > MAX_SPEED) {
                    this.velocity.x = (this.velocity.x / ns) * MAX_SPEED;
                    this.velocity.z = (this.velocity.z / ns) * MAX_SPEED;
                }
            }
            this.velocity.x *= (1 - dt * 0.7);
            this.velocity.z *= (1 - dt * 0.7);
        }

        const moveDelta = new THREE.Vector3(this.velocity.x * dt, this.velocity.y * dt, this.velocity.z * dt);

        const horDist = Math.hypot(moveDelta.x, moveDelta.z);
        const steps = Math.max(1, Math.ceil(horDist / (PLAYER_RADIUS * 0.75)));
        const sx = moveDelta.x / steps;
        const sz = moveDelta.z / steps;

        const mazeData = g.mazeData;
        const size      = g.currentSize;
        const half      = g.currentHalf;

        for (let i = 0; i < steps; i++) {
            const tryX = this.cameraGroup.position.x + sx;
            const tryZ = this.cameraGroup.position.z + sz;

            if (this.canMoveTo(tryX, this.cameraGroup.position.z, mazeData, size, half)) {
                this.cameraGroup.position.x = tryX;
            } else {
                this.velocity.x = 0;
            }
            if (this.canMoveTo(this.cameraGroup.position.x, tryZ, mazeData, size, half)) {
                this.cameraGroup.position.z = tryZ;
            } else {
                this.velocity.z = 0;
            }
        }

        this.cameraGroup.position.y += moveDelta.y;
        if (this.cameraGroup.position.y < playerHeight) {
            this.cameraGroup.position.y = playerHeight;
            if (this.velocity.y < 0) this.velocity.y = 0;
            this.onGround = true;
        }
        if (this.cameraGroup.position.y > playerHeight + wallHeight) {
            this.cameraGroup.position.y = playerHeight + wallHeight;
            if (this.velocity.y > 0) this.velocity.y = 0;
        }

        const baseFov = Settings.fov;
        const targetFov = sprintActive ? baseFov + 8 : (fightOrFlight ? baseFov + 4 : baseFov);
        if (!this.isDead) {
            this.camera.fov += (targetFov - this.camera.fov) * 0.04;
            this.camera.updateProjectionMatrix();
        }
        if (g.realismPass) {
            const target = sprintActive ? 1.04 : (fightOrFlight ? 1.02 : 1.0);
            const cur = g.realismPass.uniforms.fovScale.value || 1.0;
            g.realismPass.uniforms.fovScale.value = cur + (target - cur) * 0.04;
        }

        const breathMult = sprintActive ? 1.9 : (fightOrFlight ? 1.4 : 1.0);
        if (!this.isDead) this.breathPhase += dt * 0.7 * breathMult;
        const breath = Math.sin(this.breathPhase * Math.PI * 2);
        const breathOffset = breath * 0.018 * breathMult;
        const breathTilt = breath * 0.003 * breathMult;

        let bobY = 0, bobX = 0;
        const isMovingNow = inputLen > 0;
        if (isMovingNow && this.onGround && !g.isTransitioning && !this.isDead) {
            const bobSpeed = sprintActive ? 2.2 : (fightOrFlight ? 1.6 : 1.0);
            const bobAmp = sprintActive ? 0.075 : (fightOrFlight ? 0.06 : 0.04);
            this.bobTime += dt * 2 * Math.PI * bobSpeed;
            bobY = Math.sin(this.bobTime) * bobAmp;
            bobX = Math.sin(this.bobTime * 0.7) * bobAmp * 0.5;
        }
        if (!g.isTransitioning && !this.isDead) {
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
        if (g.realismPass) {
            g.realismPass.uniforms.movementX.value = Math.max(-1, Math.min(1, moveX2));
            g.realismPass.uniforms.movementY.value = Math.max(-1, Math.min(1, moveY2));
            g.realismPass.uniforms.time.value = performance.now() * 0.001;
            const dirtTarget = sprintActive ? 0.5 : 0.15;
            const curDirt = g.realismPass.uniforms.lensDirt.value || 0;
            g.realismPass.uniforms.lensDirt.value = curDirt + (dirtTarget - curDirt) * 0.02;

            const staminaPct = this.stamina / MAX_STAMINA;
            const target = (staminaPct < 0.3) ? (1 - staminaPct / 0.3) * 0.5 : 0;
            const curV = g.realismPass.uniforms.staminaVignette.value || 0;
            g.realismPass.uniforms.staminaVignette.value = curV + (target - curV) * 0.03;
        }
        this.mouseSpeed *= 0.95;
    }

    updateFlyMovement(dt) {
        const g = this.game;

        const camForward = new THREE.Vector3();
        this.camera.getWorldDirection(camForward);
        const camRight = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);

        const vel = new THREE.Vector3(0, 0, 0);
        if (this.keys['W'] || this.keys['ArrowUp']) vel.add(camForward);
        if (this.keys['S'] || this.keys['ArrowDown']) vel.sub(camForward);
        if (this.keys['A'] || this.keys['ArrowLeft']) vel.sub(camRight);
        if (this.keys['D'] || this.keys['ArrowRight']) vel.add(camRight);
        if (this.keys[' ']) vel.y += 1;
        if (this.keys['Control']) vel.y -= 1;

        const speed = this.isSprinting ? FLY_SPRINT_SPEED : FLY_SPEED;
        if (vel.lengthSq() > 0) {
            vel.normalize();
            vel.multiplyScalar(speed * dt);
            this.cameraGroup.position.add(vel);
        }

        this.velocity.set(0, 0, 0);
        this.onGround = false;

        const targetFov = Settings.fov;
        this.camera.fov += (targetFov - this.camera.fov) * 0.06;
        this.camera.updateProjectionMatrix();

        this.camera.position.set(0, 0, 0);
        this.camera.rotation.z = 0;
        this.bobTime = 0;
        this.breathPhase = 0;
        this.landShake = 0;

        this.smoothMoveX *= 0.9;
        this.smoothMoveY *= 0.9;
        this.mouseSpeed *= 0.95;
    }

    canMoveTo(x, z, mazeData, size, half) {
        if (this.game.collisionMeshes && this.game.collisionMeshes.length > 0) {
            return this._meshFree(x, z);
        }
        return this.isWalkableDynamic(mazeData, size, half, x, z);
    }

    _meshFree(x, z) {
        if (!this._wallRaycaster) this._wallRaycaster = new THREE.Raycaster();
        const raycaster = this._wallRaycaster;

        const dirs = [
            [1,0],[-1,0],[0,1],[0,-1],
            [0.707,0.707],[-0.707,0.707],[0.707,-0.707],[-0.707,-0.707]
        ];
        const heights = [0.25, playerHeight * 0.5, playerHeight * 0.9];
        const probe = PLAYER_RADIUS;

        for (const [dx, dz] of dirs) {
            const dir = new THREE.Vector3(dx, 0, dz).normalize();
            for (const y of heights) {
                raycaster.set(new THREE.Vector3(x, y, z), dir);
                raycaster.far = probe;
                const hits = raycaster.intersectObjects(this.game.collisionMeshes, true);
                for (const h of hits) {
                    if (h.object.visible !== false) return false;
                }
            }
        }
        return true;
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
            const cell = mazeData[iz] && mazeData[iz][ix];
            if (!cell) return false;
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

        this.smoothFlashPos.lerp(flashWorldPos, FLASH_POS_LERP);
        this.smoothFlashTarget.lerp(flashTargetPos, FLASH_TARGET_LERP);

        this.flashlight.position.copy(this.smoothFlashPos);
        this.flashlight.target.position.copy(this.smoothFlashTarget);
        this.lensBounce.position.copy(this.smoothFlashPos).addScaledVector(this._flashDir, 0.1);

        const z = this.flashlightZoom;
        const targetAngle = FLASH_ANGLE_NORMAL + (FLASH_ANGLE_ZOOMED - FLASH_ANGLE_NORMAL) * z;
        const targetDistance = FLASH_DIST_NORMAL + (FLASH_DIST_ZOOMED - FLASH_DIST_NORMAL) * z;
        const targetPenumbra = FLASH_PENUMBRA_NORMAL + (FLASH_PENUMBRA_ZOOMED - FLASH_PENUMBRA_NORMAL) * z;
        const baseIntensity = FLASH_INTENSITY_NORMAL + (FLASH_INTENSITY_ZOOMED - FLASH_INTENSITY_NORMAL) * z;

        this.flashlight.angle += (targetAngle - this.flashlight.angle) * 0.18;
        this.flashlight.distance += (targetDistance - this.flashlight.distance) * 0.18;
        this.flashlight.penumbra += (targetPenumbra - this.flashlight.penumbra) * 0.18;

        this._flashColorTarget.copy(FLASH_COLOR_NORMAL).lerp(FLASH_COLOR_ZOOMED, z);
        this.flashlight.color.lerp(this._flashColorTarget, 0.18);
        this.lensBounce.color.lerp(this._flashColorTarget, 0.18);

        const shadowFar = this.flashlight.distance + 2;
        if (Math.abs(this.flashlight.shadow.camera.far - shadowFar) > 0.5) {
            this.flashlight.shadow.camera.far = shadowFar;
            this.flashlight.shadow.camera.updateProjectionMatrix();
        }

        let targetIntensity = this.flashlightOn ? baseIntensity : 0;
        if (this.isFlickering) {
            targetIntensity = this.flashlightOn ? (Math.random() > 0.5 ? 0 : baseIntensity) : 0;
            this.flickerPhase += 0.05;
            if (this.flickerPhase > this.FLICKER_DURATION) {
                this.isFlickering = false;
                this.flickerPhase = 0;
                this.flickerInterval = 15 + Math.random() * 12;
                this.flickerTimer = 0;
            }
        }
        if (this.flashlightOn && !this.isFlickering && Math.random() < 0.002) {
            targetIntensity *= (0.7 + Math.random() * 0.3);
        }
        this.flashlight.intensity += (targetIntensity - this.flashlight.intensity) * 0.4;
        this.lensBounce.intensity += ((this.flashlightOn ? 0.6 : 0) - this.lensBounce.intensity) * 0.4;

        this.flickerTimer += 1 / 60;
        if (this.flickerTimer >= this.flickerInterval && !this.isFlickering) {
            this.isFlickering = true;
            this.flickerPhase = 0;
        }
    }

    updateSchizophrenia(time, dt) {
        const isBelowF = this.sanity < 10;
        if (isBelowF !== this.isSchizo) this.isSchizo = isBelowF;
        const overlay = document.getElementById('schizoOverlay');
        const intensity = Math.min(1, (1 - (this.sanity / 100)) * 1.8);
        const g = this.game;

        if (this.isSchizo && !this.isDead) {
            this.schizoTimer += dt;
            overlay.classList.add('active');
            if (this.sanity < 5) overlay.classList.add('intense');
            else overlay.classList.remove('intense');

            if (g.realismPass) {
                const glitch = 0.15 + 0.65 * intensity * (0.5 + 0.5 * Math.sin(time * 0.004 + this.schizoTimer));
                g.realismPass.uniforms.sanityGlitch.value = Math.min(0.9, glitch);
                g.realismPass.uniforms.sanityDarkness.value = 0.05 + 0.25 * intensity * (0.5 + 0.5 * Math.sin(time * 0.002));
                g.realismPass.uniforms.aberration.value = 0.025 + 0.05 * intensity * (0.5 + 0.5 * Math.sin(time * 0.006 + this.schizoTimer));
                g.realismPass.uniforms.redTint.value = 0.05 + 0.35 * intensity * (0.5 + 0.5 * Math.sin(time * 0.003 + this.schizoTimer * 0.7));
                g.realismPass.uniforms.distortion.value = 0.15 + 0.25 * intensity;
            }
            for (const fl of g.flickerLights) {
                if (fl.entityFlashActive) continue;
                const flicker = 0.05 + 0.95 * (0.5 + 0.5 * Math.sin(time * 0.025 + fl.phase + this.schizoTimer * 4));
                fl.light.intensity += (fl.baseIntensity * flicker * 0.5 - fl.light.intensity) * 0.12;
                if (fl.bulb && fl.bulb.material && fl.bulb.material.emissiveIntensity !== undefined) {
                    const base = fl.bulb.userData?.baseEmissive ?? 0.8;
                    fl.bulb.material.emissiveIntensity = base * (0.4 + 0.6 * flicker);
                }
            }
            if (this.flashlightOn && Math.random() < 0.12) this.flashlight.intensity *= (0.3 + Math.random() * 0.7);
            if (g.realismPass) {
                const blurX = this.smoothMoveX * 0.5 + this.mouseSpeed * 0.2;
                const blurY = this.smoothMoveY * 0.5 + this.mouseSpeed * 0.2;
                g.realismPass.uniforms.motionBlurX.value += (blurX - g.realismPass.uniforms.motionBlurX.value) * 0.08;
                g.realismPass.uniforms.motionBlurY.value += (blurY - g.realismPass.uniforms.motionBlurY.value) * 0.08;
            }
        } else {
            overlay.classList.remove('active', 'intense');
            if (g.realismPass) {
                g.realismPass.uniforms.sanityGlitch.value += (0 - g.realismPass.uniforms.sanityGlitch.value) * 0.03;
                g.realismPass.uniforms.sanityDarkness.value += (0 - g.realismPass.uniforms.sanityDarkness.value) * 0.03;
                g.realismPass.uniforms.aberration.value += (0.025 - g.realismPass.uniforms.aberration.value) * 0.03;
                g.realismPass.uniforms.redTint.value += (0 - g.realismPass.uniforms.redTint.value) * 0.03;
                g.realismPass.uniforms.distortion.value += (0.15 - g.realismPass.uniforms.distortion.value) * 0.03;
                g.realismPass.uniforms.motionBlurX.value += (0 - g.realismPass.uniforms.motionBlurX.value) * 0.05;
                g.realismPass.uniforms.motionBlurY.value += (0 - g.realismPass.uniforms.motionBlurY.value) * 0.05;
            }
            this.schizoTimer = 0;
            for (const fl of g.flickerLights) {
                if (fl.entityFlashActive) continue;
                const flicker = 0.6 + 0.4 * Math.sin(time * 0.001 * fl.speed + fl.phase);
                const target = fl.baseIntensity * (0.5 + 0.5 * flicker);
                fl.light.intensity += (target - fl.light.intensity) * 0.05;
                if (fl.bulb && fl.bulb.material && fl.bulb.material.emissiveIntensity !== undefined) {
                    const base = fl.bulb.userData?.baseEmissive ?? 0.8;
                    fl.bulb.material.emissiveIntensity = base * (0.6 + 0.4 * flicker);
                }
            }
        }
    }

    handleMouseMove(e, isLocked, isTransitioning, consoleOpen) {
        if (!isLocked || isTransitioning || consoleOpen) return;
        const sens = 0.0018 * Settings.sensitivity;
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

    handleWheel(deltaY, isLocked, isDead, isTransitioning, consoleOpen) {
        if (!isLocked || isDead || isTransitioning || consoleOpen) return;
        if (deltaY < 0) this.flashlightZoom = Math.min(1, this.flashlightZoom + FLASH_ZOOM_STEP);
        else this.flashlightZoom = Math.max(0, this.flashlightZoom - FLASH_ZOOM_STEP);
    }

    onKeyDown(e, consoleOpen) {
        if (consoleOpen) return;
        if (e.key === ' ') e.preventDefault();
        if (e.key === 'Control') e.preventDefault();
        const k = e.key.length === 1 ? e.key.toUpperCase() : e.key;
        this.keys[k] = true;
        if (e.key === 'Shift') this.isSprinting = true;
    }

    onKeyUp(e, consoleOpen) {
        if (consoleOpen) return;
        this.keys[e.key.length === 1 ? e.key.toUpperCase() : e.key] = false;
        if (e.key === 'Shift') this.isSprinting = false;
    }

    toggleFlashlight() {
        this.flashlightOn = !this.flashlightOn;
    }
}

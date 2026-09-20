import * as THREE from 'three';

export class Entity {
    constructor(scene, mazeData, size, half, tileSize, wallHeight, spawnTile) {
        this.scene = scene;
        this.mazeData = mazeData;
        this.size = size;
        this.half = half;
        this.tileSize = tileSize;
        this.wallHeight = wallHeight;

        const sx = Math.max(0, Math.min(size - 1, Math.round(spawnTile.x)));
        const sy = Math.max(0, Math.min(size - 1, Math.round(spawnTile.y)));

        this.position = new THREE.Vector3(
            (sx - half) * tileSize,
            0,
            (sy - half) * tileSize
        );

        this.speed = 3.2;
        this.killRadius = 0.95;
        this.visionRange = 22;
        this.hearingRange = 14;

        this.killEnabled = true;

        this.frames = [];
        this.frameIndex = 0;
        this.frameTime = 0;
        this.frameDuration = 0.05;

        const loader = new THREE.TextureLoader();
        for (let i = 1; i <= 6; i++) {
            const tex = loader.load(`../Game/Entity/New_Textures/e${i}.png`);
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.magFilter = THREE.NearestFilter;
            tex.minFilter = THREE.LinearFilter;
            this.frames.push(tex);
        }

        this.spriteMat = new THREE.SpriteMaterial({
            map: this.frames[0],
            transparent: true,
            depthWrite: false,
            depthTest: true
        });
        this.sprite = new THREE.Sprite(this.spriteMat);

        this.baseWidth = 2.0;
        this.baseHeight = 2.4;
        this.minScale = 0.85;
        this.maxScale = 1.15;
        this.sizeTimer = 0;
        this.sizeInterval = 0.1;
        this.scaleFactor = 1.0;

        this.sprite.scale.set(this.baseWidth, this.baseHeight, 1.0);
        this.sprite.position.set(this.position.x, this.baseHeight / 2, this.position.z);
        scene.add(this.sprite);

        this.tiltTimer = 0;
        this.tiltInterval = 0.2;
        this.tiltTarget = 0;
        this.tiltCurrent = 0;

        this.stepTimer = 0;
        this.stepInterval = 0.35;
        this.stepDistance = 1.3;

        this.currentPath = [];
        this.pathIndex = 0;
        this.repathTimer = 0;
        this.repathInterval = 0.4;

        this.lastKnownPlayerTile = null;
        this.lastSenseTime = -999;
        this.giveUpTime = 3.5;

        this.wanderTimer = 0;
        this.wanderInterval = 2.5 + Math.random() * 2.5;

        this.isActive = true;
        this.onKill = null;
    }

    worldToTile(x, z) {
        return {
            x: Math.max(0, Math.min(this.size - 1, Math.round(x / this.tileSize + this.half))),
            y: Math.max(0, Math.min(this.size - 1, Math.round(z / this.tileSize + this.half)))
        };
    }

    tileToWorld(tx, ty) {
        return {
            x: (tx - this.half) * this.tileSize,
            z: (ty - this.half) * this.tileSize
        };
    }

    hasLineOfSight(playerPos) {
        const start = this.worldToTile(this.position.x, this.position.z);
        const end = this.worldToTile(playerPos.x, playerPos.z);
        let cx = start.x, cy = start.y;
        const dx = end.x - cx, dy = end.y - cy;
        const steps = Math.max(Math.abs(dx), Math.abs(dy));
        if (steps === 0) return true;
        for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            const nx = Math.round(start.x + dx * t);
            const ny = Math.round(start.y + dy * t);
            if (nx === cx && ny === cy) continue;
            if (!this.mazeData[cy] || !this.mazeData[cy][cx]) return false;
            const cell = this.mazeData[cy][cx];
            if (nx > cx && cell.right) return false;
            if (nx < cx && cell.left) return false;
            if (ny > cy && cell.bottom) return false;
            if (ny < cy && cell.top) return false;
            cx = nx; cy = ny;
        }
        return true;
    }

    findPath(startTile, goalTile) {
        const size = this.size;
        const data = this.mazeData;
        const sx = Math.max(0, Math.min(size - 1, Math.round(startTile.x)));
        const sy = Math.max(0, Math.min(size - 1, Math.round(startTile.y)));
        const gx = Math.max(0, Math.min(size - 1, Math.round(goalTile.x)));
        const gy = Math.max(0, Math.min(size - 1, Math.round(goalTile.y)));

        if (sx === gx && sy === gy) return [];
        if (!data[sy] || !data[sy][sx]) return [];
        if (!data[gy] || !data[gy][gx]) return [];

        const visited = Array.from({ length: size }, () => Array(size).fill(false));
        const parent  = Array.from({ length: size }, () => Array(size).fill(null));
        const queue = [{ x: sx, y: sy }];
        visited[sy][sx] = true;

        let qi = 0, found = false;
        while (qi < queue.length) {
            const { x, y } = queue[qi++];
            if (x === gx && y === gy) { found = true; break; }
            const cell = data[y] && data[y][x];
            if (!cell) continue;
            const nbs = [];
            if (!cell.top && y > 0)           nbs.push({ x,       y: y - 1 });
            if (!cell.bottom && y < size - 1) nbs.push({ x,       y: y + 1 });
            if (!cell.left && x > 0)          nbs.push({ x: x - 1, y });
            if (!cell.right && x < size - 1)  nbs.push({ x: x + 1, y });
            for (const d of nbs) {
                if (d.y < 0 || d.y >= size || d.x < 0 || d.x >= size) continue;
                if (!visited[d.y]) continue;
                if (!visited[d.y][d.x]) {
                    visited[d.y][d.x] = true;
                    parent[d.y][d.x] = { x, y };
                    queue.push(d);
                }
            }
        }
        if (!found) return [];
        const path = [];
        let cur = { x: gx, y: gy };
        let guard = 0;
        while (parent[cur.y] && parent[cur.y][cur.x] && guard++ < size * size) {
            path.unshift(cur);
            cur = parent[cur.y][cur.x];
        }
        return path;
    }

    pickWanderTile(fromTile) {
        let bestTile = null;
        for (let attempts = 0; attempts < 40; attempts++) {
            const rx = Math.floor(Math.random() * this.size);
            const ry = Math.floor(Math.random() * this.size);
            const d = Math.abs(rx - fromTile.x) + Math.abs(ry - fromTile.y);
            if (d >= 3 && d <= 8) { bestTile = { x: rx, y: ry }; break; }
        }
        if (!bestTile) {
            bestTile = {
                x: Math.floor(Math.random() * this.size),
                y: Math.floor(Math.random() * this.size)
            };
        }
        return bestTile;
    }

    doStep() {
        let remaining = this.stepDistance;
        while (remaining > 0 && this.currentPath.length > 0 && this.pathIndex < this.currentPath.length) {
            const nextTile = this.currentPath[this.pathIndex];
            const target = this.tileToWorld(nextTile.x, nextTile.y);
            const dx = target.x - this.position.x;
            const dz = target.z - this.position.z;
            const d = Math.hypot(dx, dz);
            if (d <= remaining) {
                this.position.x = target.x;
                this.position.z = target.z;
                remaining -= d;
                this.pathIndex++;
            } else {
                this.position.x += (dx / d) * remaining;
                this.position.z += (dz / d) * remaining;
                remaining = 0;
            }
        }
    }

    update(dt, playerPos, playerFlashlightOn, playerJustJumped, playerSanity, gameTime) {
        if (!this.isActive) return;

        this.frameTime += dt;
        if (this.frameTime >= this.frameDuration) {
            this.frameTime -= this.frameDuration;
            this.frameIndex = (this.frameIndex + 1) % this.frames.length;
            this.spriteMat.map = this.frames[this.frameIndex];
            this.spriteMat.needsUpdate = true;
        }

        this.sizeTimer += dt;
        if (this.sizeTimer >= this.sizeInterval) {
            this.sizeTimer -= this.sizeInterval;
            this.scaleFactor = this.minScale + Math.random() * (this.maxScale - this.minScale);
        }
        const w = this.baseWidth * this.scaleFactor;
        const h = this.baseHeight * this.scaleFactor;
        this.sprite.scale.set(w, h, 1.0);
        this.sprite.position.set(this.position.x, h / 2, this.position.z);

        this.tiltTimer += dt;
        if (this.tiltTimer >= this.tiltInterval) {
            this.tiltTimer -= this.tiltInterval;
            const tilts = [-0.4, 0.4];
            this.tiltTarget = tilts[Math.floor(Math.random() * tilts.length)];
        }
        this.tiltCurrent += (this.tiltTarget - this.tiltCurrent) * 0.3;
        this.spriteMat.rotation = this.tiltCurrent;

        const dx = playerPos.x - this.position.x;
        const dz = playerPos.z - this.position.z;
        const distToPlayer = Math.hypot(dx, dz);
        const sanityBelowF = playerSanity < 16;

        let sensed = false;
        if (sanityBelowF) sensed = true;
        else if (playerFlashlightOn && distToPlayer < this.visionRange && this.hasLineOfSight(playerPos)) sensed = true;
        else if (playerJustJumped) sensed = true;

        if (sensed) {
            const playerTile = this.worldToTile(playerPos.x, playerPos.z);
            if (playerJustJumped && !playerFlashlightOn && !sanityBelowF) {
                const ox = Math.floor((Math.random() - 0.5) * 3);
                const oy = Math.floor((Math.random() - 0.5) * 3);
                this.lastKnownPlayerTile = {
                    x: Math.max(0, Math.min(this.size - 1, playerTile.x + ox)),
                    y: Math.max(0, Math.min(this.size - 1, playerTile.y + oy))
                };
            } else {
                this.lastKnownPlayerTile = playerTile;
            }
            this.lastSenseTime = gameTime;
            this.wanderTimer = 0;
        }

        if (this.lastKnownPlayerTile && !sanityBelowF) {
            const et = this.worldToTile(this.position.x, this.position.z);
            const reached = (et.x === this.lastKnownPlayerTile.x && et.y === this.lastKnownPlayerTile.y);
            if (reached && (gameTime - this.lastSenseTime) > this.giveUpTime) {
                this.lastKnownPlayerTile = null;
                this.currentPath = [];
                this.pathIndex = 0;
                this.wanderTimer = 0;
            }
        }

        if (this.lastKnownPlayerTile) {
            this.repathTimer += dt;
            if (this.repathTimer >= this.repathInterval) {
                this.repathTimer = 0;
                const et = this.worldToTile(this.position.x, this.position.z);
                this.currentPath = this.findPath(et, this.lastKnownPlayerTile);
                this.pathIndex = 0;
            }
        } else {
            this.wanderTimer += dt;
            const reachedEnd = this.currentPath.length === 0 || this.pathIndex >= this.currentPath.length;
            if (this.wanderTimer >= this.wanderInterval || reachedEnd) {
                this.wanderTimer = 0;
                this.wanderInterval = 2.5 + Math.random() * 2.5;
                const et = this.worldToTile(this.position.x, this.position.z);
                const wanderTile = this.pickWanderTile(et);
                this.currentPath = this.findPath(et, wanderTile);
                this.pathIndex = 0;
            }
        }

        this.stepTimer += dt;
        if (this.stepTimer >= this.stepInterval) {
            this.stepTimer -= this.stepInterval;
            this.doStep();
        }

        if (this.killEnabled && distToPlayer < this.killRadius && this.onKill) {
            this.onKill();
        }
    }

    dispose() {
        this.isActive = false;
        this.scene.remove(this.sprite);
        for (const f of this.frames) f.dispose();
        this.spriteMat.dispose();
    }
}

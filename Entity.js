import * as THREE from 'three';

export class Entity {
    constructor(scene, mazeData, size, half, tileSize, wallHeight, spawnTile) {
        this.scene = scene;
        this.mazeData = mazeData;
        this.size = size;
        this.half = half;
        this.tileSize = tileSize;
        this.wallHeight = wallHeight;

        this.position = new THREE.Vector3(
            (spawnTile.x - half) * tileSize,
            0,
            (spawnTile.y - half) * tileSize
        );

        this.speed = 3.2; 
        this.killRadius = 0.85;
        this.visionRange = 22;
        this.hearingRange = 14;

        this.frames = [];
        this.frameIndex = 0;
        this.frameTime = 0;
        this.frameDuration = 0.5;

        const loader = new THREE.TextureLoader();
        for (let i = 1; i <= 4; i++) {
            const tex = loader.load(`e${i}.png`);
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
        const spriteHeight = 2.0;
        this.sprite.scale.set(1.8, spriteHeight, 1.0);
        this.sprite.position.set(this.position.x, spriteHeight / 2, this.position.z);
        scene.add(this.sprite);

        this.currentPath = [];
        this.pathIndex = 0;
        this.repathTimer = 0;
        this.repathInterval = 0.4;

        this.lastKnownPlayerTile = null;
        this.lastSenseTime = -999;
        this.giveUpTime = 3.5;

        this.isActive = true;
        this.onKill = null;
    }

    worldToTile(x, z) {
        return {
            x: Math.round(x / this.tileSize + this.half),
            y: Math.round(z / this.tileSize + this.half)
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
        if (startTile.x === goalTile.x && startTile.y === goalTile.y) return [];
        const visited = Array.from({ length: size }, () => Array(size).fill(false));
        const parent = Array.from({ length: size }, () => Array(size).fill(null));
        const queue = [{ x: startTile.x, y: startTile.y }];
        visited[startTile.y][startTile.x] = true;
        let qi = 0, found = false;
        while (qi < queue.length) {
            const { x, y } = queue[qi++];
            if (x === goalTile.x && y === goalTile.y) { found = true; break; }
            const cell = data[y][x];
            const nbs = [];
            if (!cell.top && y > 0) nbs.push({ x, y: y - 1 });
            if (!cell.bottom && y < size - 1) nbs.push({ x, y: y + 1 });
            if (!cell.left && x > 0) nbs.push({ x: x - 1, y });
            if (!cell.right && x < size - 1) nbs.push({ x: x + 1, y });
            for (const d of nbs) {
                if (!visited[d.y][d.x]) {
                    visited[d.y][d.x] = true;
                    parent[d.y][d.x] = { x, y };
                    queue.push(d);
                }
            }
        }
        if (!found) return [];
        const path = [];
        let cur = { x: goalTile.x, y: goalTile.y };
        while (parent[cur.y][cur.x]) { path.unshift(cur); cur = parent[cur.y][cur.x]; }
        return path;
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

        this.sprite.position.set(this.position.x, this.sprite.scale.y / 2, this.position.z);

        const dx = playerPos.x - this.position.x;
        const dz = playerPos.z - this.position.z;
        const distToPlayer = Math.hypot(dx, dz);
        const sanityBelowF = playerSanity < 16;

        let sensed = false;
        if (sanityBelowF) sensed = true;
        else if (playerFlashlightOn && distToPlayer < this.visionRange && this.hasLineOfSight(playerPos)) sensed = true;
        else if (playerJustJumped && distToPlayer < this.hearingRange) sensed = true;

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
        }

        if (this.lastKnownPlayerTile && !sanityBelowF) {
            const et = this.worldToTile(this.position.x, this.position.z);
            const reached = (et.x === this.lastKnownPlayerTile.x && et.y === this.lastKnownPlayerTile.y);
            if (reached && (gameTime - this.lastSenseTime) > this.giveUpTime) {
                this.lastKnownPlayerTile = null;
                this.currentPath = [];
                this.pathIndex = 0;
            }
        }

        this.repathTimer += dt;
        if (this.repathTimer >= this.repathInterval && this.lastKnownPlayerTile) {
            this.repathTimer = 0;
            const et = this.worldToTile(this.position.x, this.position.z);
            this.currentPath = this.findPath(et, this.lastKnownPlayerTile);
            this.pathIndex = 0;
        }

        if (this.currentPath.length > 0 && this.pathIndex < this.currentPath.length) {
            const nextTile = this.currentPath[this.pathIndex];
            const target = this.tileToWorld(nextTile.x, nextTile.y);
            const tdx = target.x - this.position.x;
            const tdz = target.z - this.position.z;
            const d = Math.hypot(tdx, tdz);
            if (d < 0.12) {
                this.pathIndex++;
            } else {
                const move = Math.min(this.speed * dt, d);
                this.position.x += (tdx / d) * move;
                this.position.z += (tdz / d) * move;
            }
        }

        if (distToPlayer < this.killRadius && this.onKill) this.onKill();
    }

    dispose() {
        this.isActive = false;
        this.scene.remove(this.sprite);
        for (const f of this.frames) f.dispose();
        this.spriteMat.dispose();
    }
}

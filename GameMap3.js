import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { generateTunnelMaze, bfs, findFurthestCell } from './GameMap1.js';

function generateSewerMaze(size) {
    const grid = generateTunnelMaze(size);

    for (let y = 1; y < size - 1; y++) {
        for (let x = 1; x < size - 1; x++) {
            if (Math.random() < 0.5 && grid[y][x].top) {
                grid[y][x].top = false;
                grid[y - 1][x].bottom = false;
            }
            if (Math.random() < 0.5 && grid[y][x].left) {
                grid[y][x].left = false;
                grid[y][x - 1].right = false;
            }
        }
    }
    return grid;
}

function createSewerWallTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#3a4238';
    ctx.fillRect(0, 0, 512, 512);

    const bw = 100, bh = 55;
    for (let y = 0; y < 512; y += bh) {
        for (let x = 0; x < 512; x += bw) {
            const offset = (Math.floor(y / bh) % 2) * (bw / 2);
            const px = x + offset - bw / 2;
            const shade = 50 + Math.random() * 30;
            const g = shade + Math.random() * 12;
            ctx.fillStyle = `rgb(${shade},${g},${shade - 5})`;
            ctx.fillRect(px + 2, y + 2, bw - 4, bh - 4);

            for (let i = 0; i < 18; i++) {
                ctx.fillStyle = `rgba(40, ${80 + Math.random() * 40}, 40, ${0.15 + Math.random() * 0.35})`;
                ctx.fillRect(
                    px + 2 + Math.random() * (bw - 10),
                    y + 2 + Math.random() * (bh - 10),
                    2 + Math.random() * 8, 2 + Math.random() * 8
                );
            }
        }
    }

    for (let i = 0; i < 60; i++) {
        const sx = Math.random() * 512;
        const sy = Math.random() * 512;
        const len = 30 + Math.random() * 120;
        const grad = ctx.createLinearGradient(sx, sy, sx, sy + len);
        grad.addColorStop(0, `rgba(20, 30, 20, ${0.2 + Math.random() * 0.4})`);
        grad.addColorStop(1, 'rgba(20, 30, 20, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(sx - 3, sy, 6, len);
    }

    for (let i = 0; i < 25; i++) {
        const cx = Math.random() * 512;
        const cy = Math.random() * 512;
        const r = 20 + Math.random() * 60;
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        grad.addColorStop(0, `rgba(10, 20, 10, ${0.2 + Math.random() * 0.3})`);
        grad.addColorStop(1, 'rgba(10, 20, 10, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 2);
    tex.anisotropy = 16;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

function createSewerFloorTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#2a3630';
    ctx.fillRect(0, 0, 512, 512);

    const tile = 64;
    for (let y = 0; y < 512; y += tile) {
        for (let x = 0; x < 512; x += tile) {
            const shade = 30 + Math.random() * 20;
            ctx.fillStyle = `rgb(${shade},${shade + 8},${shade - 2})`;
            ctx.fillRect(x + 1, y + 1, tile - 2, tile - 2);

            // Algae
            for (let i = 0; i < 15; i++) {
                ctx.fillStyle = `rgba(30, ${70 + Math.random() * 50}, 40, ${0.1 + Math.random() * 0.3})`;
                ctx.fillRect(
                    x + Math.random() * tile, y + Math.random() * tile,
                    3 + Math.random() * 10, 3 + Math.random() * 8
                );
            }

            ctx.strokeStyle = `rgba(5, 10, 5, 0.5)`;
            ctx.lineWidth = 1;
            ctx.strokeRect(x, y, tile, tile);
        }
    }

    for (let i = 0; i < 40; i++) {
        const cx = Math.random() * 512;
        const cy = Math.random() * 512;
        const r = 15 + Math.random() * 50;
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        grad.addColorStop(0, `rgba(20, 60, 40, ${0.15 + Math.random() * 0.25})`);
        grad.addColorStop(1, 'rgba(20, 60, 40, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(4, 4);
    tex.anisotropy = 16;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

function createSewerCeilTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#1a221c';
    ctx.fillRect(0, 0, 512, 512);

    for (let i = 0; i < 200; i++) {
        ctx.fillStyle = `rgba(${10 + Math.random() * 20}, ${25 + Math.random() * 30}, ${15 + Math.random() * 20}, ${0.2 + Math.random() * 0.4})`;
        ctx.beginPath();
        ctx.arc(Math.random() * 512, Math.random() * 512, 1 + Math.random() * 4, 0, Math.PI * 2);
        ctx.fill();
    }

    for (let i = 0; i < 8; i++) {
        const cx = Math.random() * 512;
        const cy = Math.random() * 512;
        const r = 40 + Math.random() * 80;
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        grad.addColorStop(0, `rgba(30, 70, 40, ${0.1 + Math.random() * 0.15})`);
        grad.addColorStop(1, 'rgba(30, 70, 40, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 3);
    tex.anisotropy = 8;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

export function generateMap3(scene, size, wallHeight, tileSize) {
    const half = (size - 1) / 2;
    const data = generateSewerMaze(size);

    let start = { x: Math.floor(Math.random() * size), y: Math.floor(Math.random() * size) };
    let exit = findFurthestCell(data, start.x, start.y, size);
    if (exit.x === start.x && exit.y === start.y) {
        start = { x: Math.floor(Math.random() * size), y: Math.floor(Math.random() * size) };
        exit = findFurthestCell(data, start.x, start.y, size);
    }
    const spawnPos = { x: (start.x - half) * tileSize, z: (start.y - half) * tileSize };
    const exitPos = { x: (exit.x - half) * tileSize, z: (exit.y - half) * tileSize };

    const { dist } = bfs(data, exit.x, exit.y, size);
    let maxDist = 0;
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            if (dist[y][x] !== Infinity && dist[y][x] > maxDist) maxDist = dist[y][x];
        }
    }
    if (maxDist === 0) maxDist = 1;

    const wallTexs = [createSewerWallTexture(), createSewerWallTexture(), createSewerWallTexture()];
    const floorTex = createSewerFloorTexture();
    const ceilTex = createSewerCeilTexture();

    const group = new THREE.Group();
    scene.add(group);

    const floorMat = new THREE.MeshStandardMaterial({
        map: floorTex, roughness: 0.75, metalness: 0.1, side: THREE.DoubleSide
    });
    const totalSize = size * tileSize;
    const floorGeo = new THREE.PlaneGeometry(totalSize, totalSize);
    floorGeo.rotateX(-Math.PI / 2);
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.position.set(0, 0, 0);
    floorMesh.receiveShadow = true;
    group.add(floorMesh);

    const ceilMat = new THREE.MeshStandardMaterial({
        map: ceilTex, roughness: 0.9, metalness: 0.0, side: THREE.DoubleSide
    });
    const ceilGeo = new THREE.PlaneGeometry(totalSize, totalSize);
    ceilGeo.rotateX(Math.PI / 2);
    const ceilMesh = new THREE.Mesh(ceilGeo, ceilMat);
    ceilMesh.position.set(0, wallHeight, 0);
    ceilMesh.receiveShadow = true;
    group.add(ceilMesh);

    const wallMatCache = {};
    function getWallMat(variant, brightness) {
        const key = variant + '_' + brightness.toFixed(2);
        if (!wallMatCache[key]) {
            wallMatCache[key] = new THREE.MeshStandardMaterial({
                map: wallTexs[variant],
                roughness: 0.7 + Math.random() * 0.15,
                metalness: 0.08 + Math.random() * 0.05,
                color: new THREE.Color(brightness, brightness, brightness)
            });
        }
        return wallMatCache[key];
    }

    const hWallGeo = new THREE.BoxGeometry(tileSize, wallHeight, 0.12);
    const vWallGeo = new THREE.BoxGeometry(0.12, wallHeight, tileSize);
    const wallMeshes = [];

    for (let y = 0; y <= size; y++) {
        for (let x = 0; x < size; x++) {
            const hasWall = (y === 0 || y === size) ? true : data[y][x].top;
            if (hasWall) {
                let cellX, cellY;
                if (y === 0) { cellX = x; cellY = 0; }
                else if (y === size) { cellX = x; cellY = size - 1; }
                else { cellX = x; cellY = y - 1; }
                const d = dist[cellY]?.[cellX] ?? 0;
                const brightness = 0.2 + 0.8 * (1 - d / maxDist);
                const px = (x - half) * tileSize;
                const pz = (y - half - 0.5) * tileSize;
                const wall = new THREE.Mesh(hWallGeo, getWallMat(Math.floor(Math.random() * 3), brightness));
                const pos = new THREE.Vector3(px, wallHeight / 2, pz);
                wall.position.copy(pos);
                wall.castShadow = true;
                wall.receiveShadow = true;
                wall.userData.origPos = pos.clone();
                wall.userData.shiftOffset = new THREE.Vector3(0, 0, 0);
                group.add(wall);
                wallMeshes.push(wall);
            }
        }
    }
    for (let y = 0; y < size; y++) {
        for (let x = 0; x <= size; x++) {
            const hasWall = (x === 0 || x === size) ? true : data[y][x].left;
            if (hasWall) {
                let cellX, cellY;
                if (x === 0) { cellX = 0; cellY = y; }
                else if (x === size) { cellX = size - 1; cellY = y; }
                else { cellX = x - 1; cellY = y; }
                const d = dist[cellY]?.[cellX] ?? 0;
                const brightness = 0.2 + 0.8 * (1 - d / maxDist);
                const px = (x - half - 0.5) * tileSize;
                const pz = (y - half) * tileSize;
                const wall = new THREE.Mesh(vWallGeo, getWallMat(Math.floor(Math.random() * 3), brightness));
                const pos = new THREE.Vector3(px, wallHeight / 2, pz);
                wall.position.copy(pos);
                wall.castShadow = true;
                wall.receiveShadow = true;
                wall.userData.origPos = pos.clone();
                wall.userData.shiftOffset = new THREE.Vector3(0, 0, 0);
                group.add(wall);
                wallMeshes.push(wall);
            }
        }
    }

    const waterGeo = new THREE.PlaneGeometry(totalSize, totalSize);
    const waterReflector = new Reflector(waterGeo, {
        clipBias: 0.003,
        textureWidth: 512,
        textureHeight: 512,
        color: 0x1a3a28
    });
    waterReflector.rotation.x = -Math.PI / 2;
    waterReflector.position.y = 0.08;
    waterReflector.userData.isWater = true;
    waterReflector.userData.totalSize = totalSize;

    waterReflector.material.uniforms.time = { value: 0 };
    waterReflector.material.uniforms.playerPos = { value: new THREE.Vector2(0.5, 0.5) };

    waterReflector.material.fragmentShader = `
        uniform vec3 color;
        uniform sampler2D tDiffuse;
        uniform float time;
        uniform vec2 playerPos;
        varying vec4 vUv;

        float ripple(vec2 p, float t) {
            // Ambient rolling waves
            float d1 = length(p - vec2(0.5, 0.5));
            float w1 = sin(d1 * 22.0 - t * 2.5) * 0.4;
            // Player wake
            float d2 = length(p - playerPos);
            float w2 = sin(d2 * 45.0 - t * 7.0) * exp(-d2 * 4.0) * 2.2;
            return w1 + w2;
        }

        void main() {
            vec2 uv = vUv.xy / vUv.w;

            float r = ripple(uv, time);
            // Distort reflection UVs
            vec2 offset = vec2(
                sin(uv.y * 30.0 + time * 1.5) * 0.0025 + r * 0.004,
                cos(uv.x * 25.0 + time * 1.2) * 0.0025 + r * 0.004
            );
            vec2 distortedUv = uv + offset;

            vec4 base = texture2D(tDiffuse, distortedUv);

            // Green murky tint
            vec3 tinted = base.rgb * color;

            // Depth-like murk gradient
            float murk = 0.15 + 0.08 * sin(time * 0.6);
            tinted = mix(tinted, vec3(0.06, 0.16, 0.10), murk);

            // Ripple highlights (the shiny peaks of waves)
            float highlight = abs(r) * 0.18;
            tinted += vec3(0.08, 0.22, 0.12) * highlight;

            gl_FragColor = vec4(tinted, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
        }
    `;
    waterReflector.material.needsUpdate = true;

    group.add(waterReflector);

    const pipeMat = new THREE.MeshStandardMaterial({ color: 0x2a3028, roughness: 0.6, metalness: 0.5 });
    const pipeMat2 = new THREE.MeshStandardMaterial({ color: 0x1e2820, roughness: 0.75, metalness: 0.3 });

    for (let i = 0; i < 14; i++) {
        const x = Math.floor(Math.random() * size);
        const y = Math.floor(Math.random() * size);
        const px = (x - half) * tileSize + (Math.random() - 0.5) * tileSize * 0.6;
        const pz = (y - half) * tileSize + (Math.random() - 0.5) * tileSize * 0.6;
        const pipe = new THREE.Mesh(
            new THREE.CylinderGeometry(0.15, 0.15, wallHeight * 0.9, 10),
            Math.random() > 0.5 ? pipeMat : pipeMat2
        );
        pipe.position.set(px, wallHeight / 2, pz);
        pipe.castShadow = true;
        pipe.receiveShadow = true;
        group.add(pipe);
    }
  
    for (let i = 0; i < 8; i++) {
        const x = Math.floor(Math.random() * (size - 4)) + 2;
        const y = Math.floor(Math.random() * size);
        const px = (x - half) * tileSize;
        const pz = (y - half) * tileSize;
        const len = 3 + Math.random() * 5;
        const pipe = new THREE.Mesh(
            new THREE.CylinderGeometry(0.12, 0.12, len * tileSize, 10),
            pipeMat
        );
        pipe.rotation.z = Math.PI / 2;
        pipe.position.set(px + (len * tileSize) / 2, wallHeight - 0.3, pz);
        pipe.castShadow = true;
        group.add(pipe);
    }

    const lightMat = new THREE.MeshStandardMaterial({ color: 0x90ff99, emissive: 0x40aa60, emissiveIntensity: 0.9 });
    const lightSources = [];
    const flickerLights = [];
    for (let i = 0; i < 16; i++) {
        const x = Math.floor(Math.random() * size);
        const y = Math.floor(Math.random() * size);
        const px = (x - half) * tileSize + (Math.random() - 0.5) * tileSize * 0.4;
        const pz = (y - half) * tileSize + (Math.random() - 0.5) * tileSize * 0.4;
        const dSpawn = Math.sqrt((px - spawnPos.x) ** 2 + (pz - spawnPos.z) ** 2);
        if (dSpawn < 3) continue;
        const lightBulb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), lightMat);
        lightBulb.position.set(px, wallHeight - 0.18, pz);
        group.add(lightBulb);
        const light = new THREE.PointLight(0x66ff88, 0.7 + Math.random() * 0.5, 5 + Math.random() * 3);
        light.position.set(px, wallHeight - 0.22, pz);
        group.add(light);
        lightSources.push({ light, position: new THREE.Vector3(px, wallHeight - 0.22, pz) });
        flickerLights.push({
            light, bulb: lightBulb,
            phase: Math.random() * 100,
            speed: 0.5 + Math.random() * 1.5,
            baseIntensity: 0.5 + Math.random() * 0.7
        });
    }

    const exitLight = new THREE.PointLight(0xff6633, 3.5, 9, 1.5);
    exitLight.position.set(exitPos.x, 1.0, exitPos.z);
    group.add(exitLight);
    lightSources.push({ light: exitLight, position: new THREE.Vector3(exitPos.x, 1.0, exitPos.z) });

    return {
        group, data, spawnPos, exitPos, lightSources, flickerLights, wallMeshes,
        waterReflector, totalSize
    };
}

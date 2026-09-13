import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { bfs } from './GameMap1.js';

function generateHallwayMaze(size) {
    const grid = [];
    for (let y = 0; y < size; y++) {
        grid[y] = [];
        for (let x = 0; x < size; x++) {
            grid[y][x] = { x, y, top: true, right: true, bottom: true, left: true };
        }
    }

    for (let y = 0; y < size; y += 2) {
        for (let x = 0; x < size - 1; x++) {
            grid[y][x].right = false;
            grid[y][x + 1].left = false;
        }
    }

    for (let y = 1; y < size - 1; y += 2) {
        const numConnectors = 1 + Math.floor(Math.random() * 3);
        const usedX = new Set();
        for (let i = 0; i < numConnectors; i++) {
            let cx;
            let attempts = 0;
            do {
                cx = 1 + Math.floor(Math.random() * (size - 2));
                attempts++;
            } while (usedX.has(cx) && attempts < 20);
            usedX.add(cx);

            grid[y - 1][cx].bottom = false;
            grid[y][cx].top = false;
            grid[y][cx].bottom = false;
            grid[y + 1][cx].top = false;
        }
    }

    return grid;
}

function createSewerWallTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#2a3228';
    ctx.fillRect(0, 0, 512, 512);

    const bw = 100, bh = 55;
    for (let y = 0; y < 512; y += bh) {
        for (let x = 0; x < 512; x += bw) {
            const offset = (Math.floor(y / bh) % 2) * (bw / 2);
            const px = x + offset - bw / 2;
            const shade = 36 + Math.random() * 22;
            const g = shade + Math.random() * 10;
            ctx.fillStyle = `rgb(${shade},${g},${shade - 4})`;
            ctx.fillRect(px + 2, y + 2, bw - 4, bh - 4);
            for (let i = 0; i < 18; i++) {
                ctx.fillStyle = `rgba(30, ${60 + Math.random() * 30}, 30, ${0.15 + Math.random() * 0.35})`;
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
        grad.addColorStop(0, `rgba(15, 22, 15, ${0.2 + Math.random() * 0.4})`);
        grad.addColorStop(1, 'rgba(15, 22, 15, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(sx - 3, sy, 6, len);
    }

    for (let i = 0; i < 25; i++) {
        const cx = Math.random() * 512;
        const cy = Math.random() * 512;
        const r = 20 + Math.random() * 60;
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        grad.addColorStop(0, `rgba(8, 15, 8, ${0.2 + Math.random() * 0.3})`);
        grad.addColorStop(1, 'rgba(8, 15, 8, 0)');
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
    ctx.fillStyle = '#1e2620'; 
    ctx.fillRect(0, 0, 512, 512);

    const tile = 64;
    for (let y = 0; y < 512; y += tile) {
        for (let x = 0; x < 512; x += tile) {
            const shade = 22 + Math.random() * 14;
            ctx.fillStyle = `rgb(${shade},${shade + 6},${shade - 2})`;
            ctx.fillRect(x + 1, y + 1, tile - 2, tile - 2);

            for (let i = 0; i < 15; i++) {
                ctx.fillStyle = `rgba(25, ${55 + Math.random() * 40}, 32, ${0.1 + Math.random() * 0.3})`;
                ctx.fillRect(
                    x + Math.random() * tile, y + Math.random() * tile,
                    3 + Math.random() * 10, 3 + Math.random() * 8
                );
            }

            ctx.strokeStyle = `rgba(4, 8, 4, 0.55)`;
            ctx.lineWidth = 1;
            ctx.strokeRect(x, y, tile, tile);
        }
    }

    for (let i = 0; i < 40; i++) {
        const cx = Math.random() * 512;
        const cy = Math.random() * 512;
        const r = 15 + Math.random() * 50;
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        grad.addColorStop(0, `rgba(15, 45, 30, ${0.15 + Math.random() * 0.25})`);
        grad.addColorStop(1, 'rgba(15, 45, 30, 0)');
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
    ctx.fillStyle = '#0f1410';
    ctx.fillRect(0, 0, 512, 512);

    for (let i = 0; i < 200; i++) {
        ctx.fillStyle = `rgba(${8 + Math.random() * 14}, ${20 + Math.random() * 22}, ${12 + Math.random() * 16}, ${0.2 + Math.random() * 0.4})`;
        ctx.beginPath();
        ctx.arc(Math.random() * 512, Math.random() * 512, 1 + Math.random() * 4, 0, Math.PI * 2);
        ctx.fill();
    }

    for (let i = 0; i < 8; i++) {
        const cx = Math.random() * 512;
        const cy = Math.random() * 512;
        const r = 40 + Math.random() * 80;
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        grad.addColorStop(0, `rgba(20, 45, 28, ${0.08 + Math.random() * 0.12})`);
        grad.addColorStop(1, 'rgba(20, 45, 28, 0)');
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
    const data = generateHallwayMaze(size);

    const start = {
        x: Math.floor(Math.random() * size),
        y: Math.floor(Math.random() * (size / 2)) * 2
    };

    const { dist: distFromStart } = bfs(data, start.x, start.y, size);
    let exit = { x: start.x, y: start.y };
    let maxDist = -1;
    for (let y = 0; y < size; y += 2) {
        for (let x = 0; x < size; x++) {
            if (distFromStart[y][x] !== Infinity && distFromStart[y][x] > maxDist) {
                maxDist = distFromStart[y][x];
                exit = { x, y };
            }
        }
    }

    const spawnPos = { x: (start.x - half) * tileSize, z: (start.y - half) * tileSize };
    const exitPos = { x: (exit.x - half) * tileSize, z: (exit.y - half) * tileSize };

    const { dist } = bfs(data, exit.x, exit.y, size);
    let maxDistGlobal = 0;
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            if (dist[y][x] !== Infinity && dist[y][x] > maxDistGlobal) maxDistGlobal = dist[y][x];
        }
    }
    if (maxDistGlobal === 0) maxDistGlobal = 1;

    const wallTexs = [createSewerWallTexture(), createSewerWallTexture(), createSewerWallTexture()];
    const floorTex = createSewerFloorTexture();
    const ceilTex = createSewerCeilTexture();

    const group = new THREE.Group();
    scene.add(group);

    const totalSize = size * tileSize;

    const floorMat = new THREE.MeshStandardMaterial({
        map: floorTex, roughness: 0.75, metalness: 0.1, side: THREE.DoubleSide
    });
    const floorGeo = new THREE.PlaneGeometry(totalSize, totalSize);
    floorGeo.rotateX(-Math.PI / 2);
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.position.set(0, -0.5, 0);
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
                roughness: 0.85 + Math.random() * 0.08,  
                metalness: 0.02 + Math.random() * 0.02,
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
                const brightness = 0.15 + 0.47 * (1 - d / maxDistGlobal);
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
                const brightness = 0.15 + 0.47 * (1 - d / maxDistGlobal);
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

    let waterReflector = null;
    try {
        const waterGeo = new THREE.PlaneGeometry(totalSize, totalSize);
        waterReflector = new Reflector(waterGeo, {
            clipBias: 0.003,
            textureWidth: 512,
            textureHeight: 512,
            color: 0x0f1e16  
        });
        waterReflector.rotation.x = -Math.PI / 2;
        waterReflector.position.y = 0.05;
        group.add(waterReflector);
    } catch (err) {
        console.warn('[Map3] Reflector failed, using fallback', err);
        const fallbackMat = new THREE.MeshStandardMaterial({
            color: 0x101e16, roughness: 0.3, metalness: 0.5, side: THREE.DoubleSide
        });
        const fallback = new THREE.Mesh(new THREE.PlaneGeometry(totalSize, totalSize), fallbackMat);
        fallback.rotation.x = -Math.PI / 2;
        fallback.position.y = 0.05;
        group.add(fallback);
    }

    const tintMat = new THREE.MeshBasicMaterial({
        color: 0x081410,
        transparent: true,
        opacity: 0.28, 
        depthWrite: false
    });
    const tintPlane = new THREE.Mesh(new THREE.PlaneGeometry(totalSize, totalSize), tintMat);
    tintPlane.rotation.x = -Math.PI / 2;
    tintPlane.position.y = 0.06;
    group.add(tintPlane);

    const pipeMat = new THREE.MeshStandardMaterial({ color: 0x1a201c, roughness: 0.7, metalness: 0.4 });
    const pipeMat2 = new THREE.MeshStandardMaterial({ color: 0x121a14, roughness: 0.8, metalness: 0.25 });

    for (let i = 0; i < 18; i++) {
        const x = Math.floor(Math.random() * size);
        const y = Math.floor(Math.random() * size);
        const px = (x - half) * tileSize + (Math.random() - 0.5) * tileSize * 0.7;
        const pz = (y - half) * tileSize + (Math.random() - 0.5) * tileSize * 0.7;
        const pipe = new THREE.Mesh(
            new THREE.CylinderGeometry(0.14, 0.14, wallHeight * 0.92, 10),
            Math.random() > 0.5 ? pipeMat : pipeMat2
        );
        pipe.position.set(px, wallHeight / 2, pz);
        pipe.castShadow = true;
        pipe.receiveShadow = true;
        group.add(pipe);
    }

    const housingMat = new THREE.MeshStandardMaterial({
        color: 0x10140f,
        roughness: 0.75,
        metalness: 0.5
    });
    const tubeMat = new THREE.MeshStandardMaterial({
        color: 0x6acc7a,
        emissive: 0x2a7a40,
        emissiveIntensity: 0.65,  
        roughness: 0.5,
        metalness: 0.2
    });

    const lightSources = [];
    const flickerLights = [];

    for (let y = 0; y < size; y += 2) {
        let cursorX = 1 + Math.floor(Math.random() * 2);
        while (cursorX < size - 2) {
            const remaining = size - 1 - cursorX;
            if (remaining < 2) break;

            const maxLen = Math.min(remaining, 6);
            const len = 2 + Math.floor(Math.random() * (maxLen - 1));

            const centerCellX = cursorX + (len - 1) / 2;
            const px = (centerCellX - half) * tileSize;
            const pz = (y - half) * tileSize;
            const barLength = len * tileSize * 0.9;

            const housingGeo = new THREE.BoxGeometry(barLength + 0.2, 0.14, 0.3);
            const housing = new THREE.Mesh(housingGeo, housingMat);
            housing.position.set(px, wallHeight - 0.09, pz);
            housing.castShadow = true;
            group.add(housing);

            const tubeGeo = new THREE.BoxGeometry(barLength, 0.08, 0.22);
            const tube = new THREE.Mesh(tubeGeo, tubeMat.clone());
            tube.position.set(px, wallHeight - 0.17, pz);
            group.add(tube);

            const light = new THREE.PointLight(0x55cc77, 0.32, 3.5 + len * 0.8, 1.3);
            light.position.set(px, wallHeight - 0.5, pz);
            group.add(light);

            lightSources.push({ light, position: new THREE.Vector3(px, wallHeight - 0.5, pz) });
            flickerLights.push({
                light,
                bulb: tube,
                phase: Math.random() * 100,
                speed: 0.5 + Math.random() * 1.5,
                baseIntensity: 0.28 + Math.random() * 0.15
            });

            cursorX += len;
            if (Math.random() < 0.3) cursorX += 1;
        }
    }

    const exitLight = new THREE.PointLight(0xff6633, 2.2, 7, 1.5);
    exitLight.position.set(exitPos.x, 1.0, exitPos.z);
    group.add(exitLight);
    lightSources.push({ light: exitLight, position: new THREE.Vector3(exitPos.x, 1.0, exitPos.z) });

    return {
        group, data, spawnPos, exitPos, lightSources, flickerLights, wallMeshes,
        waterReflector: null,
        totalSize
    };
}

import * as THREE from 'three';
import { generateTunnelMaze, bfs, findFurthestCell } from './GameMap1.js';

function createWoodWallTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#7a5d3f';
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 120; i++) {
        const y = Math.random() * 512;
        const shade = 50 + Math.random() * 70;
        ctx.strokeStyle = `rgb(${shade},${shade-20},${shade-35})`;
        ctx.lineWidth = 1 + Math.random() * 3;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(512, y + (Math.random() - 0.5) * 25);
        ctx.stroke();
    }
    for (let i = 0; i < 25; i++) {
        const cx = Math.random() * 512, cy = Math.random() * 512, r = 6 + Math.random() * 22;
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        grad.addColorStop(0, '#4a3222');
        grad.addColorStop(1, 'rgba(122,93,63,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 2);
    tex.anisotropy = 16;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

function createWoodFloorTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#5d3f2a';
    ctx.fillRect(0, 0, 512, 512);
    const plankH = 44;
    for (let y = 0; y < 512; y += plankH) {
        const shade = 70 + Math.random() * 35;
        ctx.fillStyle = `rgb(${shade},${shade-18},${shade-25})`;
        ctx.fillRect(0, y, 512, plankH - 2);
        ctx.fillStyle = 'rgba(0,0,0,0.08)';
        ctx.fillRect(0, y + plankH - 2, 512, 2);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 3);
    tex.anisotropy = 16;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

function createWoodCeilTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#4d3520';
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 100; i++) {
        const y = Math.random() * 512;
        const shade = 40 + Math.random() * 50;
        ctx.strokeStyle = `rgb(${shade},${shade-15},${shade-25})`;
        ctx.lineWidth = 1 + Math.random() * 2;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(512, y + (Math.random() - 0.5) * 18);
        ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 2);
    tex.anisotropy = 8;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

export function generateMap2(scene, size, wallHeight, tileSize) {
    const half = (size - 1) / 2;
    const data = generateTunnelMaze(size);

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

    const wallTexs = [createWoodWallTexture(), createWoodWallTexture(), createWoodWallTexture()];
    const floorTex = createWoodFloorTexture();
    const ceilTex = createWoodCeilTexture();

    const group = new THREE.Group();
    scene.add(group);

    const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.92, metalness: 0.02, side: THREE.DoubleSide });
    const totalSize = size * tileSize;
    const floorGeo = new THREE.PlaneGeometry(totalSize, totalSize);
    floorGeo.rotateX(-Math.PI / 2);
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.receiveShadow = true;
    floorMesh.castShadow = true;
    group.add(floorMesh);

    const ceilMat = new THREE.MeshStandardMaterial({ map: ceilTex, roughness: 0.95, metalness: 0.0, side: THREE.DoubleSide });
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
                roughness: 0.84 + Math.random() * 0.12,
                metalness: 0.02 + Math.random() * 0.03,
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

    const lightMat = new THREE.MeshStandardMaterial({ color: 0xffdd88, emissive: 0xffaa44, emissiveIntensity: 0.8 });
    const lightSources = [];
    const flickerLights = [];
    for (let i = 0; i < 14; i++) {
        const x = Math.floor(Math.random() * size);
        const y = Math.floor(Math.random() * size);
        const px = (x - half) * tileSize + (Math.random() - 0.5) * tileSize * 0.4;
        const pz = (y - half) * tileSize + (Math.random() - 0.5) * tileSize * 0.4;
        const dSpawn = Math.sqrt((px - spawnPos.x) ** 2 + (pz - spawnPos.z) ** 2);
        if (dSpawn < 3) continue;
        const lightBulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), lightMat);
        lightBulb.position.set(px, wallHeight - 0.15, pz);
        group.add(lightBulb);
        const light = new THREE.PointLight(0xffaa44, 0.9 + Math.random() * 0.6, 5 + Math.random() * 2);
        light.position.set(px, wallHeight - 0.2, pz);
        group.add(light);
        lightSources.push({ light, position: new THREE.Vector3(px, wallHeight - 0.2, pz) });
        flickerLights.push({
            light, bulb: lightBulb,
            phase: Math.random() * 100,
            speed: 0.5 + Math.random() * 1.5,
            baseIntensity: 0.5 + Math.random() * 0.8
        });
    }

    const exitLight = new THREE.PointLight(0xff6633, 3.0, 8, 1.5);
    exitLight.position.set(exitPos.x, 1.0, exitPos.z);
    group.add(exitLight);
    lightSources.push({ light: exitLight, position: new THREE.Vector3(exitPos.x, 1.0, exitPos.z) });

    return { group, data, spawnPos, exitPos, lightSources, flickerLights, wallMeshes };
}

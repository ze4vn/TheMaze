import * as THREE from 'three';
import { generateTunnelMaze, bfs } from './GameMap1.js';

const ROOM_MIN = 5;
const ROOM_MAX = 10;
const DOOR_XS = [7, 8];

const textureLoader = new THREE.TextureLoader();
textureLoader.setCrossOrigin('anonymous');

const WALL_URL = 'https://images-wixmp-ed30a86b8c4ca887773594c2.wixmp.com/f/13f0430c-9c64-4b4d-82be-2acf77c5de20/dg55heh-89af9fdb-e245-4c97-966b-b21162d02ce1.png/v1/fill/w_894,h_894/laboratory_wall_texture_bbtolofe_by_rubythyme012467_dg55heh-pre.png?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1cm46YXBwOjdlMGQxODg5ODIyNjQzNzNhNWYwZDQxNWVhMGQyNmUwIiwiaXNzIjoidXJuOmFwcDo3ZTBkMTg4OTgyMjY0MzczYTVmMGQ0MTVlYTBkMjZlMCIsIm9iaiI6W1t7ImhlaWdodCI6Ijw9MTA4MCIsInBhdGgiOiIvZi8xM2YwNDMwYy05YzY0LTRiNGQtODJiZS0yYWNmNzdjNWRlMjAvZGc1NWhlaC04OWFmOWZkYi1lMjQ1LTRjOTctOTY2Yi1iMjExNjJkMDJjZTEucG5nIiwid2lkdGgiOiI8PTEwODAifV1dLCJhdWQiOlsidXJuOnNlcnZpY2U6aW1hZ2Uub3BlcmF0aW9ucyJdfQ.beN2wrl6-6v-ihJNKDyAnQqvqG8hezfBpGw9dqP5Lus';
const FLOOR_URL = 'https://i.pinimg.com/1200x/a9/2b/8b/a92b8b935dd82f827f96a26a1db7c544.jpg';

function makeWallTexture() {
    const tex = textureLoader.load(
        WALL_URL,
        undefined, undefined,
        () => { console.warn('[Map4] wall texture failed to load'); }
    );
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 1);
    tex.anisotropy = 16;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

function makeFloorTexture() {
    const tex = textureLoader.load(
        FLOOR_URL,
        undefined, undefined,
        () => { console.warn('[Map4] floor texture failed to load'); }
    );
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 2);
    tex.anisotropy = 16;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

function createLabCeilTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#3a3f3c';
    ctx.fillRect(0, 0, 512, 512);
    const panelW = 128, panelH = 64;
    for (let y = 0; y < 512; y += panelH) {
        for (let x = 0; x < 512; x += panelW) {
            const shade = 55 + Math.random() * 25;
            ctx.fillStyle = `rgb(${shade},${shade + 2},${shade})`;
            ctx.fillRect(x + 2, y + 2, panelW - 4, panelH - 4);
            ctx.strokeStyle = 'rgba(20,20,20,0.6)';
            ctx.lineWidth = 2;
            ctx.strokeRect(x + 1, y + 1, panelW - 2, panelH - 2);
        }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 3);
    tex.anisotropy = 8;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

function createBloodPoolTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 512, 512);
    function drawBlob(cx, cy, r, alpha) {
        const points = [];
        const n = 24;
        for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2;
            const rr = r * (0.6 + Math.random() * 0.6);
            points.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr });
        }
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            const p = points[i];
            const prev = points[i - 1];
            ctx.quadraticCurveTo(prev.x, prev.y, (prev.x + p.x) / 2, (prev.y + p.y) / 2);
        }
        ctx.closePath();
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        grad.addColorStop(0, `rgba(120,10,8,${alpha})`);
        grad.addColorStop(0.6, `rgba(80,5,5,${alpha * 0.9})`);
        grad.addColorStop(1, `rgba(40,2,2,${alpha * 0.4})`);
        ctx.fillStyle = grad;
        ctx.fill();
    }
    drawBlob(256, 256, 180, 0.95);
    for (let i = 0; i < 30; i++) {
        drawBlob(Math.random() * 512, Math.random() * 512, 8 + Math.random() * 40, 0.4 + Math.random() * 0.4);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

function createScratchTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 256, 256);
    for (let i = 0; i < 5; i++) {
        ctx.strokeStyle = `rgba(${100 + Math.random() * 40},${5 + Math.random() * 10},${5 + Math.random() * 10},${0.7 + Math.random() * 0.3})`;
        ctx.lineWidth = 1.5 + Math.random() * 2;
        ctx.beginPath();
        const sx = 40 + Math.random() * 60;
        const sy = 20 + Math.random() * 40;
        const ex = 150 + Math.random() * 60;
        const ey = 180 + Math.random() * 60;
        ctx.moveTo(sx, sy);
        ctx.bezierCurveTo(sx + 40, sy + 60, ex - 40, ey - 60, ex, ey);
        ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

function generateLabMaze(size) {
    const grid = generateTunnelMaze(size);

    for (let y = ROOM_MIN; y <= ROOM_MAX; y++) {
        for (let x = ROOM_MIN; x <= ROOM_MAX; x++) {
            grid[y][x].top = false;
            grid[y][x].bottom = false;
            grid[y][x].left = false;
            grid[y][x].right = false;
        }
    }

    for (const dx of DOOR_XS) {
        grid[ROOM_MAX][dx].bottom = false;
        if (grid[ROOM_MAX + 1]) grid[ROOM_MAX + 1][dx].top = false;
    }

    return grid;
}

export function generateMap4(scene, size, wallHeight, tileSize) {
    const half = (size - 1) / 2;
    const data = generateLabMaze(size);

    const exitTile = { x: 7, y: 7 };

    const { dist: distFromExit } = bfs(data, exitTile.x, exitTile.y, size);
    let spawnTile = { x: 1, y: 1 };
    let maxD = -1;
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const inRoom = (x >= ROOM_MIN && x <= ROOM_MAX && y >= ROOM_MIN && y <= ROOM_MAX);
            if (inRoom) continue;
            if (distFromExit[y][x] !== Infinity && distFromExit[y][x] > maxD) {
                maxD = distFromExit[y][x];
                spawnTile = { x, y };
            }
        }
    }

    const spawnPos = { x: (spawnTile.x - half) * tileSize, z: (spawnTile.y - half) * tileSize };
    const exitPos = { x: (exitTile.x - half) * tileSize, z: (exitTile.y - half) * tileSize };

    let maxDistGlobal = 0;
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            if (distFromExit[y][x] !== Infinity && distFromExit[y][x] > maxDistGlobal) {
                maxDistGlobal = distFromExit[y][x];
            }
        }
    }
    if (maxDistGlobal === 0) maxDistGlobal = 1;

    const wallTex = makeWallTexture();
    const floorTex = makeFloorTexture();
    const ceilTex = createLabCeilTexture();

    const group = new THREE.Group();
    scene.add(group);
    const totalSize = size * tileSize;

    const floorMat = new THREE.MeshStandardMaterial({
        map: floorTex, color: 0xffffff, roughness: 0.55, metalness: 0.15, side: THREE.DoubleSide
    });
    const floorGeo = new THREE.PlaneGeometry(totalSize, totalSize);
    floorGeo.rotateX(-Math.PI / 2);
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.position.set(0, -0.02, 0);
    floorMesh.receiveShadow = true;
    group.add(floorMesh);

    const ceilMat = new THREE.MeshStandardMaterial({
        map: ceilTex, roughness: 0.9, metalness: 0.05, side: THREE.DoubleSide
    });
    const ceilGeo = new THREE.PlaneGeometry(totalSize, totalSize);
    ceilGeo.rotateX(Math.PI / 2);
    const ceilMesh = new THREE.Mesh(ceilGeo, ceilMat);
    ceilMesh.position.set(0, wallHeight, 0);
    ceilMesh.receiveShadow = true;
    group.add(ceilMesh);

    const wallMat = new THREE.MeshStandardMaterial({
        map: wallTex,
        color: 0xb8b8b8,
        roughness: 0.78,
        metalness: 0.08
    });

    const hWallGeo = new THREE.BoxGeometry(tileSize, wallHeight, 0.12);
    const vWallGeo = new THREE.BoxGeometry(0.12, wallHeight, tileSize);
    const wallMeshes = [];

    for (let y = 0; y <= size; y++) {
        for (let x = 0; x < size; x++) {
            const hasWall = (y === 0 || y === size) ? true : data[y][x].top;
            if (!hasWall) continue;

            const px = (x - half) * tileSize;
            const pz = (y - half - 0.5) * tileSize;
            const wall = new THREE.Mesh(hWallGeo, wallMat);
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

    for (let y = 0; y < size; y++) {
        for (let x = 0; x <= size; x++) {
            const hasWall = (x === 0 || x === size) ? true : data[y][x].left;
            if (!hasWall) continue;

            const px = (x - half - 0.5) * tileSize;
            const pz = (y - half) * tileSize;
            const wall = new THREE.Mesh(vWallGeo, wallMat);
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

    const barMat = new THREE.MeshStandardMaterial({
        color: 0x1a1d22, roughness: 0.45, metalness: 0.9
    });
    const barGeo = new THREE.CylinderGeometry(0.045, 0.045, wallHeight - 0.1, 6);

    const xW = (ROOM_MIN - half) * tileSize;
    const xE = (ROOM_MAX - half) * tileSize;
    const zN = (ROOM_MIN - half) * tileSize;
    const zS = (ROOM_MAX - half) * tileSize;

    const barPositions = [];
    const barsPerTile = 8;
    const step = tileSize / barsPerTile;

    for (let x = ROOM_MIN; x <= ROOM_MAX; x++) {
        const cx = (x - half) * tileSize;
        for (let i = 0; i < barsPerTile; i++) {
            const ox = (i - (barsPerTile - 1) / 2) * step;
            barPositions.push([cx + ox, zN]);
        }
    }

    for (let x = ROOM_MIN; x <= ROOM_MAX; x++) {
        if (DOOR_XS.includes(x)) continue;
        const cx = (x - half) * tileSize;
        for (let i = 0; i < barsPerTile; i++) {
            const ox = (i - (barsPerTile - 1) / 2) * step;
            barPositions.push([cx + ox, zS]);
        }
    }

    for (let y = ROOM_MIN; y <= ROOM_MAX; y++) {
        const cz = (y - half) * tileSize;
        for (let i = 0; i < barsPerTile; i++) {
            const oz = (i - (barsPerTile - 1) / 2) * step;
            barPositions.push([xW, cz + oz]);
            barPositions.push([xE, cz + oz]);
        }
    }

    const barInstanced = new THREE.InstancedMesh(barGeo, barMat, barPositions.length);
    barInstanced.castShadow = true;
    barInstanced.receiveShadow = true;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < barPositions.length; i++) {
        dummy.position.set(barPositions[i][0], wallHeight / 2, barPositions[i][1]);
        dummy.updateMatrix();
        barInstanced.setMatrixAt(i, dummy.matrix);
    }
    barInstanced.instanceMatrix.needsUpdate = true;
    group.add(barInstanced);

    const cornerGeo = new THREE.BoxGeometry(0.2, wallHeight, 0.2);
    for (const [cx, cz] of [[xW, zN], [xE, zN], [xW, zS], [xE, zS]]) {
        const post = new THREE.Mesh(cornerGeo, barMat);
        post.position.set(cx, wallHeight / 2, cz);
        post.castShadow = true;
        post.receiveShadow = true;
        group.add(post);
    }

    function addRail(x1, z1, x2, z2) {
        const dx = x2 - x1, dz = z2 - z1;
        const len = Math.hypot(dx, dz);
        const geo = new THREE.BoxGeometry(len, 0.08, 0.08);
        for (const y of [0.06, wallHeight - 0.08]) {
            const m = new THREE.Mesh(geo, barMat);
            m.position.set((x1 + x2) / 2, y, (z1 + z2) / 2);
            m.rotation.y = Math.atan2(-dz, dx);
            m.castShadow = true;
            group.add(m);
        }
    }
    addRail(xW, zN, xE, zN);
    addRail(xW, zS, xE, zS);
    addRail(xW, zN, xW, zS);
    addRail(xE, zN, xE, zS);

    const bloodTex = createBloodPoolTexture();
    const bloodMat = new THREE.MeshBasicMaterial({
        map: bloodTex, transparent: true, depthWrite: false, opacity: 0.95
    });
    const bloodGeo = new THREE.PlaneGeometry(14, 14);
    bloodGeo.rotateX(-Math.PI / 2);
    const bloodMesh = new THREE.Mesh(bloodGeo, bloodMat);
    bloodMesh.position.set(0, 0.03, 0);
    bloodMesh.renderOrder = 2;
    group.add(bloodMesh);

    const scratchTex = createScratchTexture();
    const scratchMatBase = new THREE.MeshBasicMaterial({
        map: scratchTex, transparent: true, opacity: 0.9, depthWrite: false
    });
    const scratchWalls = [
        { pos: [0, wallHeight / 2, zN + 0.08], rotY: 0 },
        { pos: [xW + 0.08, wallHeight / 2, 0], rotY: Math.PI / 2 },
        { pos: [xE - 0.08, wallHeight / 2, 0], rotY: -Math.PI / 2 }
    ];
    for (const sp of scratchWalls) {
        for (let i = 0; i < 4; i++) {
            const s = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), scratchMatBase.clone());
            s.position.set(
                sp.pos[0] + (Math.random() - 0.5) * 4,
                sp.pos[1] + (Math.random() - 0.5) * 0.8,
                sp.pos[2] + (Math.random() - 0.5) * 3
            );
            s.rotation.y = sp.rotY;
            s.renderOrder = 3;
            group.add(s);
        }
    }

    const metalMat = new THREE.MeshStandardMaterial({ color: 0x2a2e33, roughness: 0.55, metalness: 0.7 });
    const leatherMat = new THREE.MeshStandardMaterial({ color: 0x3a2518, roughness: 0.85, metalness: 0.05 });

    const tableGroup = new THREE.Group();
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.9), metalMat);
    top.position.y = 0.95;
    top.castShadow = true; top.receiveShadow = true;
    tableGroup.add(top);
    for (const lx of [-0.9, 0.9]) for (const lz of [-0.35, 0.35]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.95, 6), metalMat);
        leg.position.set(lx, 0.475, lz);
        leg.castShadow = true;
        tableGroup.add(leg);
    }
    for (const rx of [-0.9, -0.35, 0.35, 0.9]) {
        const strap = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.85), leatherMat);
        strap.position.set(rx, 1.02, 0);
        strap.castShadow = true;
        tableGroup.add(strap);
    }
    const tableBlood = new THREE.Mesh(
        new THREE.PlaneGeometry(1.6, 0.7),
        new THREE.MeshBasicMaterial({ map: bloodTex.clone(), transparent: true, opacity: 0.85, depthWrite: false })
    );
    tableBlood.rotation.x = -Math.PI / 2;
    tableBlood.position.y = 1.02;
    tableBlood.renderOrder = 3;
    tableGroup.add(tableBlood);
    group.add(tableGroup);

    const ivGroup = new THREE.Group();
    const ivPole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.8, 6), metalMat);
    ivPole.position.y = 0.9; ivPole.castShadow = true;
    ivGroup.add(ivPole);
    const ivBase = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.04, 8), metalMat);
    ivBase.position.y = 0.02;
    ivGroup.add(ivBase);
    const ivBag = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 0.4, 0.06),
        new THREE.MeshStandardMaterial({ color: 0x8a0505, roughness: 0.3, metalness: 0.1, transparent: true, opacity: 0.85 })
    );
    ivBag.position.set(0, 1.6, 0);
    ivGroup.add(ivBag);
    ivGroup.position.set(1.5, 0, 0.5);
    group.add(ivGroup);

    const propList = [];
    for (let i = 0; i < 12; i++) {
        const x = Math.floor(Math.random() * size);
        const y = Math.floor(Math.random() * size);
        if (x >= ROOM_MIN && x <= ROOM_MAX && y >= ROOM_MIN && y <= ROOM_MAX) continue;
        propList.push({ type: 'table', x: (x - half) * tileSize + (Math.random() - 0.5) * 0.8, z: (y - half) * tileSize + (Math.random() - 0.5) * 0.8 });
    }
    for (let i = 0; i < 10; i++) {
        const x = Math.floor(Math.random() * size);
        const y = Math.floor(Math.random() * size);
        if (x >= ROOM_MIN && x <= ROOM_MAX && y >= ROOM_MIN && y <= ROOM_MAX) continue;
        propList.push({ type: 'monitor', x: (x - half) * tileSize + (Math.random() - 0.5) * 0.8, z: (y - half) * tileSize + (Math.random() - 0.5) * 0.8 });
    }
    for (let i = 0; i < 8; i++) {
        const x = Math.floor(Math.random() * size);
        const y = Math.floor(Math.random() * size);
        if (x >= ROOM_MIN && x <= ROOM_MAX && y >= ROOM_MIN && y <= ROOM_MAX) continue;
        propList.push({ type: 'cabinet', x: (x - half) * tileSize + (Math.random() - 0.5) * 0.8, z: (y - half) * tileSize + (Math.random() - 0.5) * 0.8 });
    }

    for (const p of propList) {
        if (p.type === 'table') {
            const g = new THREE.Group();
            const t = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, 0.8),
                new THREE.MeshStandardMaterial({ color: 0x3a4048, roughness: 0.4, metalness: 0.8 }));
            t.position.y = 0.85; t.castShadow = true; t.receiveShadow = true;
            g.add(t);
            for (const lx of [-0.6, 0.6]) for (const lz of [-0.3, 0.3]) {
                const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.85, 6),
                    new THREE.MeshStandardMaterial({ color: 0x1a1e22, roughness: 0.5, metalness: 0.85 }));
                leg.position.set(lx, 0.425, lz);
                leg.castShadow = true;
                g.add(leg);
            }
            g.position.set(p.x, 0, p.z);
            g.rotation.y = Math.random() * Math.PI * 2;
            group.add(g);
        } else if (p.type === 'monitor') {
            const g = new THREE.Group();
            const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.06, 12),
                new THREE.MeshStandardMaterial({ color: 0x111316, roughness: 0.6, metalness: 0.5 }));
            stand.position.y = 0.03;
            g.add(stand);
            const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.2, 6),
                new THREE.MeshStandardMaterial({ color: 0x111316, roughness: 0.6 }));
            pole.position.y = 0.15;
            g.add(pole);
            const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 0.04),
                new THREE.MeshStandardMaterial({ color: 0x0a0c0e, roughness: 0.5, metalness: 0.4 }));
            body.position.y = 0.45; body.castShadow = true;
            g.add(body);
            const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.38),
                new THREE.MeshBasicMaterial({ color: 0x223344 }));
            glow.position.set(0, 0.45, 0.021);
            g.add(glow);
            g.position.set(p.x, 0, p.z);
            g.rotation.y = Math.random() * Math.PI * 2;
            group.add(g);
        } else {
            const cab = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.2, 0.5),
                new THREE.MeshStandardMaterial({ color: 0x50565c, roughness: 0.65, metalness: 0.6 }));
            cab.position.set(p.x, 0.6, p.z);
            cab.rotation.y = Math.random() * Math.PI * 2;
            cab.castShadow = true; cab.receiveShadow = true;
            group.add(cab);
        }
    }

    const lightSources = [];
    const flickerLights = [];

    const lightPanelMat = new THREE.MeshBasicMaterial({ color: 0xdfe8f5 });
    const lightFrameMat = new THREE.MeshStandardMaterial({ color: 0x2a2e33, roughness: 0.6, metalness: 0.5 });

    for (let y = 1; y < size; y += 4) {
        for (let x = 1; x < size; x += 4) {
            const px = (x - half) * tileSize;
            const pz = (y - half) * tileSize;

            const frame = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.12, 0.5), lightFrameMat);
            frame.position.set(px, wallHeight - 0.08, pz);
            group.add(frame);

            const panel = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.05, 0.4), lightPanelMat.clone());
            panel.position.set(px, wallHeight - 0.16, pz);
            group.add(panel);

            const inRoom = (x >= ROOM_MIN && x <= ROOM_MAX && y >= ROOM_MIN && y <= ROOM_MAX);
            const light = new THREE.PointLight(0xddeeff, inRoom ? 0.35 : 0.55, 7, 1.6);
            light.position.set(px, wallHeight - 0.35, pz);

            group.add(light);

            lightSources.push({ light, position: new THREE.Vector3(px, wallHeight - 0.35, pz) });
            flickerLights.push({
                light, bulb: panel,
                phase: Math.random() * 100,
                speed: 0.5 + Math.random() * 1.5,
                baseIntensity: inRoom ? 0.30 : 0.50
            });
        }
    }

    const surgLight = new THREE.PointLight(0xffffff, 1.1, 6, 1.5);
    surgLight.position.set(0, wallHeight - 0.8, 0);
    surgLight.castShadow = true;
    surgLight.shadow.mapSize.set(1024, 1024);
    surgLight.shadow.camera.near = 0.1;
    surgLight.shadow.camera.far = 7;
    surgLight.shadow.bias = -0.002;
    group.add(surgLight);

    const surgDisk = new THREE.Mesh(
        new THREE.CircleGeometry(0.5, 24),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    surgDisk.position.set(0, wallHeight - 0.55, 0);
    surgDisk.rotation.x = -Math.PI / 2;
    group.add(surgDisk);

    const exitLight = new THREE.PointLight(0xff6633, 2.2, 6, 1.5);
    exitLight.position.set(exitPos.x, 1.0, exitPos.z);
    group.add(exitLight);
    lightSources.push({ light: exitLight, position: new THREE.Vector3(exitPos.x, 1.0, exitPos.z) });

    return {
        group, data, spawnPos, exitPos, lightSources, flickerLights, wallMeshes,
        waterReflector: null,
        totalSize
    };
}

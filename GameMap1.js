import * as THREE from 'three'; 
function createConcreteWallTexture(baseGray, mortarGray) {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = mortarGray;
    ctx.fillRect(0, 0, 512, 512);
    const bw = 112, bh = 60;
    const rows = Math.ceil(512 / bh) + 1, cols = Math.ceil(512 / bw) + 1;
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const offset = (r % 2) * (bw / 2);
            const x = c * bw + offset - (bw / 2);
            const y = r * bh;
            const shift = (Math.random() - 0.5) * 22;
            const g = Math.max(0, Math.min(255, baseGray + shift));
            ctx.fillStyle = `rgb(${g},${g},${g})`;
            ctx.fillRect(x, y, bw - 3, bh - 3);
            ctx.fillStyle = 'rgba(0,0,0,0.2)';
            ctx.fillRect(x, y, bw - 3, 2);
            ctx.fillRect(x, y + bh - 5, bw - 3, 2);
            ctx.fillRect(x, y, 2, bh - 3);
            ctx.fillRect(x + bw - 5, y, 2, bh - 3);
            for (let i = 0; i < 10; i++) {
                ctx.fillStyle = `rgba(0,0,0,${0.06 + Math.random() * 0.14})`;
                ctx.fillRect(x + Math.random() * (bw - 8), y + Math.random() * (bh - 6), 3 + Math.random() * 6, 2 + Math.random() * 4);
            }
        }
    }
    for (let i = 0; i < 20; i++) {
        const sx = Math.random() * 512, sy = Math.random() * 512, rad = 30 + Math.random() * 80;
        const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, rad);
        grad.addColorStop(0, `rgba(10,10,10,${0.12 + Math.random() * 0.2})`);
        grad.addColorStop(1, 'rgba(10,10,10,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(sx - rad, sy - rad, rad * 2, rad * 2);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2.4, 2.4);
    tex.anisotropy = 16;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

function createFloorTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#28282a';
    ctx.fillRect(0, 0, 512, 512);
    const tile = 64;
    for (let y = 0; y < 512; y += tile) {
        for (let x = 0; x < 512; x += tile) {
            const shade = 35 + Math.random() * 25;
            ctx.fillStyle = `rgb(${shade},${shade},${shade+2})`;
            ctx.fillRect(x + 1, y + 1, tile - 2, tile - 2);
            ctx.strokeStyle = `rgba(0,0,0,${0.08 + Math.random() * 0.08})`;
            ctx.lineWidth = 1;
            ctx.strokeRect(x, y, tile, tile);
        }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(4, 4);
    tex.anisotropy = 16;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

function createCeilTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#121214';
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 4000; i++) {
        const s = 1 + Math.random() * 3;
        const sh = 12 + Math.random() * 12;
        ctx.fillStyle = `rgba(${sh},${sh},${sh},0.3)`;
        ctx.fillRect(Math.random() * 512, Math.random() * 512, s, s);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 3);
    tex.anisotropy = 8;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

export function generateTunnelMaze(size) {
    const grid = [];
    for (let y = 0; y < size; y++) {
        grid[y] = [];
        for (let x = 0; x < size; x++) {
            grid[y][x] = { x, y, top: true, right: true, bottom: true, left: true, visited: false };
        }
    }
    const dirs = [
        { dx: 0, dy: -1, wall: 'top', opp: 'bottom' },
        { dx: 0, dy: 1, wall: 'bottom', opp: 'top' },
        { dx: -1, dy: 0, wall: 'left', opp: 'right' },
        { dx: 1, dy: 0, wall: 'right', opp: 'left' }
    ];
    const sx = Math.floor(Math.random() * size);
    const sy = Math.floor(Math.random() * size);
    grid[sy][sx].visited = true;
    const stack = [{ x: sx, y: sy }];
    while (stack.length > 0) {
        const current = stack[stack.length - 1];
        const { x, y } = current;
        const neighbors = [];
        for (const d of dirs) {
            const nx = x + d.dx, ny = y + d.dy;
            if (nx >= 0 && nx < size && ny >= 0 && ny < size && !grid[ny][nx].visited) {
                neighbors.push({ x: nx, y: ny, dir: d });
            }
        }
        if (neighbors.length === 0) { stack.pop(); continue; }
        const next = neighbors[Math.floor(Math.random() * neighbors.length)];
        grid[y][x][next.dir.wall] = false;
        grid[next.y][next.x][next.dir.opp] = false;
        grid[next.y][next.x].visited = true;
        stack.push({ x: next.x, y: next.y });
        if (Math.random() < 0.7) {
            let steps = 2 + Math.floor(Math.random() * 6);
            let cx = next.x, cy = next.y, lastDir = next.dir;
            for (let s = 0; s < steps; s++) {
                if (Math.random() < 0.3) {
                    const altDirs = dirs.filter(d => !(d.dx === -lastDir.dx && d.dy === -lastDir.dy));
                    lastDir = altDirs[Math.floor(Math.random() * altDirs.length)];
                }
                const tx = cx + lastDir.dx, ty = cy + lastDir.dy;
                if (tx < 0 || tx >= size || ty < 0 || ty >= size) break;
                if (grid[ty][tx].visited) break;
                grid[cy][cx][lastDir.wall] = false;
                grid[ty][tx][lastDir.opp] = false;
                grid[ty][tx].visited = true;
                stack.push({ x: tx, y: ty });
                cx = tx; cy = ty;
            }
        }
    }
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            if (!grid[y][x].visited) grid[y][x].visited = true;
        }
    }
    for (let y = 1; y < size - 1; y++) {
        for (let x = 1; x < size - 1; x++) {
            if (Math.random() < 0.28 && grid[y][x].top) {
                grid[y][x].top = false;
                grid[y - 1][x].bottom = false;
            }
            if (Math.random() < 0.28 && grid[y][x].left) {
                grid[y][x].left = false;
                grid[y][x - 1].right = false;
            }
        }
    }
    return grid;
}

export function bfs(grid, startX, startY, size) {
    const dist = Array.from({ length: size }, () => Array(size).fill(Infinity));
    const parent = Array.from({ length: size }, () => Array(size).fill(null));
    dist[startY][startX] = 0;
    const queue = [{ x: startX, y: startY }];
    let qi = 0;
    while (qi < queue.length) {
        const { x, y } = queue[qi++];
        const cell = grid[y][x];
        const d0 = dist[y][x];
        const dirs = [];
        if (!cell.top && y > 0) dirs.push({ x, y: y - 1 });
        if (!cell.bottom && y < size - 1) dirs.push({ x, y: y + 1 });
        if (!cell.left && x > 0) dirs.push({ x: x - 1, y });
        if (!cell.right && x < size - 1) dirs.push({ x: x + 1, y });
        for (const d of dirs) {
            if (dist[d.y][d.x] > d0 + 1) {
                dist[d.y][d.x] = d0 + 1;
                parent[d.y][d.x] = { x, y };
                queue.push(d);
            }
        }
    }
    return { dist, parent };
}

export function findFurthestCell(grid, startX, startY, size) {
    const { dist } = bfs(grid, startX, startY, size);
    let maxDist = -1, bestX = startX, bestY = startY;
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            if (dist[y][x] !== Infinity && dist[y][x] > maxDist) {
                maxDist = dist[y][x];
                bestX = x; bestY = y;
            }
        }
    }
    return { x: bestX, y: bestY };
}

// ─── MAIN EXPORT ────────────────────────────────────────────────
export function generateMap1(scene, size, wallHeight, tileSize) {
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

    const wallTexs = [
        createConcreteWallTexture(74, 26),
        createConcreteWallTexture(64, 22),
        createConcreteWallTexture(80, 30)
    ];
    const floorTex = createFloorTexture();
    const ceilTex = createCeilTexture();

    const group = new THREE.Group();
    scene.add(group);

    // Floor
    const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.92, metalness: 0.02, side: THREE.DoubleSide });
    const totalSize = size * tileSize;
    const floorGeo = new THREE.PlaneGeometry(totalSize, totalSize);
    floorGeo.rotateX(-Math.PI / 2);
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.position.set(0, 0, 0);
    floorMesh.receiveShadow = true;
    floorMesh.castShadow = true;
    group.add(floorMesh);

    // Ceiling
    const ceilMat = new THREE.MeshStandardMaterial({ map: ceilTex, roughness: 0.95, metalness: 0.0, side: THREE.DoubleSide });
    const ceilGeo = new THREE.PlaneGeometry(totalSize, totalSize);
    ceilGeo.rotateX(Math.PI / 2);
    const ceilMesh = new THREE.Mesh(ceilGeo, ceilMat);
    ceilMesh.position.set(0, wallHeight, 0);
    ceilMesh.receiveShadow = true;
    group.add(ceilMesh);

    // Walls
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
    for (let i = 0; i < 12; i++) {
        const x = Math.floor(Math.random() * size);
        const y = Math.floor(Math.random() * size);
        const px = (x - half) * tileSize + (Math.random() - 0.5) * tileSize * 0.4;
        const pz = (y - half) * tileSize + (Math.random() - 0.5) * tileSize * 0.4;
        const dSpawn = Math.sqrt((px - spawnPos.x) ** 2 + (pz - spawnPos.z) ** 2);
        if (dSpawn < 3) continue;
        const lightBulb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), lightMat);
        lightBulb.position.set(px, wallHeight - 0.15, pz);
        group.add(lightBulb);
        const light = new THREE.PointLight(0xffaa44, 0.8 + Math.random() * 0.6, 4 + Math.random() * 3);
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

    const exitLight = new THREE.PointLight(0xff6633, 2.5, 8, 1.5);
    exitLight.position.set(exitPos.x, 1.0, exitPos.z);
    group.add(exitLight);
    lightSources.push({ light: exitLight, position: new THREE.Vector3(exitPos.x, 1.0, exitPos.z) });

    return { group, data, spawnPos, exitPos, lightSources, flickerLights, wallMeshes };
}

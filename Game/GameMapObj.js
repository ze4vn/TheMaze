import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

let _cachedOBJ = null;
let _cachedURL = null;

export function preloadMapObj(url) {
    if (_cachedOBJ && _cachedURL === url) return Promise.resolve(_cachedOBJ);
    return new Promise((resolve, reject) => {
        const loader = new OBJLoader();
        loader.load(
            url,
            (obj) => {
                _cachedOBJ = obj;
                _cachedURL = url;
                console.log('[MapObj] Loaded', url);
                resolve(obj);
            },
            undefined,
            (err) => { console.warn('[MapObj] Load failed', err); reject(err); }
        );
    });
}

export function generateMapObj(scene, size, wallHeight, tileSize) {
    const half = (size - 1) / 2;
    const worldMin = -half * tileSize;
    const worldMax =  half * tileSize;

    const group = new THREE.Group();
    scene.add(group);

    function fallbackData() {
        const d = [];
        for (let y = 0; y < size; y++) {
            d[y] = [];
            for (let x = 0; x < size; x++) {
                d[y][x] = { x, y, top: false, right: false, bottom: false, left: false };
            }
        }
        return d;
    }

    function clampToWorld(v3) {
        return new THREE.Vector3(
            Math.max(worldMin, Math.min(worldMax, v3.x)),
            v3.y || 0,
            Math.max(worldMin, Math.min(worldMax, v3.z))
        );
    }

    if (!_cachedOBJ) {
        console.warn('[MapObj] No preloaded OBJ — using empty fallback');
        return {
            group, data: fallbackData(),
            spawnPos: { x: -10, z: -10 }, exitPos: { x: 10, z: 10 },
            entitySpawnPos: { x: 10, z: -10 },
            lightSources: [], flickerLights: [], wallMeshes: [],
            waterReflector: null, totalSize: size * tileSize
        };
    }

    const obj = _cachedOBJ.clone(true);
    group.add(obj);
    obj.updateMatrixWorld(true);

    let bbox = new THREE.Box3().setFromObject(obj);
    let bboxSize = bbox.getSize(new THREE.Vector3());
    const expectedSize = size * tileSize;

    const maxDim = Math.max(bboxSize.x, bboxSize.z);
    console.log('[MapObj] OBJ size:', bboxSize.x.toFixed(1), 'x', bboxSize.z.toFixed(1));
    console.log('[MapObj] OBJ bounds: min', bbox.min.toArray().map(v => v.toFixed(1)),
                'max', bbox.max.toArray().map(v => v.toFixed(1)));

    if (maxDim > 0 && (maxDim > expectedSize * 5 || maxDim < expectedSize * 0.2)) {
        const scale = expectedSize / maxDim;
        console.log('[MapObj] ⚠ Auto-scaling by', scale.toFixed(4));
        obj.scale.multiplyScalar(scale);
        obj.updateMatrixWorld(true);
        bbox = new THREE.Box3().setFromObject(obj);
        bboxSize = bbox.getSize(new THREE.Vector3());
        console.log('[MapObj] Scaled size:', bboxSize.x.toFixed(1), 'x', bboxSize.z.toFixed(1));
    }

    let meshCount = 0, forcedMatCount = 0;
    const forcedMat = new THREE.MeshStandardMaterial({
        color: 0x8a8a8a,
        roughness: 0.85,
        metalness: 0.05,
        side: THREE.DoubleSide
    });

    obj.traverse((c) => {
        if (!c.isMesh) return;
        meshCount++;

        const m = c.material;
        const usable = m && (
            (m.map) ||
            (m.color && (m.color.r > 0.01 || m.color.g > 0.01 || m.color.b > 0.01))
        );

        if (!usable) {
            c.material = forcedMat;
            forcedMatCount++;
        } else {
            if (m.side !== THREE.DoubleSide) {
                m.side = THREE.DoubleSide;
            }
        }
        c.castShadow = true;
        c.receiveShadow = true;
        c.visible = true;
    });
    console.log('[MapObj] Meshes:', meshCount, '| forced materials:', forcedMatCount);

    const SPAWN_ALIASES  = ['spawn', 'player_spawn', 'playerspawn', 'playerstart', 'player_start', 'start_point', 'startpoint', 'start'];
    const ENTITY_ALIASES = ['entityspawn', 'spawnentity', 'entity_spawn', 'entities', 'monsterspawn', 'monster_spawn', 'monster', 'enemyspawn', 'enemy_spawn', 'entity', 'enemy'];
    const EXIT_ALIASES   = ['exit', 'exit_point', 'exitpoint', 'goal', 'finish', 'end'];

    function nameMatches(name, aliases) {
        if (!name) return false;
        const n = name.toLowerCase();
        for (const a of aliases) if (n === a) return true;
        for (const a of aliases) if (n.includes(a)) return true;
        return false;
    }

    let spawnMarker = null, entityMarker = null, exitMarker = null;
    obj.traverse((c) => {
        const ownName = (c.name || '').toLowerCase();
        const parentName = (c.parent && c.parent.name) ? c.parent.name.toLowerCase() : '';
        for (const nm of [ownName, parentName]) {
            if (!nm) continue;
            if (!spawnMarker && nameMatches(nm, SPAWN_ALIASES)) { spawnMarker = c; break; }
            if (!entityMarker && nameMatches(nm, ENTITY_ALIASES)) { entityMarker = c; break; }
            if (!exitMarker && nameMatches(nm, EXIT_ALIASES)) { exitMarker = c; break; }
        }
    });

    console.log('[MapObj] Markers found — spawn:', !!spawnMarker, 'entity:', !!entityMarker, 'exit:', !!exitMarker);

    function markerCenter(mesh) {
        if (!mesh) return null;
        const b = new THREE.Box3().setFromObject(mesh);
        const sz = b.getSize(new THREE.Vector3());

        if (sz.x < 0.01 && sz.y < 0.01 && sz.z < 0.01) return null;
        const c = new THREE.Vector3();
        b.getCenter(c);
        return c;
    }

    const rawSpawn  = markerCenter(spawnMarker);
    const rawExit   = markerCenter(exitMarker);
    const rawEntity = markerCenter(entityMarker);

    if (rawSpawn)  console.log('[MapObj] spawn bbox center:', rawSpawn.x.toFixed(1), rawSpawn.z.toFixed(1));
    if (rawExit)   console.log('[MapObj] exit bbox center:', rawExit.x.toFixed(1), rawExit.z.toFixed(1));
    if (rawEntity) console.log('[MapObj] entity bbox center:', rawEntity.x.toFixed(1), rawEntity.z.toFixed(1));

    const corners = [
        new THREE.Vector3(bbox.min.x * 0.8, 0, bbox.min.z * 0.8),
        new THREE.Vector3(bbox.max.x * 0.8, 0, bbox.min.z * 0.8),
        new THREE.Vector3(bbox.min.x * 0.8, 0, bbox.max.z * 0.8),
        new THREE.Vector3(bbox.max.x * 0.8, 0, bbox.max.z * 0.8)
    ];

    let spawnPos = rawSpawn ? clampToWorld(rawSpawn) : clampToWorld(corners[0].clone());

    let exitPos = null;
    if (rawExit && rawExit.distanceTo(spawnPos) >= 12) {
        exitPos = clampToWorld(rawExit);
    } else {
        console.warn('[MapObj] Exit marker too close — using farthest corner');
        let best = corners[0], bestD = -1;
        for (const c of corners) {
            const d = c.distanceTo(spawnPos);
            if (d > bestD) { bestD = d; best = c; }
        }
        exitPos = clampToWorld(best.clone());
    }

    let entityPos = null;
    if (rawEntity && rawEntity.distanceTo(spawnPos) >= 12 && rawEntity.distanceTo(exitPos) >= 8) {
        entityPos = clampToWorld(rawEntity);
    } else {
        console.warn('[MapObj] Entity marker too close — using other corner');
        let best = null, bestScore = -1;
        for (const c of corners) {
            const cc = clampToWorld(c.clone());
            const score = Math.min(cc.distanceTo(spawnPos), cc.distanceTo(exitPos));
            if (score > bestScore) { bestScore = score; best = c; }
        }
        entityPos = clampToWorld(best.clone());
    }

    console.log('[MapObj] FINAL:');
    console.log('   spawn:  [' + spawnPos.x.toFixed(1) + ', ' + spawnPos.z.toFixed(1) + ']');
    console.log('   exit:   [' + exitPos.x.toFixed(1) + ', ' + exitPos.z.toFixed(1) + ']');
    console.log('   entity: [' + entityPos.x.toFixed(1) + ', ' + entityPos.z.toFixed(1) + ']');

    [spawnMarker, entityMarker, exitMarker].forEach((m) => {
        if (!m) return;
        m.visible = false;
        m.raycast = () => {};
    });

    const raycaster = new THREE.Raycaster();
    raycaster.far = 0.5;
    const origin = new THREE.Vector3();

    function edgeHasWall(wx, wz, dx, dz) {
        origin.set(wx, 1.5, wz); 
        const dir = new THREE.Vector3(dx, 0, dz).normalize();
        raycaster.set(origin, dir);
        const hits = raycaster.intersectObject(obj, true);
        return hits.length > 0;
    }

    const data = [];
    const halfTile = tileSize * 0.5;
    for (let ty = 0; ty < size; ty++) {
        data[ty] = [];
        for (let tx = 0; tx < size; tx++) {
            const wx = (tx - half) * tileSize;
            const wz = (ty - half) * tileSize;
            data[ty][tx] = {
                x: tx, y: ty,
                top:    edgeHasWall(wx, wz, 0, -1),
                bottom: edgeHasWall(wx, wz, 0, 1),
                left:   edgeHasWall(wx, wz, -1, 0),
                right:  edgeHasWall(wx, wz, 1, 0),
            };
        }
    }

    let wallCount = 0;
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const c = data[y][x];
            if (c.top) wallCount++;
            if (c.bottom) wallCount++;
            if (c.left) wallCount++;
            if (c.right) wallCount++;
        }
    }
    console.log('[MapObj] Detected', wallCount, 'wall edges');

    const ambient = new THREE.PointLight(0x8899bb, 0.4, 100, 1.2);
    ambient.position.set(0, wallHeight - 0.5, 0);
    group.add(ambient);

    const exitLight = new THREE.PointLight(0xff6633, 2.5, 10, 1.5);
    exitLight.position.set(exitPos.x, 1.0, exitPos.z);
    group.add(exitLight);

    const lightSources = [{ light: exitLight, position: exitPos.clone() }];

    return {
        group,
        data,
        spawnPos: { x: spawnPos.x, z: spawnPos.z },
        exitPos:  { x: exitPos.x,  z: exitPos.z  },
        entitySpawnPos: { x: entityPos.x, z: entityPos.z },
        lightSources,
        flickerLights: [],
        wallMeshes: [],
        waterReflector: null,
        totalSize: size * tileSize
    };
}

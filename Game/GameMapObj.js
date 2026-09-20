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

    const group = new THREE.Group();
    scene.add(group);

    function emptyData() {
        const d = [];
        for (let y = 0; y < size; y++) {
            d[y] = [];
            for (let x = 0; x < size; x++) {
                d[y][x] = { x, y, top: false, right: false, bottom: false, left: false };
            }
        }
        return d;
    }

    if (!_cachedOBJ) {
        console.warn('[MapObj] No preloaded OBJ');
        return {
            group, data: emptyData(),
            spawnPos: { x: -10, z: -10 }, exitPos: { x: 10, z: 10 },
            entitySpawnPos: { x: 10, z: -10 },
            lightSources: [], flickerLights: [], wallMeshes: [],
            waterReflector: null, totalSize: size * tileSize
        };
    }

    const obj = _cachedOBJ.clone(true);
    group.add(obj);

    obj.updateMatrixWorld(true);
    const bbox = new THREE.Box3().setFromObject(obj);
    const bboxSize = bbox.getSize(new THREE.Vector3());
    const bboxCenter = bbox.getCenter(new THREE.Vector3());

    console.log('[MapObj] Size:   ' + bboxSize.x.toFixed(2) + ' x ' + bboxSize.y.toFixed(2) + ' x ' + bboxSize.z.toFixed(2));
    console.log('[MapObj] Center: [' + bboxCenter.x.toFixed(2) + ', ' + bboxCenter.y.toFixed(2) + ', ' + bboxCenter.z.toFixed(2) + ']');
    console.log('[MapObj] Min/Max X: [' + bbox.min.x.toFixed(2) + ', ' + bbox.max.x.toFixed(2) + ']');
    console.log('[MapObj] Min/Max Z: [' + bbox.min.z.toFixed(2) + ', ' + bbox.max.z.toFixed(2) + ']');

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

    console.log('[MapObj] Markers — spawn:', !!spawnMarker, 'entity:', !!entityMarker, 'exit:', !!exitMarker);

    function markerCenter(mesh) {
        if (!mesh) return null;
        const b = new THREE.Box3().setFromObject(mesh);
        const c = new THREE.Vector3();
        b.getCenter(c);
        return c;
    }

    const rawSpawn  = markerCenter(spawnMarker);
    const rawExit   = markerCenter(exitMarker);
    const rawEntity = markerCenter(entityMarker);

    if (rawSpawn)  console.log('[MapObj] spawn center:  [' + rawSpawn.x.toFixed(2) + ', ' + rawSpawn.z.toFixed(2) + ']');
    if (rawExit)   console.log('[MapObj] exit center:   [' + rawExit.x.toFixed(2) + ', ' + rawExit.z.toFixed(2) + ']');
    if (rawEntity) console.log('[MapObj] entity center: [' + rawEntity.x.toFixed(2) + ', ' + rawEntity.z.toFixed(2) + ']');

    const corners = [
        new THREE.Vector3(bbox.min.x + 2, 0, bbox.min.z + 2),
        new THREE.Vector3(bbox.max.x - 2, 0, bbox.min.z + 2),
        new THREE.Vector3(bbox.min.x + 2, 0, bbox.max.z - 2),
        new THREE.Vector3(bbox.max.x - 2, 0, bbox.max.z - 2)
    ];

    let spawnPos, exitPos, entityPos;

    if (rawSpawn && (Math.abs(rawSpawn.x) > 0.5 || Math.abs(rawSpawn.z) > 0.5)) {
        spawnPos = rawSpawn.clone();
    } else {
        spawnPos = corners[0].clone();
    }

    if (rawExit && (Math.abs(rawExit.x) > 0.5 || Math.abs(rawExit.z) > 0.5) && rawExit.distanceTo(spawnPos) >= 12) {
        exitPos = rawExit.clone();
    } else {
        console.warn('[MapObj] exit marker unusable — using far corner');
        let best = corners[3], bestD = -1;
        for (const c of corners) {
            const d = c.distanceTo(spawnPos);
            if (d > bestD) { bestD = d; best = c; }
        }
        exitPos = best.clone();
    }

    if (rawEntity && (Math.abs(rawEntity.x) > 0.5 || Math.abs(rawEntity.z) > 0.5) &&
        rawEntity.distanceTo(spawnPos) >= 12 && rawEntity.distanceTo(exitPos) >= 8) {
        entityPos = rawEntity.clone();
    } else {
        console.warn('[MapObj] entity marker unusable — using other corner');
        let best = null, bestScore = -1;
        for (const c of corners) {
            const score = Math.min(c.distanceTo(spawnPos), c.distanceTo(exitPos));
            if (score > bestScore) { bestScore = score; best = c; }
        }
        entityPos = best.clone();
    }

    console.log('[MapObj] FINAL spawn:[' + spawnPos.x.toFixed(1) + ',' + spawnPos.z.toFixed(1) +
                '] exit:[' + exitPos.x.toFixed(1) + ',' + exitPos.z.toFixed(1) +
                '] entity:[' + entityPos.x.toFixed(1) + ',' + entityPos.z.toFixed(1) + ']');

    [spawnMarker, entityMarker, exitMarker].forEach((m) => {
        if (!m) return;
        m.visible = false;
        m.raycast = () => {};
    });

    const raycaster = new THREE.Raycaster();
    raycaster.far = 1.2;
    const origin = new THREE.Vector3();

    function edgeHasWall(wx, wz, dx, dz) {
        origin.set(wx, 1.5, wz);
        raycaster.set(origin, new THREE.Vector3(dx, 0, dz));
        const hits = raycaster.intersectObject(obj, true);
        return hits.length > 0;
    }

    const data = [];
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
    console.log('[MapObj] Wall edges: ' + wallCount);

    const exitLight = new THREE.PointLight(0xff6633, 3.0, 12, 1.5);
    exitLight.position.set(exitPos.x, 1.5, exitPos.z);
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

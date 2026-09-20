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

    let bbox = new THREE.Box3().setFromObject(obj);
    let bboxCenter = bbox.getCenter(new THREE.Vector3());

    console.log('[MapObj] Original bbox:');
    console.log('   min:    [' + bbox.min.x.toFixed(2) + ', ' + bbox.min.y.toFixed(2) + ', ' + bbox.min.z.toFixed(2) + ']');
    console.log('   max:    [' + bbox.max.x.toFixed(2) + ', ' + bbox.max.y.toFixed(2) + ', ' + bbox.max.z.toFixed(2) + ']');
    console.log('   center: [' + bboxCenter.x.toFixed(2) + ', ' + bboxCenter.y.toFixed(2) + ', ' + bboxCenter.z.toFixed(2) + ']');

    if (Math.abs(bbox.min.y) > 0.01) {
        console.log('[MapObj] Shifting Y by ' + (-bbox.min.y).toFixed(2) + ' so floor sits at Y=0');
        obj.position.y -= bbox.min.y;
    }

    if (Math.abs(bboxCenter.x) > 0.5 || Math.abs(bboxCenter.z) > 0.5) {
        console.log('[MapObj] Shifting X/Z by [' + (-bboxCenter.x).toFixed(2) + ', ' + (-bboxCenter.z).toFixed(2) + ']');
        obj.position.x -= bboxCenter.x;
        obj.position.z -= bboxCenter.z;
    }

    obj.updateMatrixWorld(true);

    bbox = new THREE.Box3().setFromObject(obj);
    bboxCenter = bbox.getCenter(new THREE.Vector3());

    console.log('[MapObj] Adjusted bbox:');
    console.log('   min:    [' + bbox.min.x.toFixed(2) + ', ' + bbox.min.y.toFixed(2) + ', ' + bbox.min.z.toFixed(2) + ']');
    console.log('   max:    [' + bbox.max.x.toFixed(2) + ', ' + bbox.max.y.toFixed(2) + ', ' + bbox.max.z.toFixed(2) + ']');

    const fallbackMats = [
        new THREE.MeshStandardMaterial({ color: 0x555a60, roughness: 0.9, metalness: 0.05, side: THREE.DoubleSide }),
        new THREE.MeshStandardMaterial({ color: 0x4a4f55, roughness: 0.85, metalness: 0.05, side: THREE.DoubleSide }),
        new THREE.MeshStandardMaterial({ color: 0x60656b, roughness: 0.95, metalness: 0.02, side: THREE.DoubleSide }),
    ];

    let meshCount = 0;
    obj.traverse((c) => {
        if (!c.isMesh) return;
        meshCount++;
        const m = c.material;
        const isDefaultWhite = m && (!m.map) &&
            m.color && m.color.r > 0.95 && m.color.g > 0.95 && m.color.b > 0.95;
        if (!m || isDefaultWhite) {
            c.material = fallbackMats[meshCount % fallbackMats.length];
        } else {
            m.side = THREE.DoubleSide;
        }
        c.castShadow = true;
        c.receiveShadow = true;
    });
    console.log('[MapObj] Meshes:', meshCount);

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

    const xRange = { min: bbox.min.x + 2, max: bbox.max.x - 2 };
    const zRange = { min: bbox.min.z + 2, max: bbox.max.z - 2 };

    const corners = [
        new THREE.Vector3(xRange.min, 0, zRange.min),
        new THREE.Vector3(xRange.max, 0, zRange.min),
        new THREE.Vector3(xRange.min, 0, zRange.max),
        new THREE.Vector3(xRange.max, 0, zRange.max),
    ];

    let spawnPos, exitPos, entityPos;

    if (rawSpawn &&
        rawSpawn.x > xRange.min && rawSpawn.x < xRange.max &&
        rawSpawn.z > zRange.min && rawSpawn.z < zRange.max) {
        spawnPos = rawSpawn.clone();
        spawnPos.y = 0;
    } else {
        spawnPos = corners[0].clone();
        if (rawSpawn) console.log('[MapObj] spawn marker out of range — using corner 0');
    }

    if (rawExit &&
        rawExit.x > xRange.min && rawExit.x < xRange.max &&
        rawExit.z > zRange.min && rawExit.z < zRange.max &&
        rawExit.distanceTo(spawnPos) >= 12) {
        exitPos = rawExit.clone();
        exitPos.y = 0;
    } else {
        console.warn('[MapObj] exit marker unusable — using far corner');
        let best = corners[3], bestD = -1;
        for (const c of corners) {
            const d = c.distanceTo(spawnPos);
            if (d > bestD) { bestD = d; best = c; }
        }
        exitPos = best.clone();
    }

    if (rawEntity &&
        rawEntity.x > xRange.min && rawEntity.x < xRange.max &&
        rawEntity.z > zRange.min && rawEntity.z < zRange.max &&
        rawEntity.distanceTo(spawnPos) >= 12 && rawEntity.distanceTo(exitPos) >= 8) {
        entityPos = rawEntity.clone();
        entityPos.y = 0;
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

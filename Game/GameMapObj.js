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
    let bboxSize = bbox.getSize(new THREE.Vector3());

    console.log('[MapObj] Initial size: X=' + bboxSize.x.toFixed(1) +
                ' Y=' + bboxSize.y.toFixed(1) +
                ' Z=' + bboxSize.z.toFixed(1));

    if (bboxSize.y < bboxSize.x * 0.3 && bboxSize.y < bboxSize.z * 0.3) {
        console.log('[MapObj] ⚠ Model appears to be Z-up (Blender default). Rotating -90° on X.');
        obj.rotation.x = -Math.PI / 2;
        obj.updateMatrixWorld(true);
        bbox = new THREE.Box3().setFromObject(obj);
        bboxSize = bbox.getSize(new THREE.Vector3());
        console.log('[MapObj] After rotation size: X=' + bboxSize.x.toFixed(1) +
                    ' Y=' + bboxSize.y.toFixed(1) +
                    ' Z=' + bboxSize.z.toFixed(1));
    }

    const expectedSize = size * tileSize;
    const maxDim = Math.max(bboxSize.x, bboxSize.z);
    if (maxDim > expectedSize * 5 || maxDim < expectedSize * 0.2) {
        const scale = expectedSize / maxDim;
        console.log('[MapObj] ⚠ Auto-scaling by ' + scale.toFixed(3) + 'x');
        obj.scale.multiplyScalar(scale);
        obj.updateMatrixWorld(true);
        bbox = new THREE.Box3().setFromObject(obj);
        bboxSize = bbox.getSize(new THREE.Vector3());
        console.log('[MapObj] After scale size: X=' + bboxSize.x.toFixed(1) +
                    ' Y=' + bboxSize.y.toFixed(1) +
                    ' Z=' + bboxSize.z.toFixed(1));
    }

    bbox = new THREE.Box3().setFromObject(obj);
    let bboxCenter = bbox.getCenter(new THREE.Vector3());

    console.log('[MapObj] Pre-shift bbox: min=[' + bbox.min.x.toFixed(1) + ',' + bbox.min.y.toFixed(1) + ',' + bbox.min.z.toFixed(1) + ']');

    obj.position.y -= bbox.min.y;

    obj.position.x -= bboxCenter.x;
    obj.position.z -= bboxCenter.z;

    obj.updateMatrixWorld(true);

    bbox = new THREE.Box3().setFromObject(obj);
    bboxCenter = bbox.getCenter(new THREE.Vector3());

    console.log('[MapObj] Post-shift bbox: min=[' + bbox.min.x.toFixed(1) + ',' + bbox.min.y.toFixed(1) + ',' + bbox.min.z.toFixed(1) +
                ']  max=[' + bbox.max.x.toFixed(1) + ',' + bbox.max.y.toFixed(1) + ',' + bbox.max.z.toFixed(1) + ']');

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
    console.log('[MapObj] Meshes: ' + meshCount);
    
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

    if (rawSpawn)  console.log('[MapObj] spawn center:  [' + rawSpawn.x.toFixed(1) + ', ' + rawSpawn.z.toFixed(1) + ']');
    if (rawExit)   console.log('[MapObj] exit center:   [' + rawExit.x.toFixed(1) + ', ' + rawExit.z.toFixed(1) + ']');
    if (rawEntity) console.log('[MapObj] entity center: [' + rawEntity.x.toFixed(1) + ', ' + rawEntity.z.toFixed(1) + ']');

    const inset = 2.5;
    const corners = [
        new THREE.Vector3(bbox.min.x + inset, 0, bbox.min.z + inset),
        new THREE.Vector3(bbox.max.x - inset, 0, bbox.min.z + inset),
        new THREE.Vector3(bbox.min.x + inset, 0, bbox.max.z - inset),
        new THREE.Vector3(bbox.max.x - inset, 0, bbox.max.z - inset),
    ];

    console.log('[MapObj] Corner[0] (spawn fallback):  [' + corners[0].x.toFixed(1) + ', ' + corners[0].z.toFixed(1) + ']');
    console.log('[MapObj] Corner[3] (exit fallback):   [' + corners[3].x.toFixed(1) + ', ' + corners[3].z.toFixed(1) + ']');

    function insideBbox(p, margin) {
        return p && p.x > bbox.min.x + margin && p.x < bbox.max.x - margin &&
                    p.z > bbox.min.z + margin && p.z < bbox.max.z - margin;
    }

    let spawnPos, exitPos, entityPos;

    if (insideBbox(rawSpawn, 1)) {
        spawnPos = rawSpawn.clone(); spawnPos.y = 0;
    } else {
        spawnPos = corners[0].clone();
    }

    if (insideBbox(rawExit, 1) && rawExit.distanceTo(spawnPos) >= 12) {
        exitPos = rawExit.clone(); exitPos.y = 0;
    } else {
        let best = corners[3], bestD = -1;
        for (const c of corners) {
            const d = c.distanceTo(spawnPos);
            if (d > bestD) { bestD = d; best = c; }
        }
        exitPos = best.clone();
    }

    if (insideBbox(rawEntity, 1) &&
        rawEntity.distanceTo(spawnPos) >= 12 &&
        rawEntity.distanceTo(exitPos) >= 8) {
        entityPos = rawEntity.clone(); entityPos.y = 0;
    } else {
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

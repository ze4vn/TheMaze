import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

const MANUAL_UP_ROTATION = 0;
const AUTO_Z_UP_WHEN_NULL = true;

const MODEL_Y_OFFSET = -1.0;
const FLOOR_TEXTURE_PATH = '../Textures/Floor_0.png';
const WALL_TEXTURE_PATH  = '../Textures/Wall_0.png';

const FLOOR_TEX_SCALE = 4.0;
const WALL_TEX_SCALE  = 3.0;

let _cachedOBJ = null;
let _cachedURL = null;

export function preloadMapObj(url) {
    if (_cachedOBJ && _cachedURL === url) return Promise.resolve(_cachedOBJ);
    return new Promise((resolve, reject) => {
        const loader = new OBJLoader();
        loader.load(url, (obj) => {
            _cachedOBJ = obj;
            _cachedURL = url;
            console.log('[MapObj] Loaded', url);
            resolve(obj);
        }, undefined, (err) => {
            console.warn('[MapObj] Load failed', err);
            reject(err);
        });
    });
}

function emptyResult(size, tileSize, group) {
    const d = [];
    for (let y = 0; y < size; y++) {
        d[y] = [];
        for (let x = 0; x < size; x++) {
            d[y][x] = { x, y, top: false, right: false, bottom: false, left: false };
        }
    }
    return {
        group, data: d,
        spawnPos: { x: 0, z: 0 },
        exitPos: { x: tileSize * 2, z: tileSize * 2 },
        entitySpawnPos: null,
        lightSources: [], flickerLights: [], wallMeshes: [],
        waterReflector: null, totalSize: size * tileSize,
        collisionMeshes: null,
        useMeshCollision: false,
    };
}

export function generateMapObj(scene, size, wallHeight, tileSize) {
    const half = (size - 1) / 2;
    const group = new THREE.Group();
    scene.add(group);

    if (!_cachedOBJ) {
        console.error('[MapObj] No preloaded OBJ!');
        return emptyResult(size, tileSize, group);
    }

    const obj = _cachedOBJ.clone(true);
    group.add(obj);
    obj.updateMatrixWorld(true);

    let bbox = new THREE.Box3().setFromObject(obj);
    let bboxSize = bbox.getSize(new THREE.Vector3());
    console.log('[MapObj] Initial size: X=' + bboxSize.x.toFixed(2) +
                ' Y=' + bboxSize.y.toFixed(2) +
                ' Z=' + bboxSize.z.toFixed(2));

    let appliedRotX = 0;
    if (MANUAL_UP_ROTATION !== null) {
        appliedRotX = MANUAL_UP_ROTATION;
        console.log('[MapObj] Using MANUAL rotation.x = ' + appliedRotX.toFixed(4) + ' rad');
    } else if (AUTO_Z_UP_WHEN_NULL) {
        const veryFlat = bboxSize.y < bboxSize.x * 0.05 && bboxSize.y < bboxSize.z * 0.05;
        if (veryFlat) {
            appliedRotX = -Math.PI / 2;
            console.log('[MapObj] Auto-detected Z-up (very flat) → -90° X');
        }
    }

    if (appliedRotX !== 0) {
        obj.rotation.x = appliedRotX;
        obj.updateMatrixWorld(true);
        bbox = new THREE.Box3().setFromObject(obj);
        bboxSize = bbox.getSize(new THREE.Vector3());
        console.log('[MapObj] After rotation: X=' + bboxSize.x.toFixed(2) +
                    ' Y=' + bboxSize.y.toFixed(2) +
                    ' Z=' + bboxSize.z.toFixed(2));
    }

    const expectedSize = size * tileSize;
    const maxDim = Math.max(bboxSize.x, bboxSize.z);
    if (maxDim > 0.001) {
        const scale = expectedSize / maxDim;
        console.log('[MapObj] Scaling by ' + scale.toFixed(4));
        obj.scale.multiplyScalar(scale);
        obj.updateMatrixWorld(true);
    }

    bbox = new THREE.Box3().setFromObject(obj);
    const c = bbox.getCenter(new THREE.Vector3());
    obj.position.x -= c.x;
    obj.position.z -= c.z;
    obj.position.y -= bbox.min.y;
    obj.position.y += MODEL_Y_OFFSET;
    obj.updateMatrixWorld(true);

    bbox = new THREE.Box3().setFromObject(obj);
    console.log('[MapObj] Final bbox: min=[' + bbox.min.x.toFixed(2) + ',' + bbox.min.y.toFixed(2) + ',' + bbox.min.z.toFixed(2) +
                ']  max=[' + bbox.max.x.toFixed(2) + ',' + bbox.max.y.toFixed(2) + ',' + bbox.max.z.toFixed(2) + ']');

    const texLoader = new THREE.TextureLoader();

    const floorTexBase = texLoader.load(
        FLOOR_TEXTURE_PATH,
        undefined, undefined,
        () => console.warn('[MapObj] Floor texture failed to load:', FLOOR_TEXTURE_PATH)
    );
    floorTexBase.colorSpace = THREE.SRGBColorSpace;
    floorTexBase.wrapS = floorTexBase.wrapT = THREE.RepeatWrapping;
    floorTexBase.anisotropy = 16;

    const wallTexBase = texLoader.load(
        WALL_TEXTURE_PATH,
        undefined, undefined,
        () => console.warn('[MapObj] Wall texture failed to load:', WALL_TEXTURE_PATH)
    );
    wallTexBase.colorSpace = THREE.SRGBColorSpace;
    wallTexBase.wrapS = wallTexBase.wrapT = THREE.RepeatWrapping;
    wallTexBase.anisotropy = 16;

    let meshCount = 0;
    let floorCount = 0;
    let wallCount = 0;

    obj.traverse((child) => {
        if (!child.isMesh) return;
        meshCount++;

        child.geometry.computeBoundingBox();
        const localBox = child.geometry.boundingBox.clone();
        const localSize = localBox.getSize(new THREE.Vector3());

        const worldBox = new THREE.Box3().setFromObject(child);
        const worldSize = worldBox.getSize(new THREE.Vector3());

        const isFlat = worldSize.y < Math.min(worldSize.x, worldSize.z) * 0.20;

        if (isFlat) {
            floorCount++;
            const tex = floorTexBase.clone();
            tex.needsUpdate = true;
            const u = Math.max(1, Math.round(Math.max(worldSize.x, worldSize.z) / FLOOR_TEX_SCALE));
            tex.repeat.set(u, u);
            child.material = new THREE.MeshStandardMaterial({
                map: tex,
                roughness: 0.90,
                metalness: 0.05,
                side: THREE.DoubleSide,
            });
        } else {
            wallCount++;
            const tex = wallTexBase.clone();
            tex.needsUpdate = true;
            const u = Math.max(1, Math.round(Math.max(worldSize.x, worldSize.z) / WALL_TEX_SCALE));
            const v = Math.max(1, Math.round(worldSize.y / WALL_TEX_SCALE));
            tex.repeat.set(u, v);
            child.material = new THREE.MeshStandardMaterial({
                map: tex,
                roughness: 0.85,
                metalness: 0.05,
                side: THREE.DoubleSide,
            });
        }
        child.castShadow = true;
        child.receiveShadow = true;
    });
    console.log('[MapObj] Meshes: ' + meshCount + ' (floors: ' + floorCount + ', walls: ' + wallCount + ')');

    const SPAWN_ALIASES  = ['player_spawn', 'playerspawn', 'player_start', 'playerstart', 'start_point', 'startpoint', 'spawn'];
    const ENTITY_ALIASES = ['entityspawn', 'spawnentity', 'entity_spawn', 'monsterspawn', 'monster_spawn', 'enemyspawn', 'enemy_spawn', 'entity', 'enemy'];
    const EXIT_ALIASES   = ['exit_point', 'exitpoint', 'exit', 'goal', 'finish'];

    function nameMatches(name, aliases) {
        if (!name) return false;
        const n = name.toLowerCase();
        for (const a of aliases) if (n === a) return true;
        for (const a of aliases) if (n.includes(a)) return true;
        return false;
    }

    let spawnMarker = null, entityMarker = null, exitMarker = null;
    obj.traverse((o) => {
        const own = (o.name || '').toLowerCase();
        const par = (o.parent && o.parent.name) ? o.parent.name.toLowerCase() : '';
        for (const nm of [own, par]) {
            if (!nm) continue;
            if (!spawnMarker  && nameMatches(nm, SPAWN_ALIASES))  { spawnMarker  = o; continue; }
            if (!entityMarker && nameMatches(nm, ENTITY_ALIASES)) { entityMarker = o; continue; }
            if (!exitMarker   && nameMatches(nm, EXIT_ALIASES))   { exitMarker   = o; continue; }
        }
    });
    console.log('[MapObj] Markers — spawn:', !!spawnMarker, 'entity:', !!entityMarker, 'exit:', !!exitMarker);

    function markerCenter(mesh) {
        if (!mesh) return null;
        const b = new THREE.Box3().setFromObject(mesh);
        const p = new THREE.Vector3();
        b.getCenter(p);
        return p;
    }
    const rawSpawn  = markerCenter(spawnMarker);
    const rawExit   = markerCenter(exitMarker);
    const rawEntity = markerCenter(entityMarker);

    function insideBbox(p, margin) {
        return p && p.x > bbox.min.x + margin && p.x < bbox.max.x - margin &&
                    p.z > bbox.min.z + margin && p.z < bbox.max.z - margin;
    }

    const inset = 2.5;
    const corners = [
        new THREE.Vector3(bbox.min.x + inset, 0, bbox.min.z + inset),
        new THREE.Vector3(bbox.max.x - inset, 0, bbox.min.z + inset),
        new THREE.Vector3(bbox.min.x + inset, 0, bbox.max.z - inset),
        new THREE.Vector3(bbox.max.x - inset, 0, bbox.max.z - inset),
    ];

    let spawnPos, exitPos, entityPos;
    if (insideBbox(rawSpawn, 1)) { spawnPos = rawSpawn.clone(); spawnPos.y = 0; }
    else spawnPos = corners[0].clone();

    if (insideBbox(rawExit, 1) && rawExit.distanceTo(spawnPos) >= 8) { exitPos = rawExit.clone(); exitPos.y = 0; }
    else {
        let best = corners[3], bestD = -1;
        for (const k of corners) {
            const d = k.distanceTo(spawnPos);
            if (d > bestD) { bestD = d; best = k; }
        }
        exitPos = best.clone();
    }

    if (insideBbox(rawEntity, 1) && rawEntity.distanceTo(spawnPos) >= 8 && rawEntity.distanceTo(exitPos) >= 6) {
        entityPos = rawEntity.clone(); entityPos.y = 0;
    } else {
        let best = null, bestScore = -1;
        for (const k of corners) {
            const score = Math.min(k.distanceTo(spawnPos), k.distanceTo(exitPos));
            if (score > bestScore) { bestScore = score; best = k; }
        }
        entityPos = best.clone();
    }

    console.log('[MapObj] spawn:[' + spawnPos.x.toFixed(1) + ',' + spawnPos.z.toFixed(1) +
                '] exit:[' + exitPos.x.toFixed(1) + ',' + exitPos.z.toFixed(1) + ']');

    [spawnMarker, entityMarker, exitMarker].forEach((m) => {
        if (!m) return;
        m.visible = false;
        m.raycast = () => {};
    });

    const raycaster = new THREE.Raycaster();
    const origin = new THREE.Vector3();
    const rayDir = new THREE.Vector3();
    const rayFar = tileSize * 0.7;

    const yBase = Math.max(0.05, wallHeight * 0.05);
    const yMid  = wallHeight * 0.4;
    const yTop  = wallHeight * 0.75;

    function edgeHasWall(wx, wz, dx, dz) {
        rayDir.set(dx, 0, dz).normalize();
        for (const y of [yBase, yMid, yTop]) {
            origin.set(wx, y, wz);
            raycaster.set(origin, rayDir);
            raycaster.far = rayFar;
            const hits = raycaster.intersectObject(obj, true);
            for (const h of hits) if (h.object.visible !== false) return true;
        }
        return false;
    }

    const data = [];
    for (let ty = 0; ty < size; ty++) {
        data[ty] = [];
        for (let tx = 0; tx < size; tx++) {
            const wx = (tx - half) * tileSize;
            const wz = (ty - half) * tileSize;
            data[ty][tx] = {
                x: tx, y: ty,
                top:    edgeHasWall(wx, wz,  0, -1),
                bottom: edgeHasWall(wx, wz,  0,  1),
                left:   edgeHasWall(wx, wz, -1,  0),
                right:  edgeHasWall(wx, wz,  1,  0),
            };
        }
    }

    const exitLight = new THREE.PointLight(0xff6633, 4.5, 14, 1.6);
    exitLight.position.set(exitPos.x, 1.5, exitPos.z);
    group.add(exitLight);

    const beacon = new THREE.Mesh(
        new THREE.SphereGeometry(0.28, 14, 14),
        new THREE.MeshBasicMaterial({ color: 0xff8844, transparent: true, opacity: 0.85 })
    );
    beacon.position.set(exitPos.x, 1.5, exitPos.z);
    beacon.raycast = () => {};
    group.add(beacon);

    const spawnBeacon = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 12, 12),
        new THREE.MeshBasicMaterial({ color: 0x4488ff, transparent: true, opacity: 0.55 })
    );
    spawnBeacon.position.set(spawnPos.x, 0.6, spawnPos.z);
    spawnBeacon.raycast = () => {};
    group.add(spawnBeacon);

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
        totalSize: size * tileSize,
        collisionMeshes: [obj],
        useMeshCollision: true,
    };
}

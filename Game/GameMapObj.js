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

    function emptyResult() {
        return {
            group, data: emptyData(),
            spawnPos: { x: 0, z: 0 },
            exitPos:  { x: 0, z: tileSize * 2 },
            entitySpawnPos: { x: tileSize * 2, z: -tileSize * 2 },
            lightSources: [], flickerLights: [], wallMeshes: [],
            waterReflector: null, totalSize: size * tileSize
        };
    }

    if (!_cachedOBJ) {
        console.error('[MapObj] No preloaded OBJ — level 0 cannot be generated!');
        return emptyResult();
    }

    const obj = _cachedOBJ.clone(true);
    group.add(obj);
    obj.updateMatrixWorld(true);

    let bbox = new THREE.Box3().setFromObject(obj);
    let bboxSize = bbox.getSize(new THREE.Vector3());
    console.log('[MapObj] Initial size: X=' + bboxSize.x.toFixed(2) +
                ' Y=' + bboxSize.y.toFixed(2) +
                ' Z=' + bboxSize.z.toFixed(2));

    if (bboxSize.y < bboxSize.x * 0.35 && bboxSize.y < bboxSize.z * 0.35) {
        console.log('[MapObj] Detected Z-up model — rotating -90° X');
        obj.rotation.x = -Math.PI / 2;
        obj.updateMatrixWorld(true);
        bbox = new THREE.Box3().setFromObject(obj);
        bboxSize = bbox.getSize(new THREE.Vector3());
    }

    const expectedSize = size * tileSize;
    const maxDim = Math.max(bboxSize.x, bboxSize.z);
    if (maxDim > 0.001) {
        const scale = expectedSize / maxDim;
        if (Math.abs(scale - 1) > 0.01) {
            console.log('[MapObj] Scaling by ' + scale.toFixed(4));
            obj.scale.multiplyScalar(scale);
            obj.updateMatrixWorld(true);
        }
    }

    bbox = new THREE.Box3().setFromObject(obj);
    const c = bbox.getCenter(new THREE.Vector3());
    obj.position.x -= c.x;
    obj.position.z -= c.z;
    obj.position.y -= bbox.min.y;
    obj.updateMatrixWorld(true);

    bbox = new THREE.Box3().setFromObject(obj);
    console.log('[MapObj] Final bbox: min=[' + bbox.min.x.toFixed(2) + ',' + bbox.min.y.toFixed(2) + ',' + bbox.min.z.toFixed(2) +
                ']  max=[' + bbox.max.x.toFixed(2) + ',' + bbox.max.y.toFixed(2) + ',' + bbox.max.z.toFixed(2) + ']');

    const fallbackMats = [
        new THREE.MeshStandardMaterial({ color: 0x666b70, roughness: 0.85, metalness: 0.05, side: THREE.DoubleSide }),
        new THREE.MeshStandardMaterial({ color: 0x555a60, roughness: 0.90, metalness: 0.05, side: THREE.DoubleSide }),
        new THREE.MeshStandardMaterial({ color: 0x70757a, roughness: 0.95, metalness: 0.02, side: THREE.DoubleSide }),
    ];

    let meshCount = 0;
    obj.traverse((child) => {
        if (!child.isMesh) return;
        meshCount++;
        const m = child.material;
        const isDefaultWhite = m && !m.map && m.color &&
            m.color.r > 0.95 && m.color.g > 0.95 && m.color.b > 0.95;
        if (!m || isDefaultWhite) {
            child.material = fallbackMats[meshCount % fallbackMats.length];
        } else {
            m.side = THREE.DoubleSide;
        }
        child.castShadow = true;
        child.receiveShadow = true;
    });
    console.log('[MapObj] Meshes: ' + meshCount);

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

    if (insideBbox(rawSpawn, 1)) {
        spawnPos = rawSpawn.clone(); spawnPos.y = 0;
    } else {
        spawnPos = corners[0].clone();
    }

    if (insideBbox(rawExit, 1) && rawExit.distanceTo(spawnPos) >= 8) {
        exitPos = rawExit.clone(); exitPos.y = 0;
    } else {
        let best = corners[3], bestD = -1;
        for (const k of corners) {
            const d = k.distanceTo(spawnPos);
            if (d > bestD) { bestD = d; best = k; }
        }
        exitPos = best.clone();
    }

    if (insideBbox(rawEntity, 1) &&
        rawEntity.distanceTo(spawnPos) >= 8 &&
        rawEntity.distanceTo(exitPos) >= 6) {
        entityPos = rawEntity.clone(); entityPos.y = 0;
    } else {
        let best = null, bestScore = -1;
        for (const k of corners) {
            const score = Math.min(k.distanceTo(spawnPos), k.distanceTo(exitPos));
            if (score > bestScore) { bestScore = score; best = k; }
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
    const origin = new THREE.Vector3();
    const rayDir = new THREE.Vector3();

    const rayFar = tileSize * 0.7;  

    function edgeHasWall(wx, wz, dx, dz) {
        rayDir.set(dx, 0, dz).normalize();

        for (const yf of [0.30, 0.55, 0.80]) {
            origin.set(wx, wallHeight * yf, wz);
            raycaster.set(origin, rayDir);
            raycaster.far = rayFar;
            const hits = raycaster.intersectObject(obj, true);
            if (hits.length > 0) return true;
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

    let wallCount = 0;
    for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) {
            const d = data[y][x];
            if (d.top) wallCount++;
            if (d.bottom) wallCount++;
            if (d.left) wallCount++;
            if (d.right) wallCount++;
        }
    console.log('[MapObj] Detected ' + wallCount + ' wall edges total');

    const exitLight = new THREE.PointLight(0xff6633, 4.5, 14, 1.6);
    exitLight.position.set(exitPos.x, 1.5, exitPos.z);
    group.add(exitLight);

    const beacon = new THREE.Mesh(
        new THREE.SphereGeometry(0.28, 14, 14),
        new THREE.MeshBasicMaterial({ color: 0xff8844, transparent: true, opacity: 0.85 })
    );
    beacon.position.set(exitPos.x, 1.5, exitPos.z);
    group.add(beacon);

    const spawnBeacon = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 12, 12),
        new THREE.MeshBasicMaterial({ color: 0x4488ff, transparent: true, opacity: 0.55 })
    );
    spawnBeacon.position.set(spawnPos.x, 0.6, spawnPos.z);
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
        hasEntity: true,
    };
}

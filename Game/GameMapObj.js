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
                d[y][x] = { x, y, top: true, right: true, bottom: true, left: true };
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
        console.warn('[MapObj] No preloaded OBJ — using fallback');
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

    const SPAWN_ALIASES  = ['spawn', 'player_spawn', 'playerspawn', 'playerstart', 'player_start', 'start_point', 'startpoint', 'start'];
    const ENTITY_ALIASES = ['entityspawn', 'entity_spawn', 'entities', 'monsterspawn', 'monster_spawn', 'monster', 'enemyspawn', 'enemy_spawn', 'entity', 'enemy'];
    const EXIT_ALIASES   = ['exit', 'exit_point', 'exitpoint', 'goal', 'finish', 'end'];

    function nameMatches(name, aliases) {
        if (!name) return false;
        const n = name.toLowerCase();
        for (const a of aliases) if (n === a) return true;
        for (const a of aliases) if (n.includes(a)) return true;
        return false;
    }

    let spawnMesh = null, entityMesh = null, exitMesh = null;
    obj.traverse((c) => {
        const ownName = c.name || '';
        const parentName = (c.parent && c.parent.name) ? c.parent.name : '';
        if (!c.isMesh) return;
        const candidates = [ownName, parentName];
        for (const nm of candidates) {
            if (!spawnMesh && nameMatches(nm, SPAWN_ALIASES)) { spawnMesh = c; break; }
            if (!entityMesh && nameMatches(nm, ENTITY_ALIASES)) { entityMesh = c; break; }
            if (!exitMesh && nameMatches(nm, EXIT_ALIASES)) { exitMesh = c; break; }
        }
    });

    console.log('[MapObj] Markers found — spawn:', !!spawnMesh, 'entity:', !!entityMesh, 'exit:', !!exitMesh);

    function centerOf(mesh) {
        if (!mesh) return null;
        const box = new THREE.Box3().setFromObject(mesh);
        const c = new THREE.Vector3();
        box.getCenter(c);
        return c;
    }

    const bbox = new THREE.Box3().setFromObject(obj);
    const bboxSize = bbox.getSize(new THREE.Vector3());
    const bboxCenter = bbox.getCenter(new THREE.Vector3());

    const spawnMarker = centerOf(spawnMesh);
    const exitMarker  = centerOf(exitMesh);
    const entityMarker = centerOf(entityMesh);

    let useMarkers = false;
    if (spawnMarker && exitMarker && entityMarker) {
        const dSE = spawnMarker.distanceTo(exitMarker);
        const dSEn = spawnMarker.distanceTo(entityMarker);
        const dEEn = exitMarker.distanceTo(entityMarker);
        console.log('[MapObj] Marker distances — spawn↔exit:', dSE.toFixed(1),
                    'spawn↔entity:', dSEn.toFixed(1), 'exit↔entity:', dEEn.toFixed(1));
        if (dSE >= 15 && dSEn >= 15 && dEEn >= 15) {
            useMarkers = true;
        } else {
            console.warn('[MapObj] ⚠ Markers too close together — IGNORING ALL MARKERS and using corner placement');
        }
    } else {
        console.warn('[MapObj] ⚠ Not all markers found — using corner placement');
    }

    const corners = [
        new THREE.Vector3(bbox.min.x * 0.85, 0, bbox.min.z * 0.85),
        new THREE.Vector3(bbox.max.x * 0.85, 0, bbox.min.z * 0.85),
        new THREE.Vector3(bbox.min.x * 0.85, 0, bbox.max.z * 0.85),
        new THREE.Vector3(bbox.max.x * 0.85, 0, bbox.max.z * 0.85)
    ];

    let spawnPos, exitPos, entityPos;

    if (useMarkers) {

        spawnPos = clampToWorld(spawnMarker);
        exitPos = clampToWorld(exitMarker);
        entityPos = clampToWorld(entityMarker);
    } else {
        spawnPos = clampToWorld(corners[0].clone());  
        exitPos = clampToWorld(corners[3].clone());   
        entityPos = clampToWorld(corners[1].clone());  
    }

    if (spawnPos.distanceTo(exitPos) < 12) {
        console.warn('[MapObj] ⚠ Final spawn↔exit check FAILED — snapping exit to opposite corner');
        exitPos = clampToWorld(corners[3].clone());
    }
    if (spawnPos.distanceTo(entityPos) < 12) {
        console.warn('[MapObj] ⚠ Final spawn↔entity check FAILED — snapping entity to a far corner');

        let best = corners[1], bestScore = -1;
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
    console.log('   spawn↔exit:   ' + spawnPos.distanceTo(exitPos).toFixed(1) + 'm');
    console.log('   spawn↔entity: ' + spawnPos.distanceTo(entityPos).toFixed(1) + 'm');

    [spawnMesh, entityMesh, exitMesh].forEach((m) => {
        if (!m) return;
        m.visible = false;
        m.raycast = () => {};
    });

    const raycaster = new THREE.Raycaster();
    const down = new THREE.Vector3(0, -1, 0);
    const rayOrigin = new THREE.Vector3();

    function edgeHasWall(wx, wz) {
        rayOrigin.set(wx, wallHeight + 2.0, wz);
        raycaster.set(rayOrigin, down);
        const hits = raycaster.intersectObject(obj, true);
        for (const h of hits) {
            const y = h.point.y;
            if (y > 0.5 && y < wallHeight - 0.2) return true;
        }
        return false;
    }

    const data = [];
    const probe = tileSize * 0.42;
    for (let ty = 0; ty < size; ty++) {
        data[ty] = [];
        for (let tx = 0; tx < size; tx++) {
            const wx = (tx - half) * tileSize;
            const wz = (ty - half) * tileSize;
            data[ty][tx] = {
                x: tx, y: ty,
                top:    edgeHasWall(wx, wz - probe),
                bottom: edgeHasWall(wx, wz + probe),
                left:   edgeHasWall(wx - probe, wz),
                right:  edgeHasWall(wx + probe, wz),
            };
        }
    }

    const ambient = new THREE.PointLight(0x8899bb, 0.25, 80, 1.2);
    ambient.position.set(0, wallHeight - 0.5, 0);
    group.add(ambient);

    const exitLight = new THREE.PointLight(0xff6633, 2.5, 8, 1.5);
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

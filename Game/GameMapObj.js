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

    if (!_cachedOBJ) {
        console.warn('[MapObj] No preloaded OBJ — using fallback');
        return {
            group, data: fallbackData(),
            spawnPos: { x: 0, z: 0 }, exitPos: { x: 0, z: 0 },
            entitySpawnPos: null,
            lightSources: [], flickerLights: [], wallMeshes: [],
            waterReflector: null, totalSize: size * tileSize
        };
    }

    const obj = _cachedOBJ.clone(true);
    group.add(obj);

    let spawnMesh = null, entityMesh = null, exitMesh = null;
    obj.traverse((c) => {
        if (!c.isMesh) return;
        const n = (c.name || '').toLowerCase();
        if (n === 'spawn') spawnMesh = c;
        else if (n === 'entityspawn') entityMesh = c;
        else if (n === 'exit') exitMesh = c;
    });

    function centerOf(mesh) {
        if (!mesh) return new THREE.Vector3(0, 0, 0);
        const box = new THREE.Box3().setFromObject(mesh);
        const c = new THREE.Vector3();
        box.getCenter(c);
        return c;
    }

    const spawnPos = centerOf(spawnMesh);
    const entityPos = centerOf(entityMesh);
    const exitPos = centerOf(exitMesh);

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
        entitySpawnPos: entityMesh ? { x: entityPos.x, z: entityPos.z } : null,
        lightSources,
        flickerLights: [],
        wallMeshes: [],
        waterReflector: null,
        totalSize: size * tileSize
    };
}
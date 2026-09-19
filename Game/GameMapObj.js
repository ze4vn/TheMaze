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
            spawnPos: { x: -10, z: -10 }, exitPos: { x: 10, z: 10 },
            entitySpawnPos: null,
            lightSources: [], flickerLights: [], wallMeshes: [],
            waterReflector: null, totalSize: size * tileSize
        };
    }

    const obj = _cachedOBJ.clone(true);
    group.add(obj);

    let spawnMesh = null, entityMesh = null, exitMesh = null;
    const allNamed = [];

    obj.traverse((c) => {

        const ownName = (c.name || '').toLowerCase();
        const parentName = (c.parent && c.parent.name ? c.parent.name : '').toLowerCase();
        if (ownName || parentName) allNamed.push({ own: ownName, parent: parentName });

        if (!c.isMesh) return;

        if (!spawnMesh && (ownName === 'spawn' || parentName === 'spawn')) spawnMesh = c;
        if (!entityMesh && (ownName === 'entityspawn' || parentName === 'entityspawn')) entityMesh = c;
        if (!exitMesh && (ownName === 'exit' || parentName === 'exit')) exitMesh = c;
    });

    console.log('[MapObj] Markers found — spawn:', !!spawnMesh, 'entity:', !!entityMesh, 'exit:', !!exitMesh);
    console.log('[MapObj] Named objects:', allNamed);

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

    const spawnDefault = new THREE.Vector3(
        bbox.min.x + bboxSize.x * 0.15,
        0,
        bbox.min.z + bboxSize.z * 0.15
    );
    const exitDefault = new THREE.Vector3(
        bbox.max.x - bboxSize.x * 0.15,
        0,
        bbox.max.z - bboxSize.z * 0.15
    );

    let spawnPos = centerOf(spawnMesh) || spawnDefault;
    let entityPos = centerOf(entityMesh) || new THREE.Vector3(
        bboxCenter.x, 0, bboxCenter.z
    );
    const exitPos = centerOf(exitMesh) || exitDefault;

    const spawnToExit = new THREE.Vector3().subVectors(exitPos, spawnPos);
    if (spawnToExit.length() < 4.0) {
        console.warn('[MapObj] Spawn and exit too close — pushing exit away');
        exitPos.x = spawnPos.x + (bboxSize.x * 0.7);
        exitPos.z = spawnPos.z + (bboxSize.z * 0.7);
    }

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

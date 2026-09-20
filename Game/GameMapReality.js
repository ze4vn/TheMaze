import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { Reflector } from 'three/addons/objects/Reflector.js';

const MANUAL_UP_ROTATION = 0;
const AUTO_Z_UP_WHEN_NULL = true;

const MODEL_Y_OFFSET = -1.0;

const FORCE_FIT_TO_WORLD = true;

const WORLD_SIZE_MULTIPLIER = 1.6;

const FLAT_MESH_RATIO   = 0.35; 
const MIN_COLLISION_DIM = 0.3; 
const MAX_COLLISION_RATIO = 0.9; 

let _cachedOBJ = null;
let _cachedURL = null;

export function preloadRealityMap(url) {
    if (_cachedOBJ && _cachedURL === url) return Promise.resolve(_cachedOBJ);
    return new Promise((resolve, reject) => {
        const loader = new OBJLoader();
        loader.load(
            url,
            (obj) => {
                _cachedOBJ = obj;
                _cachedURL = url;
                console.log('[RealityMap] Loaded', url);
                resolve(obj);
            },
            undefined,
            (err) => { console.warn('[RealityMap] Load failed', err); reject(err); }
        );
    });
}

function fallbackData(size) {
    const d = [];
    for (let y = 0; y < size; y++) {
        d[y] = [];
        for (let x = 0; x < size; x++) {
            d[y][x] = { x, y, top: true, right: true, bottom: true, left: true };
        }
    }
    return d;
}

export function generateRealityMap(scene, size, wallHeight, tileSize) {
    const half = (size - 1) / 2;
    const group = new THREE.Group();
    scene.add(group);

    if (!_cachedOBJ) {
        console.warn('[RealityMap] No preloaded OBJ');
        return {
            group, data: fallbackData(size),
            spawnPos: { x: -10, z: -10 }, exitPos: { x: 10, z: 10 },
            entitySpawnPos: null,
            lightSources: [], flickerLights: [], wallMeshes: [],
            waterReflector: null, totalSize: size * tileSize,
            collisionMeshes: null,
            useMeshCollision: false,
            hasEntity: false,
        };
    }

    const obj = _cachedOBJ.clone(true);
    group.add(obj);
    obj.updateMatrixWorld(true);

    let bbox = new THREE.Box3().setFromObject(obj);
    let bboxSize = bbox.getSize(new THREE.Vector3());
    console.log('[RealityMap] Initial size: X=' + bboxSize.x.toFixed(2) +
                ' Y=' + bboxSize.y.toFixed(2) +
                ' Z=' + bboxSize.z.toFixed(2));

    let appliedRotX = 0;
    if (MANUAL_UP_ROTATION !== null) {
        appliedRotX = MANUAL_UP_ROTATION;
        console.log('[RealityMap] Using MANUAL rotation.x = ' + appliedRotX.toFixed(4) + ' rad');
    } else if (AUTO_Z_UP_WHEN_NULL) {
        const veryFlat = bboxSize.y < bboxSize.x * 0.05 && bboxSize.y < bboxSize.z * 0.05;
        if (veryFlat) {
            appliedRotX = -Math.PI / 2;
            console.log('[RealityMap] Auto-detected Z-up (very flat) → -90° X');
        }
    }
    if (appliedRotX !== 0) {
        obj.rotation.x = appliedRotX;
        obj.updateMatrixWorld(true);
        bbox = new THREE.Box3().setFromObject(obj);
        bboxSize = bbox.getSize(new THREE.Vector3());
        console.log('[RealityMap] After rotation: X=' + bboxSize.x.toFixed(2) +
                    ' Y=' + bboxSize.y.toFixed(2) +
                    ' Z=' + bboxSize.z.toFixed(2));
    }

    const expectedSize = size * tileSize * WORLD_SIZE_MULTIPLIER;
    const maxDim = Math.max(bboxSize.x, bboxSize.z);
    if (maxDim > 0.001 && FORCE_FIT_TO_WORLD) {
        const scale = expectedSize / maxDim;
        console.log('[RealityMap] Scaling by ' + scale.toFixed(4) +
                    ' (target footprint ' + expectedSize.toFixed(1) + ')');
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
    console.log('[RealityMap] Final bbox: min=[' + bbox.min.x.toFixed(2) + ',' + bbox.min.y.toFixed(2) + ',' + bbox.min.z.toFixed(2) +
                ']  max=[' + bbox.max.x.toFixed(2) + ',' + bbox.max.y.toFixed(2) + ',' + bbox.max.z.toFixed(2) + ']');

    const texLoader = new THREE.TextureLoader();
    function loadTex(path) {
        const t = texLoader.load(path, undefined, undefined, () => {
            console.warn('[RealityMap] texture failed:', path);
        });
        t.colorSpace = THREE.SRGBColorSpace;
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = 16;
        return t;
    }

    const grassTex = loadTex('../Textures/Grass.png');
    const grayTex  = loadTex('../Textures/GrayPart.png');
    const whiteTex = loadTex('../Textures/WhitePart.png');
    const blackTex = loadTex('../Textures/BlackPart.png');

    const grassMat = new THREE.MeshStandardMaterial({ map: grassTex, roughness: 0.9,  metalness: 0.0,  side: THREE.DoubleSide });
    const grayMat  = new THREE.MeshStandardMaterial({ map: grayTex,  roughness: 0.7,  metalness: 0.15, side: THREE.DoubleSide });
    const whiteMat = new THREE.MeshStandardMaterial({ map: whiteTex, roughness: 0.6,  metalness: 0.1,  side: THREE.DoubleSide });
    const blackMat = new THREE.MeshStandardMaterial({ map: blackTex, roughness: 0.85, metalness: 0.05, side: THREE.DoubleSide });

    let spawnMesh = null, entityMesh = null, exitMesh = null;
    const mirrorMeshes = [];

    obj.traverse((c) => {
        if (!c.isMesh) return;
        const n  = (c.name || '').toLowerCase();
        const pn = (c.parent && c.parent.name ? c.parent.name : '').toLowerCase();
        const hit = (needle) => n.includes(needle) || pn.includes(needle);

        if (!entityMesh && hit('entityspawn')) entityMesh = c;
        else if (!spawnMesh && hit('spawn')) spawnMesh = c;
        if (!exitMesh && hit('exit')) exitMesh = c;
        if (hit('mirror')) mirrorMeshes.push(c);
    });

    obj.traverse((c) => {
        if (!c.isMesh) return;
        const n = (c.name || '').toLowerCase();
        if (n.includes('grass'))                              c.material = grassMat;
        else if (n.includes('gray') || n.includes('grey'))    c.material = grayMat;
        else if (n.includes('white'))                          c.material = whiteMat;
        else if (n.includes('black'))                          c.material = blackMat;
        else                                                   c.material = grayMat;
        c.castShadow = true;
        c.receiveShadow = true;
    });

    for (const mm of mirrorMeshes) {
        try {
            const box = new THREE.Box3().setFromObject(mm);
            const s = box.getSize(new THREE.Vector3());
            const center = box.getCenter(new THREE.Vector3());

            const axes = [s.x, s.y, s.z];
            const minIdx = axes.indexOf(Math.min(...axes));

            let w, h, rotEuler;
            if (minIdx === 0) {
                w = s.z; h = s.y;
                rotEuler = new THREE.Euler(0, Math.PI / 2, 0);
            } else if (minIdx === 1) {
                w = s.x; h = s.z;
                rotEuler = new THREE.Euler(-Math.PI / 2, 0, 0);
            } else {
                w = s.x; h = s.y;
                rotEuler = new THREE.Euler(0, 0, 0);
            }

            const geo = new THREE.PlaneGeometry(Math.max(w, 0.5), Math.max(h, 0.5));
            const reflector = new Reflector(geo, {
                clipBias: 0.003,
                textureWidth: 1024,
                textureHeight: 1024,
                color: 0x8899aa
            });
            reflector.position.copy(center);
            reflector.rotation.copy(rotEuler);
            if (reflector.material) {
                reflector.material.side = THREE.DoubleSide;
                reflector.material.needsUpdate = true;
            }
            group.add(reflector);

            mm.visible = false;
            mm.raycast = () => {};
        } catch (e) {
            console.warn('[RealityMap] Mirror convert failed', e);
        }
    }
    
    const collisionMeshes = [];
    const maxCollisionDim = expectedSize * MAX_COLLISION_RATIO;
    const overheadLimit = wallHeight * 2.0; 

    obj.traverse((c) => {
        if (!c.isMesh) return;
        if (c.visible === false) return;  

        const wb = new THREE.Box3().setFromObject(c);
        const ws = wb.getSize(new THREE.Vector3());

        const flatThreshold = Math.min(ws.x, ws.z) * FLAT_MESH_RATIO;
        if (ws.y < flatThreshold) return;

        if (Math.max(ws.x, ws.z) < MIN_COLLISION_DIM) return;

        if (Math.max(ws.x, ws.z) > maxCollisionDim) return;

        if (wb.min.y > overheadLimit) return;

        collisionMeshes.push(c);
    });
    console.log('[RealityMap] Collision meshes: ' + collisionMeshes.length + ' / ' +
                obj.children.length + ' top-level objects');

    if (collisionMeshes.length === 0) {
        console.warn('[RealityMap] Filter removed all collision meshes — using full OBJ');
        collisionMeshes.push(obj);
    }

    function centerOf(mesh) {
        if (!mesh) return null;
        const box = new THREE.Box3().setFromObject(mesh);
        const c2 = new THREE.Vector3();
        box.getCenter(c2);
        return c2;
    }

    const bboxSizeFinal = bbox.getSize(new THREE.Vector3());
    const bboxCenter = bbox.getCenter(new THREE.Vector3());

    const spawnDefault = new THREE.Vector3(
        bbox.min.x + bboxSizeFinal.x * 0.15, 0,
        bbox.min.z + bboxSizeFinal.z * 0.15
    );
    const exitDefault = new THREE.Vector3(
        bbox.max.x - bboxSizeFinal.x * 0.15, 0,
        bbox.max.z - bboxSizeFinal.z * 0.15
    );

    let spawnPos = centerOf(spawnMesh) || spawnDefault;
    const entityPos = centerOf(entityMesh) || new THREE.Vector3(bboxCenter.x, 0, bboxCenter.z);
    const exitPos = centerOf(exitMesh) || exitDefault;

    if (new THREE.Vector3().subVectors(exitPos, spawnPos).length() < 4.0) {
        exitPos.x = spawnPos.x + bboxSizeFinal.x * 0.7;
        exitPos.z = spawnPos.z + bboxSizeFinal.z * 0.7;
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
    const probe = tileSize * 0.5;
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

    const exitLight = new THREE.PointLight(0x66aaff, 2.0, 8, 1.5);
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
        totalSize: size * tileSize,
        collisionMeshes,          
        useMeshCollision: true,
        hasEntity: false,
    };
}

import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { Reflector } from 'three/addons/objects/Reflector.js';

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

export function generateRealityMap(scene, size, wallHeight, tileSize) {
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
        console.warn('[RealityMap] No preloaded OBJ');
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

    const grassMat = new THREE.MeshStandardMaterial({ map: grassTex, roughness: 0.9,  metalness: 0.0 });
    const grayMat  = new THREE.MeshStandardMaterial({ map: grayTex,  roughness: 0.7,  metalness: 0.15 });
    const whiteMat = new THREE.MeshStandardMaterial({ map: whiteTex, roughness: 0.6,  metalness: 0.1 });
    const blackMat = new THREE.MeshStandardMaterial({ map: blackTex, roughness: 0.85, metalness: 0.05 });

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
            group.add(reflector);

            mm.visible = false;
            mm.raycast = () => {};
        } catch (e) {
            console.warn('[RealityMap] Mirror convert failed', e);
        }
    }

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
        bbox.min.x + bboxSize.x * 0.15, 0,
        bbox.min.z + bboxSize.z * 0.15
    );
    const exitDefault = new THREE.Vector3(
        bbox.max.x - bboxSize.x * 0.15, 0,
        bbox.max.z - bboxSize.z * 0.15
    );

    let spawnPos = centerOf(spawnMesh) || spawnDefault;
    const entityPos = centerOf(entityMesh) || new THREE.Vector3(bboxCenter.x, 0, bboxCenter.z);
    const exitPos = centerOf(exitMesh) || exitDefault;

    if (new THREE.Vector3().subVectors(exitPos, spawnPos).length() < 4.0) {
        exitPos.x = spawnPos.x + bboxSize.x * 0.7;
        exitPos.z = spawnPos.z + bboxSize.z * 0.7;
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
        totalSize: size * tileSize
    };
}

import * as THREE from 'https://cdn.skypack.dev/three@0.134.0/build/three.module.js';
import { OrbitControls } from 'https://cdn.skypack.dev/three@0.134.0/examples/jsm/controls/OrbitControls.js';
import { FBXLoader } from 'https://cdn.skypack.dev/three@0.134.0/examples/jsm/loaders/FBXLoader.js';
import Stats from 'https://cdn.skypack.dev/three@0.134.0/examples/jsm/libs/stats.module.js';
import { GUI } from 'https://cdn.skypack.dev/three@0.134.0/examples/jsm/libs/dat.gui.module.js';
import * as CANNON from 'https://cdn.jsdelivr.net/npm/cannon-es@0.19.0/dist/cannon-es.js';

let camera, controls, scene, renderer, stats, object, mixer, guiMorphsFolder;
let world;
const clock = new THREE.Clock();
const physicsObjects = [];
const assets = [
    'Rumba Dancing',
    'Boxing',
    'Catwalk Walk Turn 180 Tight',
    'Angry',
    'Singing'
];
const params = {
    asset: 'Rumba Dancing'
};

const keyStates = {};

const WALK_SPEED = 100;
const RUN_SPEED = 300;

init();

function init() {
    const container = document.createElement('div');
    document.body.appendChild(container);

    // Camera
    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 2000);
    camera.position.set(200, 400, 800);

    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    scene.fog = new THREE.Fog(0x000000, 200, 1500);

    // Lights
    const hemiLight = new THREE.HemisphereLight(0x68FFFF, 0xFFFAC5, 5);
    hemiLight.position.set(0, 400, 0);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 5);
    dirLight.position.set(0, 200, 100);
    dirLight.castShadow = true;
    dirLight.shadow.camera.top = 180;
    dirLight.shadow.camera.bottom = -100;
    dirLight.shadow.camera.left = -120;
    dirLight.shadow.camera.right = 120;
    scene.add(dirLight);

    // Initialize physics
    initPhysics();

    // Custom Ground with stars
    createCustomGround();

    // Add particles
    createParticles();

    // Grid helper
    const grid = new THREE.GridHelper(2000, 20, 0x00ff00, 0x00ff00);
    grid.material.opacity = 0.2;
    grid.material.transparent = true;
    scene.add(grid);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    // Orbit controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 100, 0);
    controls.update();

    // Stats
    stats = new Stats();
    container.appendChild(stats.dom);

    // GUI
    const gui = new GUI();
    gui.add(params, 'asset', assets).onChange(function (value) {
        loadAsset(value);
    });

    guiMorphsFolder = gui.addFolder('Morphs').hide();

    // Load default asset
    loadAsset(params.asset);

    // Event listeners
    window.addEventListener('resize', onWindowResize);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    // Start rendering loop
    animate();
}

function initPhysics() {
    world = new CANNON.World();
    world.gravity.set(0, -9.82, 0);

    // Create materials
    const groundMaterial = new CANNON.Material('groundMaterial');
    const starMaterial = new CANNON.Material('starMaterial');

    // Define contact material with high restitution (bounce)
    const groundStarContactMaterial = new CANNON.ContactMaterial(groundMaterial, starMaterial, {
        friction: 0.4,
        restitution: 0.9 // High restitution for bouncing
    });

    // Add contact material to the world
    world.addContactMaterial(groundStarContactMaterial);

    // Ground physics
    const groundShape = new CANNON.Plane();
    const groundBody = new CANNON.Body({ mass: 0, material: groundMaterial });
    groundBody.addShape(groundShape);
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    world.addBody(groundBody);
}

function createCustomGround() {
    // Geometry for the floor
    let floorGeometry = new THREE.PlaneGeometry(3000, 3000, 100, 100);
    floorGeometry.rotateX(-Math.PI / 2);

    // Randomize vertex positions for some variation
    let vertex = new THREE.Vector3();
    let position = floorGeometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
        vertex.fromBufferAttribute(position, i);
        vertex.x += Math.random();
        vertex.y += Math.random();
        vertex.z += Math.random();
        position.setXYZ(i, vertex.x, vertex.y, vertex.z);
    }

    // Set vertex colors
    const colorsFloor = [];
    const color = new THREE.Color();
    for (let i = 0; i < position.count; i++) {
        color.setHSL(Math.random() * 0.3 + 0.5, 0.75, Math.random() * 0.25 + 0.75);
        colorsFloor.push(color.r, color.g, color.b);
    }
    floorGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colorsFloor, 3));

    // Material for the floor
    const floorMaterial = new THREE.MeshPhongMaterial({
        vertexColors: true,
        side: THREE.DoubleSide,
        flatShading: true,
        shininess: 0,
    });

    // Create the floor mesh
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.receiveShadow = true;
    scene.add(floor);

    // Geometry for the stars
    const starGeometry = new THREE.SphereGeometry(25, 32, 32);

    // Material for the stars
    const material = new THREE.MeshPhongMaterial({
        color: new THREE.Color(Math.random(), Math.random(), Math.random()),
        specular: 0xff00ff,
        flatShading: false,
        vertexColors: false
    });

    // Create random stars
    for (let i = 0; i < 500; i++) {
        const star = new THREE.Mesh(starGeometry, material);
        star.position.x = Math.random() * 3000 - 1500;
        star.position.y = Math.random() * 1000 + 10;
        star.position.z = Math.random() * 3000 - 1500;
        star.castShadow = true;
        scene.add(star);
        createStarPhysics(star);
    }
}

function createStarPhysics(starMesh) {
    if (!world) {
        console.error('Physics world not initialized!');
        return;
    }
    const starShape = new CANNON.Sphere(25);
    const starBody = new CANNON.Body({ mass: 1, shape: starShape });
    starBody.position.copy(starMesh.position);
    starBody.quaternion.copy(starMesh.quaternion);
    world.addBody(starBody);

    physicsObjects.push({ mesh: starMesh, body: starBody });
}

function createParticles() {
    const particleCount = 10000;
    const particles = new THREE.BufferGeometry();
    const pMaterial = new THREE.PointsMaterial({
        color: 0xFFFFFF,
        size: 5,
        blending: THREE.AdditiveBlending,
        transparent: true
    });

    const positions = [];
    for (let i = 0; i < particleCount; i++) {
        positions.push((Math.random() * 2000) - 1000);
        positions.push((Math.random() * 2000) - 1000);
        positions.push((Math.random() * 2000) - 1000);
    }

    particles.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const particleSystem = new THREE.Points(particles, pMaterial);
    scene.add(particleSystem);
}

function loadAsset(asset) {
    const loader = new FBXLoader();
    loader.load('models/fbx/' + asset + '.fbx', function (group) {
        console.log('FBX asset loaded:', asset);
        
        if (object) {
            console.log('Removing previous object from scene.');
            if (object.children) {
                object.traverse(function (child) {
                    if (child.material) child.material.dispose();
                    if (child.material && child.material.map) child.material.map.dispose();
                    if (child.geometry) child.geometry.dispose();
                });
            }
            scene.remove(object);
        }

        object = group;
        object.position.set(0, 0, 0);

        mixer = new THREE.AnimationMixer(object);
        const action = mixer.clipAction(object.animations[0]);
        action.play();

        object.traverse(function (child) {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
            if (child.morphTargetInfluences) {
                createMorphsFolder(child);
            }
        });

        scene.add(object);
    }, undefined, function (error) {
        console.error('An error happened', error);
    });
}

function createMorphsFolder(child) {
    guiMorphsFolder.show();
    guiMorphsFolder.domElement.innerHTML = ''; // Clear previous contents
    const keys = Object.keys(child.morphTargetDictionary);
    for (let i = 0; i < keys.length; i++) {
        guiMorphsFolder.add(child.morphTargetInfluences, i, 0, 1, 0.01).name(keys[i]);
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function onKeyDown(event) {
    keyStates[event.code] = true;
}

function onKeyUp(event) {
    keyStates[event.code] = false;
}

function moveCharacter(delta) {
    if (!object) return;

    let speed = 0;
    if (keyStates['ShiftLeft']) {
        speed = RUN_SPEED;
    } else {
        speed = WALK_SPEED;
    }

    if (keyStates['KeyW'] || keyStates['KeyS'] || keyStates['KeyA'] || keyStates['KeyD']) {
        if (keyStates['KeyW']) {
            object.position.z -= speed * delta;
        }
        if (keyStates['KeyS']) {
            object.position.z += speed * delta;
        }
        if (keyStates['KeyA']) {
            object.position.x -= speed * delta;
        }
        if (keyStates['KeyD']) {
            object.position.x += speed * delta;
        }
    } else {
        // Detener al personaje
        if (mixer) {
            mixer.timeScale = 0;
        }
    }
}

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    if (mixer) {
        mixer.update(delta);
        if (!keyStates['KeyW'] && !keyStates['KeyS'] && !keyStates['KeyA'] && !keyStates['KeyD']) {
            mixer.timeScale = 0; // Pausar la animación cuando el personaje está detenido
        } else {
            mixer.timeScale = 1; // Reanudar la animación cuando el personaje está en movimiento
        }
    }

    moveCharacter(delta);

    updatePhysics(delta);

    renderer.render(scene, camera);
    stats.update();
}

function updatePhysics(deltaTime) {
    world.step(1 / 60, deltaTime, 3);

    physicsObjects.forEach((obj) => {
        obj.mesh.position.copy(obj.body.position);
        obj.mesh.quaternion.copy(obj.body.quaternion);
    });

    // Comprueba si los objetos han tocado el suelo y ajusta la gravedad para que apunte hacia arriba
    if (checkObjectsTouchingGround()) {
        world.gravity.set(0, 20, 0); // Ajusta la gravedad para que apunte hacia arriba
    } else {
        world.gravity.set(0, -20, 0); // Vuelve a ajustar la gravedad normal
    }
}

function checkObjectsTouchingGround() {
}


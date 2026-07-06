import * as THREE from 'three';
import { fetchModel, saveModel } from './api-client.js';
import { buildMaterials } from './material-loader.js';
import { buildSceneGraph } from './scene-builder.js';
import { setupControls } from './controls.js';
import { buildNodeTree, highlightTreeNode, updateProperties } from './node-tree.js';
import { findWheelNodes, findSteerNodes, createWheelAnimator, createSteerAnimator } from './wheel-animation.js';

const canvas = document.getElementById('canvas3d');
const loadingOverlay = document.getElementById('loading-overlay');
const loadingText = document.getElementById('loading-text');
const statusText = document.getElementById('status-text');
const treeContainer = document.getElementById('node-tree');
const propContent = document.getElementById('prop-content');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd0d0d8);

const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 1000);
camera.position.set(5, 3, 5);

// --- Generate environment map for realistic reflections ---
function createEnvMap() {
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    const envScene = new THREE.Scene();
    envScene.background = new THREE.Color(0xdde0e8);
    envScene.add(new THREE.HemisphereLight(0xffffff, 0x888899, 1.5));
    const envRT = pmrem.fromScene(envScene, 0);
    pmrem.dispose();
    return envRT.texture;
}

// --- Bright white studio lighting ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
scene.add(ambientLight);

const hemiLight = new THREE.HemisphereLight(0xffffff, 0x8888aa, 0.8);
scene.add(hemiLight);

const keyLight = new THREE.DirectionalLight(0xfff8f0, 1.8);
keyLight.position.set(5, 10, 7);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xf0f0ff, 0.8);
fillLight.position.set(-8, 6, -2);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0xffffff, 0.6);
rimLight.position.set(-2, 4, -8);
scene.add(rimLight);

const bottomFill = new THREE.DirectionalLight(0xeeeeff, 0.3);
bottomFill.position.set(0, -2, 4);
scene.add(bottomFill);

const groundPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(50, 50),
    new THREE.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 0.85, metalness: 0 })
);
groundPlane.rotation.x = -Math.PI / 2;
groundPlane.position.y = -0.01;
scene.add(groundPlane);

const gridHelper = new THREE.GridHelper(20, 40, 0xbbbbbb, 0xaaaaaa);
gridHelper.position.y = 0.001;
scene.add(gridHelper);

let controls, nodeMap, wheelAnimator, steerAnimator, modelData;

const NUDGE_STEP = 0.005;
const NUDGE_STEP_FAST = 0.05;

async function init() {
    try {
        loadingText.textContent = 'Preparing environment...';
        const envMap = createEnvMap();
        scene.environment = envMap;

        loadingText.textContent = 'Fetching model data...';
        modelData = await fetchModel();
        statusText.textContent = modelData.filename;

        loadingText.textContent = 'Loading materials...';
        const materials = await buildMaterials(modelData.materials, envMap);

        loadingText.textContent = 'Building scene...';
        const result = await buildSceneGraph(
            modelData.root_node,
            materials,
            (loaded, total) => {
                loadingText.textContent = `Loading meshes... ${loaded}/${total}`;
            }
        );

        nodeMap = result.nodeMap;
        scene.add(result.rootGroup);

        const box = new THREE.Box3().setFromObject(result.rootGroup);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3()).length();
        camera.position.copy(center).add(new THREE.Vector3(size * 0.6, size * 0.4, size * 0.6));

        controls = setupControls(camera, renderer, scene, result.meshNodes, onNodeSelected, onNodeDeselected);
        controls.orbit.target.copy(center);
        controls.orbit.update();

        buildNodeTree(treeContainer, modelData.root_node, (nodeId) => {
            controls.selectByNodeId(nodeId, nodeMap);
        });

        const wheels = findWheelNodes(nodeMap);
        wheelAnimator = createWheelAnimator(wheels);
        console.log('Wheel nodes found:', wheels.map(w => w.name));

        const steers = findSteerNodes(nodeMap);
        steerAnimator = createSteerAnimator(steers);

        statusText.textContent = `${modelData.filename} | ${nodeMap.size} nodes | ${wheels.length} wheels`;

        setupToolbar();
        setupNudgeButtons();

        loadingOverlay.classList.add('hidden');
    } catch (err) {
        loadingText.textContent = `Error: ${err.message}`;
        console.error(err);
    }
}

function onNodeSelected(nodeId) {
    if (nodeId !== null) {
        highlightTreeNode(treeContainer, nodeId);
        updateProperties(propContent, nodeId, nodeMap);
    } else {
        updateProperties(propContent, null, null);
    }
}

function onNodeDeselected() {
    if (wheelAnimator) wheelAnimator.refreshBases();
    if (steerAnimator) steerAnimator.refreshBases();
}

function setupToolbar() {
    const btnTranslate = document.getElementById('btn-translate');
    const btnRotate = document.getElementById('btn-rotate');
    const btnScale = document.getElementById('btn-scale');
    const btnFocus = document.getElementById('btn-focus');
    const btnSave = document.getElementById('btn-save');
    const btnWheelSpin = document.getElementById('btn-wheel-spin');
    const wheelSpeed = document.getElementById('wheel-speed');
    let wheelSpinning = false;
    const steerAngle = document.getElementById('steer-angle');
    const steerLabel = document.getElementById('steer-label');

    function setActiveBtn(btn) {
        [btnTranslate, btnRotate, btnScale].forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    }

    btnTranslate.addEventListener('click', () => { controls.setMode('translate'); setActiveBtn(btnTranslate); });
    btnRotate.addEventListener('click', () => { controls.setMode('rotate'); setActiveBtn(btnRotate); });
    btnScale.addEventListener('click', () => { controls.setMode('scale'); setActiveBtn(btnScale); });
    btnFocus.addEventListener('click', () => controls.focusSelected());

    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT') return;
        switch (e.key.toLowerCase()) {
            case 'g': controls.setMode('translate'); setActiveBtn(btnTranslate); break;
            case 'r': controls.setMode('rotate'); setActiveBtn(btnRotate); break;
            case 's': controls.setMode('scale'); setActiveBtn(btnScale); break;
            case 'f': controls.focusSelected(); break;
            case 'w': toggleWheelSpin(); break;
            case 'escape': controls.detachSelected(); break;
        }
        const step = e.shiftKey ? NUDGE_STEP_FAST : NUDGE_STEP;
        switch (e.key) {
            case 'ArrowRight': e.preventDefault(); controls.nudge('x', step); break;
            case 'ArrowLeft': e.preventDefault(); controls.nudge('x', -step); break;
            case 'ArrowUp': e.preventDefault(); controls.nudge(e.ctrlKey ? 'y' : 'z', e.ctrlKey ? step : -step); break;
            case 'ArrowDown': e.preventDefault(); controls.nudge(e.ctrlKey ? 'y' : 'z', e.ctrlKey ? -step : step); break;
        }
    });

    function toggleWheelSpin() {
        wheelSpinning = !wheelSpinning;
        if (wheelSpinning) {
            const sel = controls.getSelected();
            if (sel && /^WHEEL_/.test(sel.name)) controls.detachSelected();
        }
        wheelAnimator.setSpinning(wheelSpinning);
        btnWheelSpin.classList.toggle('active', wheelSpinning);
    }

    btnWheelSpin.addEventListener('click', toggleWheelSpin);
    wheelSpeed.addEventListener('input', () => wheelAnimator.setSpeed(parseFloat(wheelSpeed.value)));

    steerAngle.addEventListener('input', () => {
        const deg = parseInt(steerAngle.value);
        steerLabel.textContent = `${deg}°`;
        steerAnimator.setAngle(deg);
    });
    steerAngle.addEventListener('dblclick', () => {
        steerAngle.value = 0;
        steerLabel.textContent = '0°';
        steerAnimator.reset();
    });

    btnSave.addEventListener('click', async () => {
        btnSave.disabled = true;
        btnSave.textContent = 'Saving...';
        try {
            const result = await saveModel();
            btnSave.textContent = 'Saved!';
            statusText.textContent = `Saved to ${result.path}`;
            setTimeout(() => { btnSave.textContent = 'Save KN5'; btnSave.disabled = false; }, 2000);
        } catch (err) {
            btnSave.textContent = 'Error!';
            console.error(err);
            setTimeout(() => { btnSave.textContent = 'Save KN5'; btnSave.disabled = false; }, 2000);
        }
    });
}

function setupNudgeButtons() {
    document.querySelectorAll('.nudge-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const axis = btn.dataset.axis;
            const dir = parseInt(btn.dataset.dir);
            const step = e.shiftKey ? NUDGE_STEP_FAST : NUDGE_STEP;
            controls.nudge(axis, dir * step);
        });
    });
}

function resize() {
    const vp = document.getElementById('viewport');
    const w = vp.clientWidth;
    const h = vp.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
}

const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const dt = clock.getDelta();
    if (controls) controls.orbit.update();
    if (wheelAnimator) wheelAnimator.update(dt);
    renderer.render(scene, camera);
}

window.addEventListener('resize', resize);
resize();
animate();
init();

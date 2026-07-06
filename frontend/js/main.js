import * as THREE from 'three';
import { uploadFile, fetchModel, downloadModel, resetTransforms } from './api-client.js';
import { buildMaterials } from './material-loader.js';
import { buildSceneGraph } from './scene-builder.js';
import { setupControls } from './controls.js';
import { buildNodeTree, highlightTreeNodes, updateProperties } from './node-tree.js';
import { findWheelNodes, findSteerNodes, createWheelAnimator, createSteerAnimator } from './wheel-animation.js';

const canvas = document.getElementById('canvas3d');
const uploadOverlay = document.getElementById('upload-overlay');
const uploadZone = document.getElementById('upload-zone');
const fileInput = document.getElementById('file-input');
const loadingOverlay = document.getElementById('loading-overlay');
const loadingText = document.getElementById('loading-text');
const statusText = document.getElementById('status-text');
const treeContainer = document.getElementById('node-tree');
const propContent = document.getElementById('prop-content');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.8;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd0d0d8);

const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 1000);
camera.position.set(5, 3, 5);

function createEnvMap() {
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    const envScene = new THREE.Scene();
    envScene.background = new THREE.Color(0xdde0e8);
    envScene.add(new THREE.HemisphereLight(0xffffff, 0x888899, 1.0));
    const envRT = pmrem.fromScene(envScene, 0);
    pmrem.dispose();
    return envRT.texture;
}

const ambientLight = new THREE.AmbientLight(0xffffff, 0.15);
scene.add(ambientLight);

const hemiLight = new THREE.HemisphereLight(0xffffff, 0x8888aa, 0.4);
scene.add(hemiLight);

const keyLight = new THREE.DirectionalLight(0xfff8f0, 1.2);
keyLight.position.set(5, 10, 7);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xf0f0ff, 0.5);
fillLight.position.set(-8, 6, -2);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0xffffff, 0.4);
rimLight.position.set(-2, 4, -8);
scene.add(rimLight);

const bottomFill = new THREE.DirectionalLight(0xeeeeff, 0.2);
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
let modelGroup = null;
let originalMatrices = new Map();

const NUDGE_STEP = 0.005;
const NUDGE_STEP_FAST = 0.05;

// --- Upload handling ---

function setupUpload() {
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) handleFile(e.target.files[0]);
    });

    uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.classList.add('drag-over');
    });
    uploadZone.addEventListener('dragleave', () => {
        uploadZone.classList.remove('drag-over');
    });
    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('drag-over');
        if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
    });
}

async function handleFile(file) {
    if (!file.name.toLowerCase().endsWith('.kn5')) {
        alert('Please select a .kn5 file');
        return;
    }
    uploadOverlay.classList.add('hidden');
    loadingOverlay.classList.remove('hidden');

    try {
        loadingText.textContent = 'Uploading file...';
        await uploadFile(file);

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

        if (modelGroup) scene.remove(modelGroup);
        nodeMap = result.nodeMap;
        modelGroup = result.rootGroup;
        scene.add(modelGroup);

        const box = new THREE.Box3().setFromObject(modelGroup);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3()).length();
        camera.position.copy(center).add(new THREE.Vector3(size * 0.6, size * 0.4, size * 0.6));

        controls = setupControls(camera, renderer, scene, result.meshNodes, onNodeSelected, onNodeDeselected);
        controls.orbit.target.copy(center);
        controls.orbit.update();

        originalMatrices.clear();
        for (const [nid, obj] of nodeMap) {
            originalMatrices.set(nid, obj.matrix.toArray());
        }

        treeContainer.innerHTML = '';
        buildNodeTree(treeContainer, modelData.root_node, (nodeId) => {
            controls.selectByNodeId(nodeId, nodeMap);
        }, (nodeId) => {
            controls.toggleSelectByNodeId(nodeId, nodeMap);
            const selectedIds = controls.getSelectedNodeIds();
            const primary = controls.getSelected();
            highlightTreeNodes(treeContainer, selectedIds, primary ? primary.userData.nodeId : null);
        });

        const wheels = findWheelNodes(nodeMap);
        wheelAnimator = createWheelAnimator(wheels);

        const steers = findSteerNodes(nodeMap);
        steerAnimator = createSteerAnimator(steers);

        statusText.textContent = `${modelData.filename} | ${nodeMap.size} nodes | ${wheels.length} wheels`;

        enableToolbar();
        setupToolbar();
        setupNudgeButtons();

        loadingOverlay.classList.add('hidden');
    } catch (err) {
        loadingText.textContent = `Error: ${err.message}`;
        console.error(err);
        setTimeout(() => {
            loadingOverlay.classList.add('hidden');
            uploadOverlay.classList.remove('hidden');
        }, 3000);
    }
}

function onNodeSelected(nodeId) {
    if (nodeId !== null) {
        const selectedIds = controls.getSelectedNodeIds();
        highlightTreeNodes(treeContainer, selectedIds, nodeId);
        updateProperties(propContent, nodeId, nodeMap,
            (axis, value) => controls.setPosition(axis, value),
            (action) => {
                if (action === 'origin-to-geo') controls.setOriginToGeometry();
                else if (action === 'geo-to-origin') controls.setGeometryToOrigin();
            });
    } else {
        highlightTreeNodes(treeContainer, new Set(), null);
        updateProperties(propContent, null, null);
    }
}

function onNodeDeselected() {
    if (wheelAnimator) wheelAnimator.refreshBases();
    if (steerAnimator) steerAnimator.refreshBases();
}

function enableToolbar() {
    document.querySelectorAll('#toolbar button, #toolbar input, .nudge-btn').forEach(el => {
        el.disabled = false;
    });
}

function setupToolbar() {
    const btnTranslate = document.getElementById('btn-translate');
    const btnRotate = document.getElementById('btn-rotate');
    const btnScale = document.getElementById('btn-scale');
    const btnFocus = document.getElementById('btn-focus');
    const btnUndo = document.getElementById('btn-undo');
    const btnRedo = document.getElementById('btn-redo');
    const btnReset = document.getElementById('btn-reset');
    const btnDownload = document.getElementById('btn-download');
    const btnWheelSpin = document.getElementById('btn-wheel-spin');
    const wheelSpeed = document.getElementById('wheel-speed');
    let wheelSpinning = false;
    const steerAngle = document.getElementById('steer-angle');
    const steerLabel = document.getElementById('steer-label');

    function setActiveBtn(btn) {
        [btnTranslate, btnRotate, btnScale].forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    }

    btnTranslate.onclick = () => { controls.setMode('translate'); setActiveBtn(btnTranslate); };
    btnRotate.onclick = () => { controls.setMode('rotate'); setActiveBtn(btnRotate); };
    btnScale.onclick = () => { controls.setMode('scale'); setActiveBtn(btnScale); };
    btnFocus.onclick = () => controls.focusSelected();
    btnUndo.onclick = () => controls.undo();
    btnRedo.onclick = () => controls.redo();
    btnReset.onclick = async () => {
        controls.resetAllTransforms(nodeMap, originalMatrices);
        await resetTransforms();
        if (wheelAnimator) wheelAnimator.refreshBases();
        if (steerAnimator) steerAnimator.refreshBases();
    };

    document.onkeydown = (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
            e.preventDefault();
            controls.undo();
            return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
            e.preventDefault();
            controls.redo();
            return;
        }
        if (e.target.tagName === 'INPUT') return;
        switch (e.key.toLowerCase()) {
            case 'g': controls.setMode('translate'); setActiveBtn(btnTranslate); break;
            case 'r': controls.setMode('rotate'); setActiveBtn(btnRotate); break;
            case 's': controls.setMode('scale'); setActiveBtn(btnScale); break;
            case 'f': controls.focusSelected(); break;
            case 'w': toggleWheelSpin(); break;
            case 'escape': controls.detachSelected(); break;
        }
        if (e.ctrlKey || e.metaKey) return;
        const step = e.shiftKey ? NUDGE_STEP_FAST : NUDGE_STEP;
        switch (e.key) {
            case 'ArrowRight': e.preventDefault(); controls.nudge('x', step); break;
            case 'ArrowLeft': e.preventDefault(); controls.nudge('x', -step); break;
            case 'ArrowUp': e.preventDefault(); controls.nudge(e.ctrlKey ? 'y' : 'z', e.ctrlKey ? step : -step); break;
            case 'ArrowDown': e.preventDefault(); controls.nudge(e.ctrlKey ? 'y' : 'z', e.ctrlKey ? -step : step); break;
        }
    };

    function toggleWheelSpin() {
        wheelSpinning = !wheelSpinning;
        if (wheelSpinning) {
            const sel = controls.getSelected();
            if (sel && /^WHEEL_/.test(sel.name)) controls.detachSelected();
        }
        wheelAnimator.setSpinning(wheelSpinning);
        btnWheelSpin.classList.toggle('active', wheelSpinning);
    }

    btnWheelSpin.onclick = toggleWheelSpin;
    wheelSpeed.oninput = () => wheelAnimator.setSpeed(parseFloat(wheelSpeed.value));

    steerAngle.oninput = () => {
        const deg = parseInt(steerAngle.value);
        steerLabel.textContent = `${deg}°`;
        steerAnimator.setAngle(deg);
    };
    steerAngle.ondblclick = () => {
        steerAngle.value = 0;
        steerLabel.textContent = '0°';
        steerAnimator.reset();
    };

    btnDownload.onclick = async () => {
        btnDownload.disabled = true;
        btnDownload.textContent = 'Downloading...';
        try {
            await downloadModel();
            btnDownload.textContent = 'Done!';
            setTimeout(() => { btnDownload.textContent = 'Download KN5'; btnDownload.disabled = false; }, 2000);
        } catch (err) {
            btnDownload.textContent = 'Error!';
            console.error(err);
            setTimeout(() => { btnDownload.textContent = 'Download KN5'; btnDownload.disabled = false; }, 2000);
        }
    };
}

function setupNudgeButtons() {
    document.querySelectorAll('.nudge-btn').forEach(btn => {
        btn.onclick = (e) => {
            const axis = btn.dataset.axis;
            const dir = parseInt(btn.dataset.dir);
            const step = e.shiftKey ? NUDGE_STEP_FAST : NUDGE_STEP;
            controls.nudge(axis, dir * step);
        };
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
setupUpload();

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { updateTransform } from './api-client.js';

export function setupControls(camera, renderer, scene, meshNodes, onSelect, onDeselect) {
    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = true;
    orbit.dampingFactor = 0.1;

    const transform = new TransformControls(camera, renderer.domElement);
    transform.setSize(0.8);
    scene.add(transform);

    transform.addEventListener('dragging-changed', (e) => {
        orbit.enabled = !e.value;
        if (!e.value && transform.object) {
            syncTransformToBackend(transform.object);
        }
    });

    transform.addEventListener('objectChange', () => {
        const obj = transform.object;
        if (!obj) return;
        obj.updateMatrix();
        if (onSelect) onSelect(obj.userData.nodeId);
    });

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let selectedObject = null;
    let originalMaterials = new Map();

    function clearHighlight() {
        for (const [obj, mat] of originalMaterials) {
            obj.material = mat;
        }
        originalMaterials.clear();
    }

    function applyHighlight(obj) {
        if (!obj) return;
        const targets = [];
        if (obj.isMesh) targets.push(obj);
        if (obj.isGroup) obj.traverse(c => { if (c.isMesh) targets.push(c); });

        for (const mesh of targets) {
            if (!mesh.material || originalMaterials.has(mesh)) continue;
            originalMaterials.set(mesh, mesh.material);
            const hlMat = mesh.material.clone();
            hlMat.emissive = new THREE.Color(0xffffff);
            hlMat.emissiveIntensity = 0.12;
            mesh.material = hlMat;
        }
    }

    function finalizeObject(obj) {
        if (!obj) return;
        obj.updateMatrix();
        obj.matrixAutoUpdate = false;
        syncTransformToBackend(obj);
    }

    function select(obj) {
        if (selectedObject === obj) return;
        clearHighlight();
        if (selectedObject) {
            finalizeObject(selectedObject);
            if (onDeselect) onDeselect();
        }
        selectedObject = obj;
        if (obj) {
            obj.matrixAutoUpdate = true;
            obj.matrix.decompose(obj.position, obj.quaternion, obj.scale);
            transform.attach(obj);
            applyHighlight(obj);
            if (onSelect) onSelect(obj.userData.nodeId);
        } else {
            transform.detach();
            if (onSelect) onSelect(null);
        }
    }

    function selectByNodeId(nodeId, nodeMap) {
        if (nodeId === null) { select(null); return; }
        const obj = nodeMap.get(nodeId);
        if (obj) select(obj);
    }

    renderer.domElement.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || transform.dragging) return;
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(meshNodes, false);
        if (intersects.length > 0) select(intersects[0].object);
    });

    function setMode(mode) { transform.setMode(mode); }

    function focusSelected() {
        if (!selectedObject) return;
        const box = new THREE.Box3().setFromObject(selectedObject);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3()).length();
        orbit.target.copy(center);
        camera.position.copy(center).add(new THREE.Vector3(size, size * 0.5, size));
        orbit.update();
    }

    function detachSelected() {
        clearHighlight();
        if (selectedObject) finalizeObject(selectedObject);
        transform.detach();
        selectedObject = null;
        if (onDeselect) onDeselect();
        if (onSelect) onSelect(null);
    }

    function nudge(axis, amount) {
        if (!selectedObject) return;
        selectedObject.position[axis] += amount;
        selectedObject.updateMatrix();
        syncTransformToBackend(selectedObject);
        if (onSelect) onSelect(selectedObject.userData.nodeId);
    }

    function syncTransformToBackend(obj) {
        const nodeId = obj.userData.nodeId;
        if (nodeId !== undefined) updateTransform(nodeId, obj.matrix.elements);
    }

    return { orbit, transform, select, selectByNodeId, setMode, focusSelected, detachSelected, nudge, getSelected: () => selectedObject };
}

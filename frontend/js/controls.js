import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { updateTransform, updateOrigin } from './api-client.js';

export function setupControls(camera, renderer, scene, meshNodes, onSelect, onDeselect) {
    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = true;
    orbit.dampingFactor = 0.1;

    const transform = new TransformControls(camera, renderer.domElement);
    transform.setSize(0.8);
    scene.add(transform);

    const undoStack = [];
    const redoStack = [];
    const MAX_UNDO = 100;
    let beforeDragMatrix = null;
    let selectedObject = null;
    const selectedSet = new Set();
    let originalMaterials = new Map();

    transform.addEventListener('dragging-changed', (e) => {
        orbit.enabled = !e.value;
        if (e.value && transform.object) {
            beforeDragMatrix = transform.object.matrix.toArray();
        }
        if (!e.value && transform.object) {
            transform.object.updateMatrix();
            const newMatrix = transform.object.matrix.toArray();
            if (beforeDragMatrix) pushUndo([{ obj: transform.object, oldMatrix: beforeDragMatrix, newMatrix }]);
            beforeDragMatrix = null;
            syncTransformToBackend(transform.object);
        }
    });

    transform.addEventListener('objectChange', () => {
        const obj = transform.object;
        if (!obj) return;
        obj.updateMatrix();
        if (onSelect) onSelect(obj.userData.nodeId);
    });

    function pushUndo(entries) {
        undoStack.push(entries);
        if (undoStack.length > MAX_UNDO) undoStack.shift();
        redoStack.length = 0;
    }

    function applyEntries(entries, getMatrix) {
        for (const entry of entries) {
            const obj = entry.obj;
            const matrix = getMatrix(entry);
            obj.matrix.fromArray(matrix);
            obj.matrix.decompose(obj.position, obj.quaternion, obj.scale);
            obj.updateMatrix();
            obj.matrixWorldNeedsUpdate = true;
            syncTransformToBackend(obj);
        }
        if (onSelect && selectedObject) onSelect(selectedObject.userData.nodeId);
    }

    function undo() {
        if (undoStack.length === 0) return;
        const entries = undoStack.pop();
        redoStack.push(entries);
        applyEntries(entries, e => e.oldMatrix);
    }

    function redo() {
        if (redoStack.length === 0) return;
        const entries = redoStack.pop();
        undoStack.push(entries);
        applyEntries(entries, e => e.newMatrix);
    }

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

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

    function removeHighlight(obj) {
        if (!obj) return;
        const targets = [];
        if (obj.isMesh) targets.push(obj);
        if (obj.isGroup) obj.traverse(c => { if (c.isMesh) targets.push(c); });
        for (const mesh of targets) {
            if (originalMaterials.has(mesh)) {
                mesh.material = originalMaterials.get(mesh);
                originalMaterials.delete(mesh);
            }
        }
    }

    function finalizeObject(obj) {
        if (!obj) return;
        obj.updateMatrix();
        obj.matrixAutoUpdate = false;
        syncTransformToBackend(obj);
    }

    function select(obj) {
        clearHighlight();
        for (const o of selectedSet) {
            if (o !== obj) finalizeObject(o);
        }
        selectedSet.clear();
        if (selectedObject && selectedObject !== obj) {
            finalizeObject(selectedObject);
            if (onDeselect) onDeselect();
        }
        selectedObject = obj;
        if (obj) {
            selectedSet.add(obj);
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

    function toggleSelect(obj) {
        if (!obj) return;
        if (selectedSet.has(obj)) {
            if (obj === selectedObject) return;
            selectedSet.delete(obj);
            removeHighlight(obj);
            finalizeObject(obj);
        } else {
            selectedSet.add(obj);
            obj.matrix.decompose(obj.position, obj.quaternion, obj.scale);
            applyHighlight(obj);
        }
    }

    function selectByNodeId(nodeId, nodeMap) {
        if (nodeId === null) { select(null); return; }
        const obj = nodeMap.get(nodeId);
        if (obj) select(obj);
    }

    function toggleSelectByNodeId(nodeId, nodeMap) {
        if (nodeId === null) return;
        const obj = nodeMap.get(nodeId);
        if (obj) toggleSelect(obj);
    }

    renderer.domElement.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || transform.dragging) return;
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(meshNodes, false);
        if (intersects.length > 0) {
            if (e.shiftKey || e.ctrlKey || e.metaKey) {
                toggleSelect(intersects[0].object);
            } else {
                select(intersects[0].object);
            }
        }
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
        for (const obj of selectedSet) finalizeObject(obj);
        selectedSet.clear();
        transform.detach();
        selectedObject = null;
        if (onDeselect) onDeselect();
        if (onSelect) onSelect(null);
    }

    function nudge(axis, amount) {
        if (selectedSet.size === 0) return;
        const entries = [];
        for (const obj of selectedSet) {
            const oldMatrix = obj.matrix.toArray();
            obj.position[axis] += amount;
            obj.updateMatrix();
            entries.push({ obj, oldMatrix, newMatrix: obj.matrix.toArray() });
            syncTransformToBackend(obj);
        }
        pushUndo(entries);
        if (onSelect && selectedObject) onSelect(selectedObject.userData.nodeId);
    }

    function setPosition(axis, value) {
        if (!selectedObject) return;
        const oldMatrix = selectedObject.matrix.toArray();
        selectedObject.position[axis] = value;
        selectedObject.updateMatrix();
        pushUndo([{ obj: selectedObject, oldMatrix, newMatrix: selectedObject.matrix.toArray() }]);
        syncTransformToBackend(selectedObject);
    }

    const pendingVertexOffsets = new Map();

    function setOriginToGeometry() {
        if (!selectedObject || !selectedObject.geometry) return;
        const geo = selectedObject.geometry;
        geo.computeBoundingBox();
        const center = new THREE.Vector3();
        geo.boundingBox.getCenter(center);
        if (center.lengthSq() < 1e-10) return;

        geo.translate(-center.x, -center.y, -center.z);
        geo.computeBoundingBox();
        geo.computeBoundingSphere();

        const offset = center.clone().multiply(selectedObject.scale);
        offset.applyQuaternion(selectedObject.quaternion);
        selectedObject.position.add(offset);
        selectedObject.updateMatrix();
        selectedObject.matrixWorldNeedsUpdate = true;

        const nodeId = selectedObject.userData.nodeId;
        const vo = [-center.x, -center.y, -center.z];
        _trackVertexOffset(nodeId, vo);
        updateOrigin(nodeId, vo, selectedObject.matrix.toArray());
        if (onSelect) onSelect(nodeId);
    }

    function setGeometryToOrigin() {
        if (!selectedObject || !selectedObject.geometry) return;
        const geo = selectedObject.geometry;
        geo.computeBoundingBox();
        const center = new THREE.Vector3();
        geo.boundingBox.getCenter(center);
        if (center.lengthSq() < 1e-10) return;

        geo.translate(-center.x, -center.y, -center.z);
        geo.computeBoundingBox();
        geo.computeBoundingSphere();

        const nodeId = selectedObject.userData.nodeId;
        const vo = [-center.x, -center.y, -center.z];
        _trackVertexOffset(nodeId, vo);
        updateOrigin(nodeId, vo, null);
        if (onSelect) onSelect(nodeId);
    }

    function _trackVertexOffset(nodeId, offset) {
        const existing = pendingVertexOffsets.get(nodeId) || [0, 0, 0];
        pendingVertexOffsets.set(nodeId, [
            existing[0] + offset[0],
            existing[1] + offset[1],
            existing[2] + offset[2],
        ]);
    }

    function resetAllTransforms(nodeMap, origMatrices) {
        detachSelected();
        for (const [nodeId, matArray] of origMatrices) {
            const obj = nodeMap.get(nodeId);
            if (!obj) continue;
            obj.matrix.fromArray(matArray);
            obj.matrix.decompose(obj.position, obj.quaternion, obj.scale);
            obj.updateMatrix();
            obj.matrixAutoUpdate = false;
            obj.matrixWorldNeedsUpdate = true;
        }
        for (const [nodeId, offset] of pendingVertexOffsets) {
            const obj = nodeMap.get(nodeId);
            if (!obj || !obj.geometry) continue;
            obj.geometry.translate(-offset[0], -offset[1], -offset[2]);
            obj.geometry.computeBoundingBox();
            obj.geometry.computeBoundingSphere();
        }
        pendingVertexOffsets.clear();
        undoStack.length = 0;
        redoStack.length = 0;
    }

    function clearHistory() {
        undoStack.length = 0;
        redoStack.length = 0;
    }

    function syncTransformToBackend(obj) {
        const nodeId = obj.userData.nodeId;
        if (nodeId !== undefined) updateTransform(nodeId, obj.matrix.elements);
    }

    function getSelectedNodeIds() {
        return new Set([...selectedSet].map(o => o.userData.nodeId));
    }

    return {
        orbit, transform, select, selectByNodeId, toggleSelectByNodeId,
        setMode, focusSelected, detachSelected,
        nudge, setPosition, setOriginToGeometry, setGeometryToOrigin,
        undo, redo, resetAllTransforms, clearHistory,
        getSelected: () => selectedObject,
        getSelectedNodeIds,
    };
}

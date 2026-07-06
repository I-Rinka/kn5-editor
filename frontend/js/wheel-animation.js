import * as THREE from 'three';

const WHEEL_NAMES = ['WHEEL_LF', 'WHEEL_RF', 'WHEEL_LR', 'WHEEL_RR'];
const STEER_NAMES = ['STEER_HR', 'STEER_LR'];

export function findWheelNodes(nodeMap) {
    const wheels = [];
    for (const [id, obj] of nodeMap) {
        if (WHEEL_NAMES.includes(obj.name)) wheels.push(obj);
    }
    return wheels;
}

export function findSteerNodes(nodeMap) {
    const steers = [];
    for (const [id, obj] of nodeMap) {
        if (STEER_NAMES.includes(obj.name)) steers.push(obj);
    }
    return steers;
}

export function createWheelAnimator(wheelNodes) {
    let spinning = false;
    let speed = 5;
    let angle = 0;
    const baseMatrices = new Map();
    for (const w of wheelNodes) baseMatrices.set(w, w.matrix.clone());

    function refreshBases() {
        for (const w of wheelNodes) {
            if (w.matrixAutoUpdate) {
                w.updateMatrix();
                w.matrixAutoUpdate = false;
            }
            baseMatrices.set(w, w.matrix.clone());
        }
        angle = 0;
    }

    function update(deltaTime) {
        if (!spinning || wheelNodes.length === 0) return;
        angle += speed * deltaTime;
        const rotMatrix = new THREE.Matrix4().makeRotationX(angle);
        for (const w of wheelNodes) {
            if (w.matrixAutoUpdate) continue;
            w.matrix.copy(baseMatrices.get(w)).multiply(rotMatrix);
            w.updateMatrixWorld(true);
        }
    }

    function setSpinning(v) {
        spinning = v;
        if (v) {
            refreshBases();
        } else {
            angle = 0;
            for (const w of wheelNodes) {
                if (w.matrixAutoUpdate) continue;
                w.matrix.copy(baseMatrices.get(w));
                w.updateMatrixWorld(true);
            }
        }
    }

    function setSpeed(v) { speed = v; }

    return { update, setSpinning, setSpeed, refreshBases };
}

export function createSteerAnimator(steerNodes) {
    let currentAngle = 0;
    const baseMatrices = new Map();
    for (const s of steerNodes) baseMatrices.set(s, s.matrix.clone());

    function refreshBases() {
        for (const s of steerNodes) {
            if (s.matrixAutoUpdate) s.updateMatrix();
            baseMatrices.set(s, s.matrix.clone());
        }
        currentAngle = 0;
    }

    function setAngle(degrees) {
        currentAngle = degrees * Math.PI / 180;
        const rotMatrix = new THREE.Matrix4().makeRotationZ(currentAngle);
        for (const s of steerNodes) {
            if (s.matrixAutoUpdate) continue;
            s.matrix.copy(baseMatrices.get(s)).multiply(rotMatrix);
            s.updateMatrixWorld(true);
        }
    }

    function reset() {
        currentAngle = 0;
        for (const s of steerNodes) {
            if (s.matrixAutoUpdate) continue;
            s.matrix.copy(baseMatrices.get(s));
            s.updateMatrixWorld(true);
        }
    }

    return { setAngle, reset, refreshBases };
}

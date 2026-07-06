const BASE = '/api';

export async function fetchModel() {
    const res = await fetch(`${BASE}/model`);
    return res.json();
}

export async function fetchGeometry(nodeId) {
    const res = await fetch(`${BASE}/node/${nodeId}/geometry`);
    return res.arrayBuffer();
}

export async function fetchTextureUrl(name) {
    return `${BASE}/texture/${encodeURIComponent(name)}`;
}

export async function updateTransform(nodeId, matrix) {
    await fetch(`${BASE}/node/${nodeId}/transform`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matrix: Array.from(matrix) }),
    });
}

export async function saveModel(filename) {
    const res = await fetch(`${BASE}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename }),
    });
    return res.json();
}

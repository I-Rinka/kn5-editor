const BASE = '/api';

export async function uploadFile(file) {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${BASE}/upload`, { method: 'POST', body: form });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Upload failed');
    }
    return res.json();
}

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

export async function resetTransforms() {
    await fetch(`${BASE}/reset-transforms`, { method: 'POST' });
}

export async function updateOrigin(nodeId, vertexOffset, matrix) {
    const body = { vertex_offset: vertexOffset };
    if (matrix) body.matrix = Array.from(matrix);
    await fetch(`${BASE}/node/${nodeId}/origin`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

export async function updateTransform(nodeId, matrix) {
    await fetch(`${BASE}/node/${nodeId}/transform`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matrix: Array.from(matrix) }),
    });
}

export async function downloadModel() {
    const res = await fetch(`${BASE}/download`, { method: 'POST' });
    if (!res.ok) throw new Error('Download failed');
    const blob = await res.blob();
    const disposition = res.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename=(.+)/);
    const filename = match ? match[1] : 'model_modified.kn5';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
}

export async function saveModel(filename) {
    const res = await fetch(`${BASE}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename }),
    });
    return res.json();
}

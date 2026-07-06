import * as THREE from 'three';
import { fetchGeometry } from './api-client.js';

function parseGeometryBuffer(buffer) {
    const view = new DataView(buffer);
    let offset = 0;

    const vertexCount = view.getUint32(offset, true);
    offset += 4;
    const vertexBytes = vertexCount * 44;

    const positions = new Float32Array(vertexCount * 3);
    const normals = new Float32Array(vertexCount * 3);
    const uvs = new Float32Array(vertexCount * 2);

    for (let i = 0; i < vertexCount; i++) {
        const base = offset + i * 44;
        positions[i * 3]     = view.getFloat32(base,      true);
        positions[i * 3 + 1] = view.getFloat32(base + 4,  true);
        positions[i * 3 + 2] = view.getFloat32(base + 8,  true);
        normals[i * 3]       = view.getFloat32(base + 12, true);
        normals[i * 3 + 1]   = view.getFloat32(base + 16, true);
        normals[i * 3 + 2]   = view.getFloat32(base + 20, true);
        uvs[i * 2]           = view.getFloat32(base + 24, true);
        uvs[i * 2 + 1]       = -view.getFloat32(base + 28, true);
    }
    offset += vertexBytes;

    const indexCount = view.getUint32(offset, true);
    offset += 4;
    const indexData = new Uint16Array(buffer, offset, indexCount);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.setIndex(new THREE.BufferAttribute(indexData, 1));
    geometry.computeBoundingSphere();

    return geometry;
}

export async function buildSceneGraph(rootNodeData, materials, loadingCallback) {
    const nodeMap = new Map();
    const meshNodes = [];
    let loaded = 0;
    let totalMeshes = 0;

    function countMeshes(n) {
        if (n.node_type === 2) totalMeshes++;
        if (n.children) n.children.forEach(countMeshes);
    }
    countMeshes(rootNodeData);

    async function buildNode(nodeData, parent) {
        if (nodeData.node_type === 1) {
            const group = new THREE.Group();
            group.name = nodeData.name;
            group.userData.nodeId = nodeData.node_id;
            group.userData.nodeType = 'group';
            group.matrixAutoUpdate = false;
            group.matrix.fromArray(nodeData.matrix);
            group.matrixWorldNeedsUpdate = true;
            parent.add(group);
            nodeMap.set(nodeData.node_id, group);

            for (const child of (nodeData.children || [])) {
                await buildNode(child, group);
            }
        } else if (nodeData.node_type === 2) {
            const buffer = await fetchGeometry(nodeData.node_id);
            const geometry = parseGeometryBuffer(buffer);
            const material = materials[nodeData.material_id] || new THREE.MeshStandardMaterial({ color: 0x888888 });

            const mesh = new THREE.Mesh(geometry, material);
            mesh.name = nodeData.name;
            mesh.userData.nodeId = nodeData.node_id;
            mesh.userData.nodeType = 'mesh';
            mesh.userData.materialId = nodeData.material_id;
            mesh.matrixAutoUpdate = false;
            mesh.matrix.fromArray(nodeData.matrix);
            mesh.matrixWorldNeedsUpdate = true;

            if (nodeData.visible === false) mesh.visible = false;

            parent.add(mesh);
            nodeMap.set(nodeData.node_id, mesh);
            meshNodes.push(mesh);

            loaded++;
            if (loadingCallback) loadingCallback(loaded, totalMeshes);

            for (const child of (nodeData.children || [])) {
                await buildNode(child, mesh);
            }
        }
    }

    const rootGroup = new THREE.Group();
    rootGroup.name = 'root';
    await buildNode(rootNodeData, rootGroup);

    return { rootGroup, nodeMap, meshNodes };
}

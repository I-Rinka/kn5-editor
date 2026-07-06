import * as THREE from 'three';
import { fetchTextureUrl } from './api-client.js';

const textureLoader = new THREE.TextureLoader();
const textureCache = new Map();

async function loadTexture(name) {
    if (textureCache.has(name)) return textureCache.get(name).clone();
    const url = await fetchTextureUrl(name);
    try {
        const tex = await new Promise((resolve, reject) => {
            textureLoader.load(url, resolve, undefined, reject);
        });
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.colorSpace = THREE.SRGBColorSpace;
        textureCache.set(name, tex);
        return tex;
    } catch (e) {
        console.warn(`Texture load failed: ${name}`, e);
        return null;
    }
}

export async function buildMaterials(materialDefs, envMap) {
    const materials = [];
    for (const mat of materialDefs) {
        const params = {
            name: mat.name,
            side: THREE.DoubleSide,
            roughness: 0.5,
            metalness: 0.0,
            envMapIntensity: 1.0,
        };

        if (envMap) params.envMap = envMap;

        const shaderLower = mat.shader.toLowerCase();
        const nameLower = mat.name.toLowerCase();

        if (shaderLower.includes('reflection') || shaderLower.includes('multimap')) {
            params.metalness = 0.4;
            params.roughness = 0.3;
        }
        if (shaderLower.includes('glass') || shaderLower.includes('alpha') || nameLower.includes('glass')) {
            params.transparent = true;
            params.opacity = 0.35;
            params.metalness = 0.1;
            params.roughness = 0.05;
            params.envMapIntensity = 2.0;
        }
        if (nameLower.includes('chrome') || nameLower.includes('aluminium') || nameLower.includes('metal')) {
            params.metalness = 0.9;
            params.roughness = 0.1;
            params.envMapIntensity = 2.0;
        }
        if (nameLower.includes('carpaint') || nameLower.includes('skin')) {
            params.metalness = 0.5;
            params.roughness = 0.2;
            params.envMapIntensity = 1.5;
        }
        if (nameLower.includes('carbon')) {
            params.metalness = 0.3;
            params.roughness = 0.3;
        }
        if (nameLower.includes('rubber') || nameLower.includes('tire') || nameLower.includes('tyre')) {
            params.metalness = 0.0;
            params.roughness = 0.9;
        }

        const diffuseMapping = mat.texture_mappings.find(m => m.mapping_name === 'txDiffuse');
        if (diffuseMapping && diffuseMapping.texture_name) {
            const tex = await loadTexture(diffuseMapping.texture_name);
            if (tex) params.map = tex;
        }

        const normalMapping = mat.texture_mappings.find(m => m.mapping_name === 'txNormal');
        if (normalMapping && normalMapping.texture_name) {
            const tex = await loadTexture(normalMapping.texture_name);
            if (tex) {
                const nmap = tex.clone();
                nmap.colorSpace = THREE.NoColorSpace;
                params.normalMap = nmap;
            }
        }

        if (mat.blend_mode === 1) {
            params.transparent = true;
            params.opacity = 0.7;
        }
        if (mat.alpha_tested) {
            params.alphaTest = 0.5;
            params.transparent = true;
        }
        if (mat.depth_mode === 1) {
            params.depthWrite = false;
        }

        materials.push(new THREE.MeshStandardMaterial(params));
    }
    return materials;
}

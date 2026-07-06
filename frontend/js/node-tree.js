import * as THREE from 'three';

export function buildNodeTree(container, rootNodeData, onNodeSelect, onNodeToggleSelect) {
    container.innerHTML = '';

    function createTreeItem(nodeData, depth) {
        const wrapper = document.createElement('div');

        const item = document.createElement('div');
        item.className = `tree-item tree-item-${nodeData.node_type === 1 ? 'group' : 'mesh'}`;
        item.style.paddingLeft = (8 + depth * 16) + 'px';
        item.dataset.nodeId = nodeData.node_id;

        const hasChildren = nodeData.children && nodeData.children.length > 0;

        const toggle = document.createElement('span');
        toggle.className = 'tree-toggle';
        toggle.textContent = hasChildren ? '▼' : ' ';
        item.appendChild(toggle);

        const icon = document.createElement('span');
        icon.className = 'tree-icon';
        icon.textContent = nodeData.node_type === 1 ? '□' : '■';
        item.appendChild(icon);

        const nameSpan = document.createElement('span');
        nameSpan.className = 'tree-name';
        nameSpan.textContent = nodeData.name;
        nameSpan.title = nodeData.name;
        item.appendChild(nameSpan);

        wrapper.appendChild(item);

        let childContainer = null;
        if (hasChildren) {
            childContainer = document.createElement('div');
            childContainer.className = 'tree-children';
            for (const child of nodeData.children) {
                childContainer.appendChild(createTreeItem(child, depth + 1));
            }
            wrapper.appendChild(childContainer);

            toggle.addEventListener('click', (e) => {
                e.stopPropagation();
                const collapsed = childContainer.classList.toggle('collapsed');
                toggle.textContent = collapsed ? '▶' : '▼';
            });
        }

        item.addEventListener('click', (e) => {
            e.stopPropagation();
            if ((e.shiftKey || e.ctrlKey || e.metaKey) && onNodeToggleSelect) {
                onNodeToggleSelect(nodeData.node_id);
            } else {
                onNodeSelect(nodeData.node_id);
            }
        });

        return wrapper;
    }

    container.appendChild(createTreeItem(rootNodeData, 0));
}

export function highlightTreeNodes(container, selectedIds, primaryId) {
    container.querySelectorAll('.tree-item.selected, .tree-item.multi-selected').forEach(el => {
        el.classList.remove('selected', 'multi-selected');
    });
    for (const id of selectedIds) {
        const item = container.querySelector(`[data-node-id="${id}"]`);
        if (item) item.classList.add(id === primaryId ? 'selected' : 'multi-selected');
    }
    if (primaryId !== null && primaryId !== undefined) {
        const primary = container.querySelector(`[data-node-id="${primaryId}"]`);
        if (primary) primary.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
}

export function updateProperties(propContent, nodeId, nodeMap, onPositionChange, onOriginAction) {
    if (!nodeId) {
        propContent.innerHTML = 'Select a node';
        return;
    }

    const obj = nodeMap ? nodeMap.get(nodeId) : null;
    if (!obj) {
        propContent.innerHTML = 'Select a node';
        return;
    }

    let html = '';
    html += `<div class="prop-row"><span class="prop-label">Name</span><span class="prop-value">${obj.name}</span></div>`;
    html += `<div class="prop-row"><span class="prop-label">Type</span><span class="prop-value">${obj.userData.nodeType}</span></div>`;

    const pos = obj.position;
    html += `<div class="prop-row prop-position">
        <span class="prop-label">Position</span>
        <span class="prop-value prop-pos-inputs">
            <label class="pos-label">X<input type="number" class="pos-input" data-axis="x" value="${pos.x.toFixed(4)}" step="0.001"></label>
            <label class="pos-label">Y<input type="number" class="pos-input" data-axis="y" value="${pos.y.toFixed(4)}" step="0.001"></label>
            <label class="pos-label">Z<input type="number" class="pos-input" data-axis="z" value="${pos.z.toFixed(4)}" step="0.001"></label>
        </span>
    </div>`;

    if (obj.userData.nodeType === 'mesh' && obj.geometry) {
        const geo = obj.geometry;
        geo.computeBoundingBox();
        const geoCenter = new THREE.Vector3();
        geo.boundingBox.getCenter(geoCenter);
        html += `<div class="prop-row"><span class="prop-label">Geo Center</span><span class="prop-value">${geoCenter.x.toFixed(3)}, ${geoCenter.y.toFixed(3)}, ${geoCenter.z.toFixed(3)}</span></div>`;
        html += `<div class="prop-origin-btns">
            <button class="origin-btn" data-action="origin-to-geo">Origin to Geometry</button>
            <button class="origin-btn" data-action="geo-to-origin">Geometry to Origin</button>
        </div>`;
        const vc = geo.attributes.position ? geo.attributes.position.count : 0;
        const ic = geo.index ? geo.index.count : 0;
        html += `<div class="prop-row"><span class="prop-label">Vertices</span><span class="prop-value">${vc}</span></div>`;
        html += `<div class="prop-row"><span class="prop-label">Triangles</span><span class="prop-value">${Math.floor(ic / 3)}</span></div>`;
    }

    if (obj.userData.materialId !== undefined) {
        html += `<div class="prop-row"><span class="prop-label">Material</span><span class="prop-value">#${obj.userData.materialId}</span></div>`;
    }

    propContent.innerHTML = html;

    if (onPositionChange) {
        propContent.querySelectorAll('.pos-input').forEach(input => {
            input.addEventListener('change', () => {
                const axis = input.dataset.axis;
                const value = parseFloat(input.value);
                if (!isNaN(value)) onPositionChange(axis, value);
            });
            input.addEventListener('keydown', (e) => e.stopPropagation());
        });
    }

    if (onOriginAction) {
        propContent.querySelectorAll('.origin-btn').forEach(btn => {
            btn.addEventListener('click', () => onOriginAction(btn.dataset.action));
        });
    }
}

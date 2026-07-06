export function buildNodeTree(container, rootNodeData, onNodeSelect) {
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
            container.querySelectorAll('.tree-item.selected').forEach(
                el => el.classList.remove('selected')
            );
            item.classList.add('selected');
            onNodeSelect(nodeData.node_id);
        });

        return wrapper;
    }

    container.appendChild(createTreeItem(rootNodeData, 0));
}

export function highlightTreeNode(container, nodeId) {
    container.querySelectorAll('.tree-item.selected').forEach(
        el => el.classList.remove('selected')
    );
    const item = container.querySelector(`[data-node-id="${nodeId}"]`);
    if (item) {
        item.classList.add('selected');
        item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
}

export function updateProperties(propContent, nodeData, nodeMap) {
    if (!nodeData) {
        propContent.innerHTML = 'Select a node';
        return;
    }

    const obj = nodeMap ? nodeMap.get(nodeData) : null;
    let html = '';

    if (obj) {
        html += `<div class="prop-row"><span class="prop-label">Name</span><span class="prop-value">${obj.name}</span></div>`;
        html += `<div class="prop-row"><span class="prop-label">Type</span><span class="prop-value">${obj.userData.nodeType}</span></div>`;

        const pos = obj.position || { x: 0, y: 0, z: 0 };
        html += `<div class="prop-row"><span class="prop-label">Position</span><span class="prop-value">${pos.x.toFixed(3)}, ${pos.y.toFixed(3)}, ${pos.z.toFixed(3)}</span></div>`;

        if (obj.userData.nodeType === 'mesh' && obj.geometry) {
            const vc = obj.geometry.attributes.position ? obj.geometry.attributes.position.count : 0;
            const ic = obj.geometry.index ? obj.geometry.index.count : 0;
            html += `<div class="prop-row"><span class="prop-label">Vertices</span><span class="prop-value">${vc}</span></div>`;
            html += `<div class="prop-row"><span class="prop-label">Triangles</span><span class="prop-value">${Math.floor(ic / 3)}</span></div>`;
        }

        if (obj.userData.materialId !== undefined) {
            html += `<div class="prop-row"><span class="prop-label">Material</span><span class="prop-value">#${obj.userData.materialId}</span></div>`;
        }
    }

    propContent.innerHTML = html || 'Select a node';
}

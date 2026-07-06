import os
import struct
import io
from flask import Blueprint, jsonify, request, Response
from . import app as app_module
from .kn5_writer import write_kn5

api_bp = Blueprint('api', __name__, url_prefix='/api')


def _node_to_dict(node):
    d = {
        'node_id': node.node_id,
        'node_type': node.node_type,
        'name': node.name,
        'active': node.active,
        'matrix': node.matrix,
        'children': [_node_to_dict(c) for c in node.children],
    }
    if node.node_type == 2:
        d.update({
            'vertex_count': node.vertex_count,
            'index_count': node.index_count,
            'material_id': node.material_id,
            'visible': node.visible,
            'transparent': node.transparent,
            'cast_shadows': node.cast_shadows,
            'renderable': node.renderable,
            'lod_in': node.lod_in,
            'lod_out': node.lod_out,
            'layer': node.layer,
        })
    return d


def _material_to_dict(mat, idx):
    return {
        'id': idx,
        'name': mat.name,
        'shader': mat.shader,
        'blend_mode': mat.blend_mode,
        'alpha_tested': mat.alpha_tested,
        'depth_mode': mat.depth_mode,
        'properties': [
            {'name': p.name, 'value_a': p.value_a}
            for p in mat.properties
        ],
        'texture_mappings': [
            {'mapping_name': tm.mapping_name, 'slot': tm.slot, 'texture_name': tm.texture_name}
            for tm in mat.texture_mappings
        ],
    }


@api_bp.route('/model')
def get_model():
    model = app_module.loaded_model
    return jsonify({
        'version': model.version,
        'filename': os.path.basename(model.source_path),
        'textures': [t.name for t in model.textures],
        'materials': [_material_to_dict(m, i) for i, m in enumerate(model.materials)],
        'root_node': _node_to_dict(model.root_node),
    })


@api_bp.route('/node/<int:node_id>/geometry')
def get_geometry(node_id):
    node = app_module.node_index.get(node_id)
    if not node or node.node_type != 2:
        return jsonify({'error': 'Mesh node not found'}), 404

    buf = io.BytesIO()
    buf.write(struct.pack('<I', node.vertex_count))
    buf.write(node.vertex_data)
    buf.write(struct.pack('<I', node.index_count))
    buf.write(node.index_data)

    return Response(buf.getvalue(), mimetype='application/octet-stream')


@api_bp.route('/texture/<path:name>')
def get_texture(name):
    model = app_module.loaded_model
    tex = next((t for t in model.textures if t.name == name), None)
    if not tex:
        return jsonify({'error': 'Texture not found'}), 404

    data = tex.data
    mime = 'application/octet-stream'

    if data[:4] == b'\x89PNG':
        mime = 'image/png'
    elif data[:3] == b'DDS':
        try:
            from PIL import Image
            img = Image.open(io.BytesIO(data))
            out = io.BytesIO()
            img.save(out, format='PNG')
            data = out.getvalue()
            mime = 'image/png'
        except Exception:
            mime = 'image/dds'
    elif data[:2] == b'\xff\xd8':
        mime = 'image/jpeg'

    return Response(data, mimetype=mime)


@api_bp.route('/node/<int:node_id>/transform', methods=['PUT'])
def update_transform(node_id):
    node = app_module.node_index.get(node_id)
    if not node:
        return jsonify({'error': 'Node not found'}), 404

    body = request.get_json()
    matrix = body.get('matrix')
    if not matrix or len(matrix) != 16:
        return jsonify({'error': 'matrix must be 16 floats'}), 400

    node.matrix = [float(v) for v in matrix]
    return jsonify({'ok': True})


@api_bp.route('/save', methods=['POST'])
def save_model():
    model = app_module.loaded_model
    body = request.get_json() or {}
    filename = body.get('filename')

    if not filename:
        base, ext = os.path.splitext(model.source_path)
        filename = base + '_modified' + ext

    if not os.path.isabs(filename):
        filename = os.path.join(os.path.dirname(model.source_path), filename)

    write_kn5(model, filename)
    return jsonify({'ok': True, 'path': filename})

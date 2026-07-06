import os
import struct
import io
from flask import Blueprint, jsonify, request, Response, send_file
from . import app as app_module
from .kn5_writer import write_kn5

api_bp = Blueprint('api', __name__, url_prefix='/api')


def _require_model():
    if app_module.loaded_model is None:
        return jsonify({'error': 'No model loaded'}), 409
    return None


def _node_to_dict(node):
    matrix = app_module.original_matrices.get(node.node_id, node.matrix)
    d = {
        'node_id': node.node_id,
        'node_type': node.node_type,
        'name': node.name,
        'active': node.active,
        'matrix': matrix,
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


@api_bp.route('/upload', methods=['POST'])
def upload_model():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    f = request.files['file']
    if not f.filename:
        return jsonify({'error': 'No file selected'}), 400
    file_bytes = f.read()
    try:
        app_module.load_model(file_bytes, f.filename)
    except Exception as e:
        return jsonify({'error': f'Failed to parse KN5: {e}'}), 400
    model = app_module.loaded_model
    return jsonify({
        'ok': True,
        'filename': f.filename,
        'textures': len(model.textures),
        'materials': len(model.materials),
        'nodes': len(app_module.node_index),
    })


@api_bp.route('/status')
def get_status():
    if app_module.loaded_model is None:
        return jsonify({'loaded': False})
    return jsonify({
        'loaded': True,
        'filename': app_module.loaded_model.source_path,
        'nodes': len(app_module.node_index),
    })


@api_bp.route('/model')
def get_model():
    err = _require_model()
    if err: return err
    model = app_module.loaded_model
    app_module.pending_transforms.clear()
    app_module.pending_vertex_offsets.clear()
    app_module.original_vertex_data.clear()
    return jsonify({
        'version': model.version,
        'filename': os.path.basename(model.source_path),
        'textures': [t.name for t in model.textures],
        'materials': [_material_to_dict(m, i) for i, m in enumerate(model.materials)],
        'root_node': _node_to_dict(model.root_node),
    })


@api_bp.route('/node/<int:node_id>/geometry')
def get_geometry(node_id):
    err = _require_model()
    if err: return err
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
    err = _require_model()
    if err: return err
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
    err = _require_model()
    if err: return err
    if node_id not in app_module.node_index:
        return jsonify({'error': 'Node not found'}), 404

    body = request.get_json()
    matrix = body.get('matrix')
    if not matrix or len(matrix) != 16:
        return jsonify({'error': 'matrix must be 16 floats'}), 400

    app_module.pending_transforms[node_id] = [float(v) for v in matrix]
    return jsonify({'ok': True})


@api_bp.route('/node/<int:node_id>/origin', methods=['PUT'])
def update_origin(node_id):
    err = _require_model()
    if err: return err
    node = app_module.node_index.get(node_id)
    if not node or node.node_type != 2:
        return jsonify({'error': 'Mesh node not found'}), 404

    body = request.get_json()
    vertex_offset = body.get('vertex_offset')
    matrix = body.get('matrix')

    if not vertex_offset or len(vertex_offset) != 3:
        return jsonify({'error': 'vertex_offset must be [x, y, z]'}), 400

    existing = app_module.pending_vertex_offsets.get(node_id, [0, 0, 0])
    app_module.pending_vertex_offsets[node_id] = [
        existing[0] + vertex_offset[0],
        existing[1] + vertex_offset[1],
        existing[2] + vertex_offset[2],
    ]

    if node_id not in app_module.original_vertex_data:
        app_module.original_vertex_data[node_id] = node.vertex_data

    if matrix and len(matrix) == 16:
        app_module.pending_transforms[node_id] = [float(v) for v in matrix]

    return jsonify({'ok': True})


def _apply_pending():
    for node_id, matrix in app_module.pending_transforms.items():
        node = app_module.node_index.get(node_id)
        if node:
            node.matrix = matrix
    for node_id, offset in app_module.pending_vertex_offsets.items():
        node = app_module.node_index.get(node_id)
        if node and node.vertex_data and node.vertex_count > 0:
            data = bytearray(node.vertex_data)
            ox, oy, oz = offset
            for i in range(node.vertex_count):
                base = i * 44
                x, y, z = struct.unpack_from('<3f', data, base)
                struct.pack_into('<3f', data, base, x + ox, y + oy, z + oz)
            node.vertex_data = bytes(data)


def _restore_originals():
    for node_id, matrix in app_module.original_matrices.items():
        node = app_module.node_index.get(node_id)
        if node:
            node.matrix = list(matrix)
    for node_id, vdata in app_module.original_vertex_data.items():
        node = app_module.node_index.get(node_id)
        if node:
            node.vertex_data = vdata


@api_bp.route('/reset-transforms', methods=['POST'])
def reset_transforms():
    err = _require_model()
    if err: return err
    app_module.pending_transforms.clear()
    app_module.pending_vertex_offsets.clear()
    app_module.original_vertex_data.clear()
    return jsonify({'ok': True})


@api_bp.route('/download', methods=['POST'])
def download_model():
    err = _require_model()
    if err: return err
    model = app_module.loaded_model

    _apply_pending()
    buf = io.BytesIO()
    write_kn5(model, buf)
    _restore_originals()

    buf.seek(0)
    filename = os.path.splitext(os.path.basename(model.source_path))[0] + '_modified.kn5'
    return send_file(buf, mimetype='application/octet-stream',
                     as_attachment=True, download_name=filename)


@api_bp.route('/save', methods=['POST'])
def save_model():
    err = _require_model()
    if err: return err
    model = app_module.loaded_model
    body = request.get_json() or {}
    filename = body.get('filename')

    if not filename:
        base, ext = os.path.splitext(model.source_path)
        filename = base + '_modified' + ext

    if not os.path.isabs(filename):
        filename = os.path.join(os.path.dirname(model.source_path), filename)

    _apply_pending()
    write_kn5(model, filename)
    _restore_originals()

    return jsonify({'ok': True, 'path': filename})

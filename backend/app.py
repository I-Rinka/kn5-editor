import io
import os
from flask import Flask
from flask_cors import CORS
from .kn5_parser import parse_kn5

loaded_model = None
node_index = {}
pending_transforms = {}
original_matrices = {}
pending_vertex_offsets = {}
original_vertex_data = {}


def _snapshot_matrices(node, out):
    out[node.node_id] = list(node.matrix)
    for child in node.children:
        _snapshot_matrices(child, out)


def load_model(file_bytes, filename='uploaded.kn5'):
    global loaded_model, node_index, pending_transforms, original_matrices
    global pending_vertex_offsets, original_vertex_data
    pending_transforms = {}
    original_matrices = {}
    pending_vertex_offsets = {}
    original_vertex_data = {}
    f = io.BytesIO(file_bytes)
    loaded_model, node_index = parse_kn5(f, source_path=filename)
    _snapshot_matrices(loaded_model.root_node, original_matrices)


def reset_model():
    global loaded_model, node_index, pending_transforms, original_matrices
    global pending_vertex_offsets, original_vertex_data
    loaded_model = None
    node_index = {}
    pending_transforms = {}
    original_matrices = {}
    pending_vertex_offsets = {}
    original_vertex_data = {}


def create_app(kn5_path=None):
    if kn5_path:
        abs_path = os.path.abspath(kn5_path)
        if not os.path.exists(abs_path):
            raise FileNotFoundError(f"KN5 file not found: {abs_path}")
        print(f"Parsing {abs_path} ...")
        with open(abs_path, 'rb') as f:
            load_model(f.read(), os.path.basename(abs_path))
        print(f"Loaded: {len(loaded_model.textures)} textures, "
              f"{len(loaded_model.materials)} materials, "
              f"{len(node_index)} nodes")

    frontend_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'frontend')
    app = Flask(__name__, static_folder=frontend_dir, static_url_path='')
    app.config['MAX_CONTENT_LENGTH'] = 500 * 1024 * 1024
    CORS(app)

    from .api_routes import api_bp
    app.register_blueprint(api_bp)

    @app.route('/')
    def index():
        return app.send_static_file('index.html')

    return app

import os
from flask import Flask
from flask_cors import CORS
from .kn5_parser import parse_kn5

loaded_model = None
node_index = {}


def create_app(kn5_path):
    global loaded_model, node_index

    abs_path = os.path.abspath(kn5_path)
    if not os.path.exists(abs_path):
        raise FileNotFoundError(f"KN5 file not found: {abs_path}")

    print(f"Parsing {abs_path} ...")
    loaded_model, node_index = parse_kn5(abs_path)
    print(f"Loaded: {len(loaded_model.textures)} textures, "
          f"{len(loaded_model.materials)} materials, "
          f"{len(node_index)} nodes")

    frontend_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'frontend')
    app = Flask(__name__, static_folder=frontend_dir, static_url_path='')
    CORS(app)

    from .api_routes import api_bp
    app.register_blueprint(api_bp)

    @app.route('/')
    def index():
        return app.send_static_file('index.html')

    return app

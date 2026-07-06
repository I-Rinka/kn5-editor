# KN5 Editor

A web-based 3D editor for Assetto Corsa's KN5 model files. View, inspect, and modify node transforms (position, rotation, scale) in the browser, then save changes back to a valid KN5 file.

![Python](https://img.shields.io/badge/Python-3.9+-blue) ![Three.js](https://img.shields.io/badge/Three.js-r164-green) ![License](https://img.shields.io/badge/License-MIT-yellow)

## Features

- **3D Visualization** — Full scene rendering with PBR materials, textures, and environment reflections
- **Transform Editing** — Translate, rotate, and scale any node with gizmo controls or arrow key nudging
- **Node Tree** — Collapsible hierarchy sidebar with click-to-select sync
- **Wheel Animation** — Preview wheel spin at adjustable speed
- **Steering Preview** — Adjust steering angle with a slider
- **Save to KN5** — Write modified transforms back to a new KN5 file

## Quick Start

```bash
# 1. Clone and setup
git clone https://github.com/I-Rinka/kn5-editor.git
cd kn5-editor
./setup.sh

# 2. Run
source .venv/bin/activate
python run.py path/to/your-model.kn5
```

The editor opens automatically at `http://localhost:5000`.

## Manual Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python run.py path/to/your-model.kn5
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `G` | Translate mode |
| `R` | Rotate mode |
| `S` | Scale mode |
| `F` | Focus on selected |
| `W` | Toggle wheel spin |
| `Esc` | Deselect |
| `Arrow Keys` | Nudge position |
| `Shift + Arrow` | Fast nudge |
| `Ctrl + Up/Down` | Nudge Y axis |

## Architecture

```
kn5-editor/
├── run.py                 # Entry point
├── requirements.txt       # Python dependencies
├── setup.sh               # One-click setup script
├── backend/
│   ├── kn5_parser.py      # KN5 binary reader
│   ├── kn5_writer.py      # KN5 binary writer
│   ├── kn5_model.py       # Data model (dataclasses)
│   ├── app.py             # Flask application factory
│   └── api_routes.py      # REST API endpoints
└── frontend/
    ├── index.html          # Main page
    ├── css/style.css       # UI styling
    └── js/
        ├── main.js             # Three.js init + render loop
        ├── scene-builder.js    # Build scene graph from API data
        ├── material-loader.js  # Texture loading + PBR materials
        ├── controls.js         # Orbit + Transform + raycasting
        ├── node-tree.js        # Sidebar tree view
        ├── wheel-animation.js  # Wheel spin + steering animation
        └── api-client.js       # Fetch wrappers

```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/model` | Model metadata (node tree, materials, textures) |
| GET | `/api/node/<id>/geometry` | Binary geometry data (ArrayBuffer) |
| GET | `/api/texture/<name>` | Texture image (DDS auto-converted to PNG) |
| PUT | `/api/node/<id>/transform` | Update node 4x4 matrix |
| POST | `/api/save` | Save modified KN5 to disk |

## KN5 Format

KN5 is Assetto Corsa's binary model format containing embedded textures, materials with shader definitions, and a hierarchical scene graph. This editor provides full round-trip parsing and writing — unmodified data is preserved byte-for-byte.

## Requirements

- Python 3.9+
- Modern browser with WebGL support

## License

MIT

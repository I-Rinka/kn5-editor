#!/bin/bash
set -e

cd "$(dirname "$0")"

if [ ! -d ".venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv .venv
fi

echo "Installing dependencies..."
.venv/bin/pip install -q -r requirements.txt

echo ""
echo "Setup complete. Usage:"
echo "  source .venv/bin/activate"
echo "  python run.py <path-to-kn5-file>"
echo ""
echo "Then open http://localhost:5000 in your browser."

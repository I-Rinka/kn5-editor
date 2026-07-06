import sys
import webbrowser
from backend.app import create_app


def main():
    kn5_path = sys.argv[1] if len(sys.argv) > 1 else None
    app = create_app(kn5_path)
    print(f"KN5 Editor: http://localhost:5000")
    webbrowser.open("http://localhost:5000")
    app.run(host="0.0.0.0", port=5000, debug=False)


if __name__ == '__main__':
    main()

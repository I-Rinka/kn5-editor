import sys
import webbrowser
from backend.app import create_app


def main():
    if len(sys.argv) < 2:
        print("Usage: python run.py <path-to-kn5-file>")
        sys.exit(1)
    kn5_path = sys.argv[1]
    app = create_app(kn5_path)
    print(f"KN5 Editor: http://localhost:5000")
    webbrowser.open("http://localhost:5000")
    app.run(host="0.0.0.0", port=5000, debug=False)


if __name__ == '__main__':
    main()

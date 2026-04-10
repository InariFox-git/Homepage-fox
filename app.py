from flask import Flask, jsonify, request, send_from_directory, redirect
from flask_cors import CORS
import json
import os
import re
import time
from urllib.parse import urlparse
from werkzeug.utils import secure_filename

app = Flask(__name__, static_url_path='/static', static_folder='static')
CORS(app)

DATA_DIR = os.path.join(os.path.dirname(__file__), 'data')
USERS_FILE = os.path.join(DATA_DIR, 'users.json')
DEFAULT_BACKGROUND = '/static/images/bg/background.svg'
UPLOADS_DIR = os.path.join(app.static_folder, 'images', 'bg', 'user-backgrounds')
ALLOWED_IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.svg'}
if not os.path.exists(DATA_DIR):
    os.makedirs(DATA_DIR)
if not os.path.exists(UPLOADS_DIR):
    os.makedirs(UPLOADS_DIR)

def validate_url(url):
    try:
        result = urlparse(url)
        return result.scheme in ('http', 'https')
    except:
        return False

def validate_background(background):
    if not isinstance(background, str):
        return False

    background = background.strip()
    if not background or len(background) > 500:
        return False

    if background.startswith('/static/'):
        if '..' in background:
            return False
        return background.lower().endswith(tuple(ALLOWED_IMAGE_EXTENSIONS))

    return validate_url(background)

def collect_background_options():
    images_root = os.path.join(app.static_folder, 'images', 'bg')
    options = []

    for root, _, files in os.walk(images_root):
        for file_name in files:
            _, ext = os.path.splitext(file_name)
            if ext.lower() not in ALLOWED_IMAGE_EXTENSIONS:
                continue

            abs_path = os.path.join(root, file_name)
            rel_path = os.path.relpath(abs_path, app.static_folder).replace('\\', '/')
            options.append(f"/static/{rel_path}")

    # Deduplicate while preserving order and keep default first.
    seen = set()
    unique = []
    if DEFAULT_BACKGROUND in options:
        unique.append(DEFAULT_BACKGROUND)
        seen.add(DEFAULT_BACKGROUND)
    for item in sorted(options):
        if item not in seen:
            unique.append(item)
            seen.add(item)
    return unique

def load_users():
    print("Путь к файлу:", USERS_FILE)
    print("Файл существует:", os.path.exists(USERS_FILE))
    try:
        if os.path.exists(USERS_FILE):
            with open(USERS_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        return {}
    except Exception as e:
        print(f"Ошибка при загрузке users.json: {e}")
        return {}

def save_users(users):
    try:
        with open(USERS_FILE, 'w', encoding='utf-8') as f:
            json.dump(users, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"Ошибка при сохранении users.json: {e}")

@app.route('/')
def serve_index():
    user_id = request.args.get('user_id')
    if not user_id:
        return redirect('/404')
    
    users = load_users()
    if user_id not in users:
        return redirect('/404')
    
    return send_from_directory('.', 'index.html')

@app.route('/admin')
def check_request_ip():
    from flask import request, abort
    ip = request.remote_addr
    if not ip.startswith('192.168.31.'):
        return 'Доступ запрещён: только для локальной сети.', 403
    return send_from_directory('.', 'admin.html')

@app.route('/get_data/<user_id>', methods=['GET'])
def get_data(user_id):
    users = load_users()
    if user_id in users:
        user_data = dict(users[user_id])
        user_data['search_engine'] = user_data.get('search_engine', 'yandex')
        user_data['background'] = user_data.get('background', DEFAULT_BACKGROUND)
        return jsonify(user_data)
    return jsonify({'folders': [], 'search_engine': 'yandex', 'background': DEFAULT_BACKGROUND})

@app.route('/background_options', methods=['GET'])
def background_options():
    return jsonify({'backgrounds': collect_background_options()})

@app.route('/save_data/<user_id>', methods=['POST'])
def save_data_route(user_id):
    data = request.json
    if not isinstance(data, dict):
        return jsonify({'error': 'Invalid data format'}), 400
    
    folders = data.get('folders', [])
    search_engine = data.get('search_engine', 'yandex')
    background = data.get('background', DEFAULT_BACKGROUND)
    
    if search_engine not in ['google', 'yandex']:
        return jsonify({'error': 'Invalid search engine'}), 400

    if not validate_background(background):
        return jsonify({'error': 'Invalid background'}), 400
    
    if not isinstance(folders, list):
        return jsonify({'error': 'Invalid folders format'}), 400

    for folder in folders:
        if not isinstance(folder.get('name'), str) or len(folder.get('name', '')) > 50:
            return jsonify({'error': 'Invalid folder name'}), 400
        if not isinstance(folder.get('tabs'), list):
            return jsonify({'error': 'Invalid tabs format'}), 400
        for tab in folder.get('tabs', []):
            if not isinstance(tab.get('name'), str) or len(tab.get('name', '')) > 100:
                return jsonify({'error': 'Invalid tab name'}), 400
            if not validate_url(tab.get('url', '')):
                return jsonify({'error': 'Invalid URL'}), 400

    users = load_users()
    if user_id not in users:
        users[user_id] = {}
    
    users[user_id]['folders'] = folders
    users[user_id]['search_engine'] = search_engine
    users[user_id]['background'] = background
    save_users(users)
    return jsonify({'status': 'success'})

@app.route('/upload_background/<user_id>', methods=['POST'])
def upload_background(user_id):
    if not re.match(r'^[a-zA-Z0-9_-]{1,64}$', user_id):
        return jsonify({'error': 'Invalid user id'}), 400

    file = request.files.get('background')
    if not file or not file.filename:
        return jsonify({'error': 'No file uploaded'}), 400

    filename = secure_filename(file.filename)
    _, ext = os.path.splitext(filename)
    ext = ext.lower()

    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        return jsonify({'error': 'Unsupported image format'}), 400

    users = load_users()
    if user_id not in users:
        return jsonify({'error': 'User not found'}), 404

    old_background = users[user_id].get('background', '')
    safe_name = secure_filename(user_id)
    new_filename = f"{safe_name}_{int(time.time() * 1000)}{ext}"
    file_path = os.path.join(UPLOADS_DIR, new_filename)
    file.save(file_path)

    # Remove previous uploaded background to avoid accumulating files.
    if isinstance(old_background, str) and old_background.startswith('/static/images/bg/user-backgrounds/'):
        old_name = old_background.split('/static/images/bg/user-backgrounds/', 1)[1]
        old_path = os.path.join(UPLOADS_DIR, secure_filename(old_name))
        if os.path.exists(old_path):
            try:
                os.remove(old_path)
            except OSError:
                pass

    background_url = f"/static/images/bg/user-backgrounds/{new_filename}"
    users[user_id]['background'] = background_url
    save_users(users)
    return jsonify({'status': 'success', 'background': background_url})

@app.route('/get_users', methods=['GET'])
def get_users():
    users = load_users()
    return jsonify(list(users.keys()))

@app.route('/add_user', methods=['POST'])
def add_user():
    user_id = request.json.get('id')
    if not user_id:
        return jsonify({'error': 'User ID is required'}), 400
    
    users = load_users()
    if user_id in users:
        return jsonify({'error': 'User already exists'}), 400
    
    users[user_id] = {
        'folders': [],
        'search_engine': 'yandex',
        'background': DEFAULT_BACKGROUND
    }
    save_users(users)
    return jsonify({'status': 'success'})

@app.route('/delete_user/<user_id>', methods=['DELETE'])
def delete_user(user_id):
    users = load_users()
    if user_id not in users:
        return jsonify({'error': 'User not found'}), 404
    
    del users[user_id]
    save_users(users)
    return jsonify({'status': 'success'})

@app.route('/select_user')
def serve_select_user():
    return send_from_directory('.', 'select_user.html')

@app.route('/404')
def serve_404():
    return send_from_directory('.', '404.html')

@app.errorhandler(404)
def page_not_found(e):
    return redirect('/404')

if __name__ == '__main__':
    app.run(debug=False, host='0.0.0.0', port=5000)
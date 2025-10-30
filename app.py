from flask import Flask, jsonify, request, send_from_directory, redirect
from flask_cors import CORS
import json
import os
from urllib.parse import urlparse

app = Flask(__name__, static_url_path='/static', static_folder='static')
CORS(app)

DATA_DIR = os.path.join(os.path.dirname(__file__), 'data')
USERS_FILE = os.path.join(DATA_DIR, 'users.json')
if not os.path.exists(DATA_DIR):
    os.makedirs(DATA_DIR)

def validate_url(url):
    try:
        result = urlparse(url)
        return result.scheme in ('http', 'https')
    except:
        return False

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
    if not ip.startswith('192.168.31.*'):
        return 'Доступ запрещён: только для локальной сети.', 403
    return send_from_directory('.', 'admin.html')

@app.route('/static/<path:path>')
def serve_static(path):
    return send_from_directory('static', path)

@app.route('/get_data/<user_id>', methods=['GET'])
def get_data(user_id):
    users = load_users()
    if user_id in users:
        user_data = users[user_id]
        user_data['search_engine'] = user_data.get('search_engine', 'yandex')
        return jsonify(user_data)
    return jsonify({'folders': [], 'search_engine': 'yandex'})

@app.route('/save_data/<user_id>', methods=['POST'])
def save_data_route(user_id):
    data = request.json
    if not isinstance(data, dict):
        return jsonify({'error': 'Invalid data format'}), 400
    
    folders = data.get('folders', [])
    search_engine = data.get('search_engine', 'yandex')
    
    if search_engine not in ['google', 'yandex']:
        return jsonify({'error': 'Invalid search engine'}), 400
    
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
    save_users(users)
    return jsonify({'status': 'success'})

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
    
    users[user_id] = {'folders': [], 'search_engine': 'yandex'}  # По умолчанию Yandex
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
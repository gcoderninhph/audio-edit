from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import pymysql
import json
import os
import requests

app = Flask(__name__, static_folder='../frontend/dist', static_url_path='')
CORS(app)

# MySQL Configuration
DB_CONFIG = {
    'host': 'localhost',
    'port': 3306,
    'user': 'root',
    'password': '12345678',
    'database': 'xelerate',
    'charset': 'utf8mb4',
    'cursorclass': pymysql.cursors.DictCursor
}


def get_db():
    return pymysql.connect(**DB_CONFIG)


def init_db():
    """Auto-create table if not exists"""
    conn = get_db()
    try:
        with conn.cursor() as cursor:
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS edit_history (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    video_name VARCHAR(255),
                    video_size BIGINT DEFAULT 0,
                    scenes JSON,
                    deleted_ids JSON,
                    threshold FLOAT DEFAULT 1.0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            ''')
        conn.commit()
        print("✅ Database table 'edit_history' ready.")
    except Exception as e:
        print(f"❌ Database init error: {e}")
    finally:
        conn.close()


@app.after_request
def add_headers(response):
    """Add COOP/COEP headers for SharedArrayBuffer (FFmpeg.wasm)"""
    response.headers['Cross-Origin-Opener-Policy'] = 'same-origin'
    response.headers['Cross-Origin-Embedder-Policy'] = 'require-corp'
    return response


# ─── Serve React App ───────────────────────────────────────

@app.route('/')
def serve_react():
    return send_from_directory(app.static_folder, 'index.html')


@app.route('/<path:path>')
def serve_static(path):
    file_path = os.path.join(app.static_folder, path)
    if os.path.exists(file_path):
        return send_from_directory(app.static_folder, path)
    return send_from_directory(app.static_folder, 'index.html')


# ─── History API ───────────────────────────────────────────

@app.route('/api/history/save', methods=['POST'])
def save_history():
    data = request.get_json()
    conn = get_db()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                '''INSERT INTO edit_history (name, video_name, video_size, scenes, deleted_ids, threshold)
                   VALUES (%s, %s, %s, %s, %s, %s)''',
                (
                    data.get('name', 'Untitled'),
                    data.get('videoName', ''),
                    data.get('videoSize', 0),
                    json.dumps(data.get('scenes', [])),
                    json.dumps(data.get('deletedIds', [])),
                    data.get('threshold', 1.0)
                )
            )
        conn.commit()
        return jsonify({'id': cursor.lastrowid, 'message': 'Saved successfully'}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()


@app.route('/api/history/list', methods=['GET'])
def list_history():
    conn = get_db()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                'SELECT id, name, video_name, video_size, created_at FROM edit_history ORDER BY created_at DESC'
            )
            rows = cursor.fetchall()
            for row in rows:
                if row.get('created_at'):
                    row['created_at'] = row['created_at'].isoformat()
            return jsonify(rows)
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()


@app.route('/api/history/<int:history_id>', methods=['GET'])
def get_history(history_id):
    conn = get_db()
    try:
        with conn.cursor() as cursor:
            cursor.execute('SELECT * FROM edit_history WHERE id = %s', (history_id,))
            row = cursor.fetchone()
            if not row:
                return jsonify({'error': 'Not found'}), 404
            if row.get('created_at'):
                row['created_at'] = row['created_at'].isoformat()
            if isinstance(row.get('scenes'), str):
                row['scenes'] = json.loads(row['scenes'])
            if isinstance(row.get('deleted_ids'), str):
                row['deleted_ids'] = json.loads(row['deleted_ids'])
            return jsonify(row)
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()


@app.route('/api/history/<int:history_id>', methods=['DELETE'])
def delete_history(history_id):
    conn = get_db()
    try:
        with conn.cursor() as cursor:
            cursor.execute('DELETE FROM edit_history WHERE id = %s', (history_id,))
        conn.commit()
        return jsonify({'message': 'Deleted successfully'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

# ─── Whishper Proxy API ────────────────────────────────────

WHISHPER_API_URL = "http://localhost:8081/api/transcriptions"

@app.route('/api/transcription/start', methods=['POST'])
def start_transcription():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    
    file = request.files['file']
    
    # Chuẩn bị form data để gửi tới Whishper
    files = {'file': (file.filename, file.stream, file.mimetype)}
    data = {
        'modelSize': 'base',
        'language': 'auto',
        'device': 'cpu'
    }
    
    try:
        response = requests.post(WHISHPER_API_URL, files=files, data=data)
        response.raise_for_status()
        return jsonify(response.json()), response.status_code
    except requests.RequestException as e:
        print(f"Whisper API error: {e}")
        return jsonify({'error': 'Failed to communicate with Whisper API'}), 500


@app.route('/api/transcription/status/<string:job_id>', methods=['GET'])
def get_transcription_status(job_id):
    try:
        response = requests.get(f"{WHISHPER_API_URL}/{job_id}")
        response.raise_for_status()
        return jsonify(response.json()), response.status_code
    except requests.RequestException as e:
        print(f"Whisper API error: {e}")
        return jsonify({'error': 'Failed to communicate with Whisper API'}), 500


# ─── LLM-Subtrans Proxy API ────────────────────────────────

LLM_SUBTRANS_API_URL = "http://localhost:8090/api"

@app.route('/api/translation/start', methods=['POST'])
def start_translation():
    if 'subtitle_file' not in request.files:
        return jsonify({'error': 'No subtitle_file part'}), 400
    if 'target_language' not in request.form:
        return jsonify({'error': 'No target_language specified'}), 400
    
    file = request.files['subtitle_file']
    target_language = request.form['target_language']
    
    files = {'subtitle_file': (file.filename, file.stream, file.mimetype)}
    data = {'target_language': target_language}
    
    try:
        response = requests.post(f"{LLM_SUBTRANS_API_URL}/translate", files=files, data=data)
        response.raise_for_status()
        return jsonify(response.json()), response.status_code
    except requests.RequestException as e:
        print(f"LLM-Subtrans API error: {e}")
        return jsonify({'error': 'Failed to communicate with LLM-Subtrans API'}), 500

@app.route('/api/translation/status/<string:job_id>', methods=['GET'])
def get_translation_status(job_id):
    try:
        response = requests.get(f"{LLM_SUBTRANS_API_URL}/jobs/{job_id}")
        response.raise_for_status()
        return jsonify(response.json()), response.status_code
    except requests.RequestException as e:
        print(f"LLM-Subtrans API error: {e}")
        return jsonify({'error': 'Failed to communicate with LLM-Subtrans API'}), 500

@app.route('/api/translation/download/<string:job_id>/<string:file_name>', methods=['GET'])
def download_translation(job_id, file_name):
    try:
        # Stream the download response from the LLM-Subtrans API
        response = requests.get(f"{LLM_SUBTRANS_API_URL}/download/{job_id}/{file_name}", stream=True)
        response.raise_for_status()
        
        from flask import Response
        return Response(
            response.iter_content(chunk_size=8192),
            content_type=response.headers.get('Content-Type', 'text/plain'),
            headers={
                'Content-Disposition': f'attachment; filename="{file_name}"'
            }
        )
    except requests.RequestException as e:
        print(f"LLM-Subtrans API download error: {e}")
        return jsonify({'error': 'Failed to download from LLM-Subtrans API'}), 500


if __name__ == '__main__':
    init_db()
    app.run(host='0.0.0.0', port=5000, debug=True)

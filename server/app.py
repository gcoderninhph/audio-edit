from flask import Flask, request, jsonify, send_from_directory, Response
from flask_cors import CORS
import pymysql
import json
import os
import uuid
import requests

UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

app = Flask(__name__, static_folder='../frontend/dist', static_url_path='')
app.config['MAX_CONTENT_LENGTH'] = 500 * 1024 * 1024  # 500MB
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
    """Auto-create tables if not exists"""
    conn = get_db()
    try:
        with conn.cursor() as cursor:
            # Legacy table (kept for backward compat)
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

            # New sessions table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS sessions (
                    id VARCHAR(36) PRIMARY KEY,
                    video_filename VARCHAR(512),
                    video_original_name VARCHAR(255),
                    scenes JSON,
                    deleted_ids JSON,
                    subtitles JSON,
                    sensitivity FLOAT DEFAULT 2.5,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    transcription_job_id VARCHAR(255) DEFAULT NULL,
                    translation_job_id VARCHAR(255) DEFAULT NULL
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            ''')
            
            # Add new columns if table already existed without them
            try:
                cursor.execute('ALTER TABLE sessions ADD COLUMN transcription_job_id VARCHAR(255) DEFAULT NULL')
            except Exception:
                pass
            try:
                cursor.execute('ALTER TABLE sessions ADD COLUMN translation_job_id VARCHAR(255) DEFAULT NULL')
            except Exception:
                pass
        conn.commit()
        print("✅ Database tables ready.")
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


# ─── Video Upload & Serve API ─────────────────────────────

@app.route('/api/video/upload', methods=['POST'])
def upload_video():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400

    file = request.files['file']
    if not file.filename:
        return jsonify({'error': 'No selected file'}), 400

    # Generate unique filename: uuid_originalname
    ext = os.path.splitext(file.filename)[1]
    unique_name = f"{uuid.uuid4().hex[:12]}{ext}"
    save_path = os.path.join(UPLOAD_FOLDER, unique_name)
    file.save(save_path)

    file_size = os.path.getsize(save_path)
    print(f"📁 Video uploaded: {unique_name} ({file_size} bytes)")

    return jsonify({
        'filename': unique_name,
        'originalName': file.filename,
        'size': file_size,
        'url': f'/api/video/{unique_name}'
    }), 201


@app.route('/api/video/<string:filename>', methods=['GET'])
def serve_video(filename):
    """Serve uploaded video file with proper headers"""
    file_path = os.path.join(UPLOAD_FOLDER, filename)
    if not os.path.exists(file_path):
        return jsonify({'error': 'Video not found'}), 404
    return send_from_directory(UPLOAD_FOLDER, filename)


# ─── Session API ──────────────────────────────────────────

@app.route('/api/session/save', methods=['POST'])
def save_session():
    data = request.get_json()
    session_id = data.get('sessionId')
    if not session_id:
        return jsonify({'error': 'sessionId is required'}), 400

    conn = get_db()
    try:
        with conn.cursor() as cursor:
            cursor.execute('SELECT id FROM sessions WHERE id = %s', (session_id,))
            exists = cursor.fetchone()

            if exists:
                cursor.execute('''
                    UPDATE sessions SET
                        video_filename = %s,
                        video_original_name = %s,
                        scenes = %s,
                        deleted_ids = %s,
                        subtitles = %s,
                        sensitivity = %s,
                        transcription_job_id = %s,
                        translation_job_id = %s,
                        updated_at = NOW()
                    WHERE id = %s
                ''', (
                    data.get('videoFilename', ''),
                    data.get('videoOriginalName', ''),
                    json.dumps(data.get('scenes', []), ensure_ascii=False),
                    json.dumps(data.get('deletedIds', []), ensure_ascii=False),
                    json.dumps(data.get('subtitles', []), ensure_ascii=False),
                    data.get('sensitivity', 2.5),
                    data.get('transcriptionJobId'),
                    data.get('translationJobId'),
                    session_id
                ))
            else:
                cursor.execute('''
                    INSERT INTO sessions (id, video_filename, video_original_name, scenes, deleted_ids, subtitles, sensitivity, transcription_job_id, translation_job_id)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                ''', (
                    session_id,
                    data.get('videoFilename', ''),
                    data.get('videoOriginalName', ''),
                    json.dumps(data.get('scenes', []), ensure_ascii=False),
                    json.dumps(data.get('deletedIds', []), ensure_ascii=False),
                    json.dumps(data.get('subtitles', []), ensure_ascii=False),
                    data.get('sensitivity', 2.5),
                    data.get('transcriptionJobId'),
                    data.get('translationJobId'),
                ))
        conn.commit()
        return jsonify({'sessionId': session_id, 'message': 'Saved'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()


@app.route('/api/session/latest', methods=['GET'])
def get_latest_session():
    conn = get_db()
    try:
        with conn.cursor() as cursor:
            cursor.execute('SELECT * FROM sessions ORDER BY updated_at DESC LIMIT 1')
            row = cursor.fetchone()
            if not row:
                return jsonify(None), 200
            return jsonify(_parse_session_row(row))
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()


@app.route('/api/session/list', methods=['GET'])
def list_sessions():
    conn = get_db()
    try:
        with conn.cursor() as cursor:
            cursor.execute('''
                SELECT id, video_original_name, sensitivity, updated_at
                FROM sessions ORDER BY updated_at DESC LIMIT 50
            ''')
            rows = cursor.fetchall()
            for row in rows:
                if row.get('updated_at'):
                    row['updated_at'] = row['updated_at'].isoformat()
            return jsonify(rows)
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()


@app.route('/api/session/<string:session_id>', methods=['GET'])
def get_session(session_id):
    conn = get_db()
    try:
        with conn.cursor() as cursor:
            cursor.execute('SELECT * FROM sessions WHERE id = %s', (session_id,))
            row = cursor.fetchone()
            if not row:
                return jsonify({'error': 'Not found'}), 404
            return jsonify(_parse_session_row(row))
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()


@app.route('/api/session/<string:session_id>', methods=['DELETE'])
def delete_session(session_id):
    conn = get_db()
    try:
        with conn.cursor() as cursor:
            # Get video filename before deleting
            cursor.execute('SELECT video_filename FROM sessions WHERE id = %s', (session_id,))
            row = cursor.fetchone()
            video_filename = row.get('video_filename') if row else None

            cursor.execute('DELETE FROM sessions WHERE id = %s', (session_id,))

            # Clean up video file if no other session uses it
            if video_filename:
                cursor.execute('SELECT COUNT(*) as cnt FROM sessions WHERE video_filename = %s', (video_filename,))
                count = cursor.fetchone()['cnt']
                if count == 0:
                    video_path = os.path.join(UPLOAD_FOLDER, video_filename)
                    if os.path.exists(video_path):
                        os.remove(video_path)
                        print(f"🗑️ Deleted orphan video: {video_filename}")

        conn.commit()
        return jsonify({'message': 'Deleted successfully'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()


def _parse_session_row(row):
    """Parse JSON fields in a session row"""
    if row.get('updated_at'):
        row['updated_at'] = row['updated_at'].isoformat()
    for field in ('scenes', 'deleted_ids', 'subtitles'):
        if isinstance(row.get(field), str):
            try:
                row[field] = json.loads(row[field])
            except json.JSONDecodeError:
                row[field] = []
    return row


# ─── Legacy History API (backward compat) ──────────────────

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

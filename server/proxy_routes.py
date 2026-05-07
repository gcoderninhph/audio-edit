from flask import Response, jsonify, request
import requests

WHISPER_API_URL = "http://localhost:8081/api/transcriptions"
LLM_SUBTRANS_API_URL = "http://localhost:8090/api"


def register_proxy_routes(app):
    @app.route('/api/transcription/start', methods=['POST'])
    def start_transcription():
        if 'file' not in request.files:
            return jsonify({'error': 'No file part'}), 400

        file = request.files['file']
        files = {'file': (file.filename, file.stream, file.mimetype)}
        data = {
            'modelSize': 'base',
            'language': 'auto',
            'device': 'cpu'
        }

        try:
            response = requests.post(WHISPER_API_URL, files=files, data=data)
            response.raise_for_status()
            return jsonify(response.json()), response.status_code
        except requests.RequestException as error:
            print(f"Whisper API error: {error}")
            return jsonify({'error': 'Failed to communicate with Whisper API'}), 500

    @app.route('/api/transcription/status/<string:job_id>', methods=['GET'])
    def get_transcription_status(job_id):
        try:
            response = requests.get(f"{WHISPER_API_URL}/{job_id}")
            response.raise_for_status()
            return jsonify(response.json()), response.status_code
        except requests.RequestException as error:
            print(f"Whisper API error: {error}")
            return jsonify({'error': 'Failed to communicate with Whisper API'}), 500

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
        except requests.RequestException as error:
            print(f"LLM-Subtrans API error: {error}")
            return jsonify({'error': 'Failed to communicate with LLM-Subtrans API'}), 500

    @app.route('/api/translation/status/<string:job_id>', methods=['GET'])
    def get_translation_status(job_id):
        try:
            response = requests.get(f"{LLM_SUBTRANS_API_URL}/jobs/{job_id}")
            response.raise_for_status()
            return jsonify(response.json()), response.status_code
        except requests.RequestException as error:
            print(f"LLM-Subtrans API error: {error}")
            return jsonify({'error': 'Failed to communicate with LLM-Subtrans API'}), 500

    @app.route('/api/translation/download/<string:job_id>/<string:file_name>', methods=['GET'])
    def download_translation(job_id, file_name):
        try:
            response = requests.get(f"{LLM_SUBTRANS_API_URL}/download/{job_id}/{file_name}", stream=True)
            response.raise_for_status()

            return Response(
                response.iter_content(chunk_size=8192),
                content_type=response.headers.get('Content-Type', 'text/plain'),
                headers={
                    'Content-Disposition': f'attachment; filename="{file_name}"'
                }
            )
        except requests.RequestException as error:
            print(f"LLM-Subtrans API download error: {error}")
            return jsonify({'error': 'Failed to download from LLM-Subtrans API'}), 500
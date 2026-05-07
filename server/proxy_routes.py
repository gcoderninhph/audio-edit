from flask import Response, jsonify, request, send_file
import io
import requests

try:
    from translation_fallback import (
        create_local_translation_job,
        get_local_translation_download,
        get_local_translation_status,
        is_local_translation_job,
    )
except ImportError:
    from .translation_fallback import (
        create_local_translation_job,
        get_local_translation_download,
        get_local_translation_status,
        is_local_translation_job,
    )

WHISPER_API_URL = "http://localhost:8081/api/transcriptions"
LLM_SUBTRANS_API_URL = "http://localhost:8090/api"


def build_proxy_response(response, fallback_message):
    payload = response.content
    if payload:
        return Response(
            payload,
            status=response.status_code,
            content_type=response.headers.get('Content-Type', 'application/json')
        )

    return jsonify({'error': fallback_message}), response.status_code


def should_use_local_translation_fallback(response=None, error=None):
    if error is not None:
        return True

    if response is None:
        return False

    response_text = (response.text or '').lower()
    return response.status_code >= 500 \
        or response.status_code == 503 \
        or 'managed worker' in response_text \
        or 'api key' in response_text


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
            return build_proxy_response(response, 'Failed to communicate with Whisper API')
        except requests.RequestException as error:
            print(f"Whisper API error: {error}")
            return jsonify({'error': 'Failed to communicate with Whisper API'}), 502

    @app.route('/api/transcription/status/<string:job_id>', methods=['GET'])
    def get_transcription_status(job_id):
        try:
            response = requests.get(f"{WHISPER_API_URL}/{job_id}")
            return build_proxy_response(response, 'Failed to communicate with Whisper API')
        except requests.RequestException as error:
            print(f"Whisper API error: {error}")
            return jsonify({'error': 'Failed to communicate with Whisper API'}), 502

    @app.route('/api/translation/start', methods=['POST'])
    def start_translation():
        if 'subtitle_file' not in request.files:
            return jsonify({'error': 'No subtitle_file part'}), 400
        if 'target_language' not in request.form:
            return jsonify({'error': 'No target_language specified'}), 400

        file = request.files['subtitle_file']
        target_language = request.form['target_language']
        file_bytes = file.read()
        if not file_bytes:
            return jsonify({'error': 'Subtitle file is empty'}), 400

        files = {'subtitle_file': (file.filename, io.BytesIO(file_bytes), file.mimetype or 'text/plain')}
        data = {'target_language': target_language}

        try:
            response = requests.post(f"{LLM_SUBTRANS_API_URL}/translate", files=files, data=data)
            if should_use_local_translation_fallback(response=response):
                return jsonify(create_local_translation_job(file_bytes, file.filename, target_language)), 202
            return build_proxy_response(response, 'Failed to communicate with LLM-Subtrans API')
        except requests.RequestException as error:
            print(f"LLM-Subtrans API error: {error}")
            return jsonify(create_local_translation_job(file_bytes, file.filename, target_language)), 202

    @app.route('/api/translation/status/<string:job_id>', methods=['GET'])
    def get_translation_status(job_id):
        if is_local_translation_job(job_id):
            job_status = get_local_translation_status(job_id)
            if not job_status:
                return jsonify({'error': 'Translation job not found'}), 404
            return jsonify(job_status), 200

        try:
            response = requests.get(f"{LLM_SUBTRANS_API_URL}/jobs/{job_id}")
            return build_proxy_response(response, 'Failed to communicate with LLM-Subtrans API')
        except requests.RequestException as error:
            print(f"LLM-Subtrans API error: {error}")
            return jsonify({'error': 'Failed to communicate with LLM-Subtrans API'}), 502

    @app.route('/api/translation/download/<string:job_id>/<string:file_name>', methods=['GET'])
    def download_translation(job_id, file_name):
        if is_local_translation_job(job_id):
            local_download = get_local_translation_download(job_id, file_name)
            if not local_download:
                return jsonify({'error': 'Translated subtitle file not found'}), 404

            return send_file(
                local_download['path'],
                as_attachment=True,
                download_name=local_download['output_file_name'],
                mimetype='text/plain; charset=utf-8'
            )

        try:
            response = requests.get(f"{LLM_SUBTRANS_API_URL}/download/{job_id}/{file_name}", stream=True)
            if not response.ok:
                return build_proxy_response(response, 'Failed to download from LLM-Subtrans API')

            return Response(
                response.iter_content(chunk_size=8192),
                content_type=response.headers.get('Content-Type', 'text/plain'),
                headers={
                    'Content-Disposition': f'attachment; filename="{file_name}"'
                }
            )
        except requests.RequestException as error:
            print(f"LLM-Subtrans API download error: {error}")
            return jsonify({'error': 'Failed to download from LLM-Subtrans API'}), 502
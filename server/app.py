from flask import Flask, jsonify
from flask_cors import CORS
import os

try:
    from controllers.admin_routes import register_admin_routes
    from controllers.admin_web_routes import register_admin_web_routes
    from controllers.auth_routes import register_auth_routes
    from controllers.iap_payment_routes import register_iap_payment_routes
    from controllers.openai_translation_routes import register_openai_translation_routes
    from services.vbee_asset_expiry import start_vbee_asset_expiry_worker
    from services.whisper_runtime import start_whisper_dispatch_worker
    from controllers.iap_routes import register_iap_routes
    from utils.logging_setup import configure_backend_logging
    from utils.logging_setup import register_http_logging
    from controllers.proxy_routes import register_proxy_routes
    from controllers.vbee_routes import register_vbee_routes
    from controllers.whisper_routes import register_whisper_routes
except ImportError:
    from .controllers.admin_routes import register_admin_routes
    from .controllers.admin_web_routes import register_admin_web_routes
    from .controllers.auth_routes import register_auth_routes
    from .controllers.iap_payment_routes import register_iap_payment_routes
    from .controllers.openai_translation_routes import register_openai_translation_routes
    from .services.vbee_asset_expiry import start_vbee_asset_expiry_worker
    from .services.whisper_runtime import start_whisper_dispatch_worker
    from .controllers.iap_routes import register_iap_routes
    from .utils.logging_setup import configure_backend_logging
    from .utils.logging_setup import register_http_logging
    from .controllers.proxy_routes import register_proxy_routes
    from .controllers.vbee_routes import register_vbee_routes
    from .controllers.whisper_routes import register_whisper_routes

SERVER_PORT = int(os.environ.get('SERVER_PORT', '5000'))

app = Flask(__name__)
CORS(app)
configure_backend_logging(app)
register_http_logging(app)


@app.after_request
def add_headers(response):
    """Add COOP/COEP headers for SharedArrayBuffer (FFmpeg.wasm)"""
    response.headers['Cross-Origin-Opener-Policy'] = 'same-origin'
    response.headers['Cross-Origin-Embedder-Policy'] = 'require-corp'
    return response


# ─── Health API ───────────────────────────────────────────

@app.route('/api/health', methods=['GET'])
def healthcheck():
    return jsonify({'status': 'ok'})

register_auth_routes(app)
register_admin_routes(app)
register_iap_routes(app)
register_iap_payment_routes(app)
register_admin_web_routes(app)
register_openai_translation_routes(app)
register_proxy_routes(app)
register_vbee_routes(app)
register_whisper_routes(app)
start_vbee_asset_expiry_worker()
start_whisper_dispatch_worker()


if __name__ == '__main__':
    debug_enabled = os.environ.get('FLASK_DEBUG') == '1'
    use_reloader = os.environ.get('FLASK_USE_RELOADER') == '1'
    app.run(host='0.0.0.0', port=SERVER_PORT, debug=debug_enabled, use_reloader=use_reloader)

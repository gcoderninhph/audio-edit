from pathlib import Path

from flask import Response, redirect, send_from_directory


ADMIN_FRONTEND_DIST = Path(__file__).resolve().parents[1] / 'admin-frontend' / 'dist'


def _send_admin_app():
    index_path = ADMIN_FRONTEND_DIST / 'index.html'
    if not index_path.exists():
        return Response('Admin frontend is not built. Run `npm run build` in admin-frontend.', status=503, mimetype='text/plain')
    return send_from_directory(ADMIN_FRONTEND_DIST, 'index.html')


def register_admin_web_routes(app):
    @app.route('/admin/assets/<path:asset_name>', methods=['GET'])
    def admin_frontend_assets(asset_name):
        return send_from_directory(ADMIN_FRONTEND_DIST / 'assets', asset_name)

    @app.route('/admin', methods=['GET'])
    @app.route('/admin/', methods=['GET'])
    def admin_web_root():
        return _send_admin_app()

    @app.route('/console', methods=['GET'])
    @app.route('/console/', methods=['GET'])
    def admin_web_console_alias():
        return redirect('/admin/manage', code=302)

    @app.route('/admin/login', methods=['GET'])
    @app.route('/admin/login/', methods=['GET'])
    def admin_web_login_page():
        return _send_admin_app()

    @app.route('/admin/setup', methods=['GET'])
    @app.route('/admin/setup/', methods=['GET'])
    def admin_web_setup_page():
        return _send_admin_app()

    @app.route('/admin/manage', methods=['GET'])
    @app.route('/admin/manage/', methods=['GET'])
    def admin_web_manage_page():
        return _send_admin_app()

    @app.route('/admin/iap', methods=['GET'])
    @app.route('/admin/iap/', methods=['GET'])
    def admin_web_iap_page():
        return _send_admin_app()

    @app.route('/admin/iap/<path:subpath>', methods=['GET'])
    @app.route('/admin/iap/<path:subpath>/', methods=['GET'])
    def admin_web_iap_subpage(subpath):
        return _send_admin_app()

    @app.route('/admin/service', methods=['GET'])
    @app.route('/admin/service/', methods=['GET'])
    def admin_web_service_page():
        return _send_admin_app()

    @app.route('/admin/service/<path:subpath>', methods=['GET'])
    @app.route('/admin/service/<path:subpath>/', methods=['GET'])
    def admin_web_service_subpage(subpath):
        return _send_admin_app()

    @app.route('/admin/iap/bank-hook-history', methods=['GET'])
    @app.route('/admin/iap/bank-hook-history/', methods=['GET'])
    def admin_web_iap_bank_hook_history_page():
        return _send_admin_app()

    @app.route('/admin/iap/bank-hook-history/<int:history_id>', methods=['GET'])
    @app.route('/admin/iap/bank-hook-history/<int:history_id>/', methods=['GET'])
    def admin_web_iap_bank_hook_history_detail_page(history_id):
        return _send_admin_app()

    @app.route('/admin/users/<path:user_id>', methods=['GET'])
    @app.route('/admin/users/<path:user_id>/', methods=['GET'])
    def admin_web_user_detail_page(user_id):
        return _send_admin_app()
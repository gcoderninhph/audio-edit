from urllib.parse import urlencode
from urllib.request import Request, urlopen

from flask import Response, jsonify, request

try:
    from auth_identity import public_user_from_record
    from auth_routes import AuthStoreError, require_access_token, require_admin_access
    from auth_store import find_user_by_id
    from iap_beneficiary_store import (
        IapBeneficiaryNotFoundError,
        IapBeneficiaryValidationError,
        create_iap_beneficiary_account,
        delete_iap_beneficiary_account,
        list_iap_beneficiary_accounts,
        update_iap_beneficiary_account,
    )
    from iap_payment_store import (
        IapPaymentNotFoundError,
        IapPaymentValidationError,
        create_iap_payment_ticket,
        expire_iap_payment_tickets,
        get_iap_payment_ticket,
        list_iap_payment_tickets_page,
        list_iap_refund_pending_page,
    )
    from iap_payment_expiry import start_iap_payment_expiry_worker
    from iap_store import IapPackageNotFoundError
except ImportError:
    from .auth_identity import public_user_from_record
    from .auth_routes import AuthStoreError, require_access_token, require_admin_access
    from .auth_store import find_user_by_id
    from .iap_beneficiary_store import (
        IapBeneficiaryNotFoundError,
        IapBeneficiaryValidationError,
        create_iap_beneficiary_account,
        delete_iap_beneficiary_account,
        list_iap_beneficiary_accounts,
        update_iap_beneficiary_account,
    )
    from .iap_payment_store import (
        IapPaymentNotFoundError,
        IapPaymentValidationError,
        create_iap_payment_ticket,
        expire_iap_payment_tickets,
        get_iap_payment_ticket,
        list_iap_payment_tickets_page,
        list_iap_refund_pending_page,
    )
    from .iap_payment_expiry import start_iap_payment_expiry_worker
    from .iap_store import IapPackageNotFoundError


def _iap_payment_store_error_response():
    return jsonify({'error': 'IAP payment storage is unavailable'}), 503


def _build_sepay_qr_url(ticket):
    return f"https://qr.sepay.vn/img?{urlencode({
        'bank': ticket.get('bankId') or '',
        'acc': ticket.get('bankAccount') or '',
        'amount': str(ticket.get('amount') or 0),
        'des': ticket.get('transactionCode') or '',
        'template': 'compact',
    })}"


def _payment_status_payload(ticket):
    payload = {'payment': ticket}
    if ticket.get('status') == 'paid':
        user_record = find_user_by_id(ticket.get('userId'))
        if user_record:
            payload['user'] = public_user_from_record(user_record)
    return payload


def register_iap_payment_routes(app):
    start_iap_payment_expiry_worker()

    @app.route('/api/iap/payments', methods=['POST'])
    def create_iap_payment_route():
        claims, auth_error = require_access_token()
        if auth_error:
            return auth_error
        payload = request.get_json(silent=True) or {}
        try:
            ticket = create_iap_payment_ticket(claims.get('sub'), payload.get('packageId'))
            return jsonify(_payment_status_payload(ticket)), 201
        except IapPackageNotFoundError:
            return jsonify({'error': 'IAP package not found'}), 404
        except (IapPaymentValidationError, IapBeneficiaryNotFoundError) as error:
            return jsonify({'error': str(error)}), 400
        except AuthStoreError:
            return _iap_payment_store_error_response()

    @app.route('/api/iap/payments/<int:ticket_id>', methods=['GET'])
    def get_iap_payment_route(ticket_id):
        claims, auth_error = require_access_token()
        if auth_error:
            return auth_error
        try:
            ticket = get_iap_payment_ticket(ticket_id, user_id=claims.get('sub'))
            return jsonify(_payment_status_payload(ticket))
        except IapPaymentNotFoundError:
            return jsonify({'error': 'IAP payment ticket not found'}), 404
        except AuthStoreError:
            return _iap_payment_store_error_response()

    @app.route('/api/iap/payments/<int:ticket_id>/qr', methods=['GET'])
    def get_iap_payment_qr_route(ticket_id):
        claims, auth_error = require_access_token()
        if auth_error:
            return auth_error
        try:
            ticket = get_iap_payment_ticket(ticket_id, user_id=claims.get('sub'))
        except IapPaymentNotFoundError:
            return jsonify({'error': 'IAP payment ticket not found'}), 404
        except AuthStoreError:
            return _iap_payment_store_error_response()

        try:
            qr_request = Request(
                _build_sepay_qr_url(ticket),
                headers={'User-Agent': 'AudioEdit/1.0'},
                method='GET',
            )
            with urlopen(qr_request, timeout=15) as qr_response:
                return Response(
                    qr_response.read(),
                    headers={
                        'Cache-Control': 'no-store',
                    },
                    mimetype=qr_response.headers.get_content_type() or 'image/png',
                )
        except Exception:
            return jsonify({'error': 'Unable to load QR image.'}), 502

    @app.route('/api/admin/iap/beneficiary-accounts', methods=['GET', 'POST'])
    def admin_iap_beneficiary_accounts_route():
        _claims, auth_error = require_admin_access()
        if auth_error:
            return auth_error
        if request.method == 'GET':
            try:
                return jsonify({'accounts': list_iap_beneficiary_accounts()})
            except AuthStoreError:
                return _iap_payment_store_error_response()
        payload = request.get_json(silent=True) or {}
        try:
            account = create_iap_beneficiary_account(
                payload.get('name'),
                payload.get('bankId'),
                payload.get('bankAccount'),
                is_current=payload.get('isCurrent', False),
            )
            return jsonify({'account': account}), 201
        except IapBeneficiaryValidationError as error:
            return jsonify({'error': str(error)}), 400
        except AuthStoreError:
            return _iap_payment_store_error_response()

    @app.route('/api/admin/iap/beneficiary-accounts/<int:account_id>', methods=['PATCH', 'DELETE'])
    def admin_iap_beneficiary_account_detail_route(account_id):
        _claims, auth_error = require_admin_access()
        if auth_error:
            return auth_error
        if request.method == 'DELETE':
            try:
                return jsonify({'account': delete_iap_beneficiary_account(account_id)})
            except IapBeneficiaryNotFoundError:
                return jsonify({'error': 'IAP beneficiary account not found'}), 404
            except AuthStoreError:
                return _iap_payment_store_error_response()
        payload = request.get_json(silent=True) or {}
        try:
            account = update_iap_beneficiary_account(
                account_id,
                name=payload.get('name') if 'name' in payload else None,
                bank_id=payload.get('bankId') if 'bankId' in payload else None,
                bank_account=payload.get('bankAccount') if 'bankAccount' in payload else None,
                is_current=payload.get('isCurrent') if 'isCurrent' in payload else None,
            )
            return jsonify({'account': account})
        except IapBeneficiaryNotFoundError:
            return jsonify({'error': 'IAP beneficiary account not found'}), 404
        except IapBeneficiaryValidationError as error:
            return jsonify({'error': str(error)}), 400
        except AuthStoreError:
            return _iap_payment_store_error_response()

    @app.route('/api/admin/iap/payment-transactions', methods=['GET'])
    def admin_iap_payment_transactions_route():
        _claims, auth_error = require_admin_access()
        if auth_error:
            return auth_error
        try:
            expire_iap_payment_tickets()
            page = list_iap_payment_tickets_page(page=request.args.get('page'), page_size=request.args.get('pageSize'))
            return jsonify({'transactions': page['items'], 'pagination': page['pagination']})
        except AuthStoreError:
            return _iap_payment_store_error_response()

    @app.route('/api/admin/iap/payment-transactions/<int:ticket_id>', methods=['GET'])
    def admin_iap_payment_transaction_detail_route(ticket_id):
        _claims, auth_error = require_admin_access()
        if auth_error:
            return auth_error
        try:
            expire_iap_payment_tickets()
            return jsonify({'transaction': get_iap_payment_ticket(ticket_id)})
        except IapPaymentNotFoundError:
            return jsonify({'error': 'IAP payment ticket not found'}), 404
        except AuthStoreError:
            return _iap_payment_store_error_response()

    @app.route('/api/admin/iap/refund-pending', methods=['GET'])
    def admin_iap_refund_pending_route():
        _claims, auth_error = require_admin_access()
        if auth_error:
            return auth_error
        try:
            page = list_iap_refund_pending_page(page=request.args.get('page'), page_size=request.args.get('pageSize'))
            return jsonify({'refunds': page['items'], 'pagination': page['pagination']})
        except AuthStoreError:
            return _iap_payment_store_error_response()

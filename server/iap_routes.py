from flask import jsonify, request

try:
    from auth_routes import AuthStoreError, require_admin_access
    from iap_bank_hook_history_store import (
        IapBankHookHistoryNotFoundError,
        get_iap_bank_hook_history,
        list_iap_bank_hook_history_page,
        record_iap_bank_hook_history,
    )
    from iap_api_key_store import (
        IapApiKeyNotFoundError,
        IapApiKeyValidationError,
        PAYMENT_HOOK_METHODS,
        create_iap_api_key,
        delete_iap_api_key,
        list_iap_api_keys,
        validate_iap_hook_request,
    )
    from iap_cache import get_cached_public_iap_packages, invalidate_public_iap_packages_cache, set_cached_public_iap_packages
    from iap_admin_store import (
        IapAdminNotFoundError,
        IapAdminValidationError,
        create_iap_pack_function,
        create_iap_sale,
        delete_iap_pack_function,
        delete_iap_sale,
        list_iap_pack_functions,
        list_iap_sales,
    )
    from iap_store import (
        DuplicateIapPackageError,
        IapPackageNotFoundError,
        IapPackageValidationError,
        create_iap_package,
        delete_iap_package,
        list_iap_packages,
        update_iap_package,
    )
except ImportError:
    from .auth_routes import AuthStoreError, require_admin_access
    from .iap_bank_hook_history_store import (
        IapBankHookHistoryNotFoundError,
        get_iap_bank_hook_history,
        list_iap_bank_hook_history_page,
        record_iap_bank_hook_history,
    )
    from .iap_api_key_store import (
        IapApiKeyNotFoundError,
        IapApiKeyValidationError,
        PAYMENT_HOOK_METHODS,
        create_iap_api_key,
        delete_iap_api_key,
        list_iap_api_keys,
        validate_iap_hook_request,
    )
    from .iap_cache import get_cached_public_iap_packages, invalidate_public_iap_packages_cache, set_cached_public_iap_packages
    from .iap_admin_store import (
        IapAdminNotFoundError,
        IapAdminValidationError,
        create_iap_pack_function,
        create_iap_sale,
        delete_iap_pack_function,
        delete_iap_sale,
        list_iap_pack_functions,
        list_iap_sales,
    )
    from .iap_store import (
        DuplicateIapPackageError,
        IapPackageNotFoundError,
        IapPackageValidationError,
        create_iap_package,
        delete_iap_package,
        list_iap_packages,
        update_iap_package,
    )


def _serialize_iap_package(package_record):
    return {
        'id': package_record.get('id') or '',
        'name': package_record.get('name') or '',
        'packType': package_record.get('packType') or 'addCredit',
        'price': float(package_record.get('price') or 0),
        'currency': package_record.get('currency') or 'VND',
        'credits': int(package_record.get('credits') or 0),
        'description': package_record.get('description') or '',
        'isActive': bool(package_record.get('isActive')),
        'createdAt': int(package_record.get('createdAt') or 0),
        'updatedAt': int(package_record.get('updatedAt') or 0),
    }


def _iap_store_error_response():
    return jsonify({'error': 'IAP package storage is unavailable'}), 503


def _iap_admin_store_error_response():
    return jsonify({'error': 'IAP admin storage is unavailable'}), 503


def _extract_payment_hook_payload(current_request):
    payload = current_request.get_json(silent=True)
    if isinstance(payload, dict):
        return payload
    if isinstance(payload, list):
        return {'items': payload}
    if payload is not None:
        return {'value': payload}
    if current_request.form:
        return current_request.form.to_dict(flat=True)
    if current_request.args:
        return current_request.args.to_dict(flat=True)
    raw_body = (current_request.get_data(cache=True, as_text=True) or '').strip()
    return {'rawBody': raw_body} if raw_body else {}


def register_iap_routes(app):
    @app.route('/api/pay/info', methods=list(PAYMENT_HOOK_METHODS))
    def payment_info_hook_route():
        try:
            api_key_record = validate_iap_hook_request(request.method, request.headers)
            history_record = record_iap_bank_hook_history(api_key_record, _extract_payment_hook_payload(request))
            return jsonify({'ok': True, 'apiKeyId': api_key_record['id'], 'historyId': history_record['id'], 'received': True})
        except IapApiKeyNotFoundError:
            return jsonify({'error': 'Invalid payment hook API key'}), 401
        except IapApiKeyValidationError as error:
            return jsonify({'error': str(error)}), 400
        except AuthStoreError:
            return _iap_admin_store_error_response()

    @app.route('/api/iap/packages', methods=['GET'])
    def list_public_iap_packages_route():
        cached_packages = get_cached_public_iap_packages()
        if cached_packages is not None:
            return jsonify({'packages': cached_packages})

        try:
            packages = [_serialize_iap_package(record) for record in list_iap_packages(include_inactive=False)]
        except AuthStoreError:
            return _iap_store_error_response()

        set_cached_public_iap_packages(packages)
        return jsonify({'packages': packages})

    @app.route('/api/admin/iap/packages', methods=['GET', 'POST'])
    def admin_iap_packages_route():
        _claims, auth_error = require_admin_access()
        if auth_error:
            return auth_error

        if request.method == 'GET':
            try:
                packages = [_serialize_iap_package(record) for record in list_iap_packages(include_inactive=True)]
                return jsonify({'packages': packages})
            except AuthStoreError:
                return _iap_store_error_response()

        payload = request.get_json(silent=True) or {}
        try:
            package_record = create_iap_package(
                payload.get('id') or payload.get('packageId'),
                payload.get('name'),
                payload.get('price'),
                currency=payload.get('currency'),
                credits=payload.get('credits'),
                description=payload.get('description'),
                is_active=payload.get('isActive', True),
                pack_type=payload.get('packType'),
            )
            invalidate_public_iap_packages_cache()
            return jsonify({'package': _serialize_iap_package(package_record)}), 201
        except IapPackageValidationError as error:
            return jsonify({'error': str(error)}), 400
        except DuplicateIapPackageError as error:
            return jsonify({'error': str(error)}), 409
        except AuthStoreError:
            return _iap_store_error_response()

    @app.route('/api/admin/iap/packages/<string:package_id>', methods=['PATCH', 'DELETE'])
    def admin_iap_package_detail_route(package_id):
        _claims, auth_error = require_admin_access()
        if auth_error:
            return auth_error

        if request.method == 'DELETE':
            try:
                package_record = delete_iap_package(package_id)
                invalidate_public_iap_packages_cache()
                return jsonify({'package': _serialize_iap_package(package_record)})
            except IapPackageNotFoundError:
                return jsonify({'error': 'IAP package not found'}), 404
            except AuthStoreError:
                return _iap_store_error_response()

        payload = request.get_json(silent=True) or {}
        if not any(field in payload for field in ('name', 'price', 'currency', 'credits', 'description', 'isActive', 'packType')):
            return jsonify({'error': 'No IAP package changes were provided'}), 400

        try:
            package_record = update_iap_package(
                package_id,
                name=payload.get('name') if 'name' in payload else None,
                price=payload.get('price') if 'price' in payload else None,
                currency=payload.get('currency') if 'currency' in payload else None,
                credits=payload.get('credits') if 'credits' in payload else None,
                description=payload.get('description') if 'description' in payload else None,
                is_active=payload.get('isActive') if 'isActive' in payload else None,
                pack_type=payload.get('packType') if 'packType' in payload else None,
            )
            invalidate_public_iap_packages_cache()
            return jsonify({'package': _serialize_iap_package(package_record)})
        except IapPackageValidationError as error:
            return jsonify({'error': str(error)}), 400
        except IapPackageNotFoundError:
            return jsonify({'error': 'IAP package not found'}), 404
        except AuthStoreError:
            return _iap_store_error_response()

    @app.route('/api/admin/iap/api-keys', methods=['GET', 'POST'])
    def admin_iap_api_keys_route():
        _claims, auth_error = require_admin_access()
        if auth_error:
            return auth_error

        if request.method == 'GET':
            try:
                return jsonify({'apiKeys': list_iap_api_keys()})
            except AuthStoreError:
                return _iap_admin_store_error_response()

        payload = request.get_json(silent=True) or {}
        try:
            api_key = create_iap_api_key(
                payload.get('name'),
                hook_method=payload.get('method'),
                header_name=payload.get('headerName'),
                is_active=payload.get('isActive', True),
            )
            return jsonify({'apiKey': api_key}), 201
        except IapApiKeyValidationError as error:
            return jsonify({'error': str(error)}), 400
        except AuthStoreError:
            return _iap_admin_store_error_response()

    @app.route('/api/admin/iap/bank-hook-history', methods=['GET'])
    def admin_iap_bank_hook_history_route():
        _claims, auth_error = require_admin_access()
        if auth_error:
            return auth_error
        try:
            history_page = list_iap_bank_hook_history_page(
                page=request.args.get('page'),
                page_size=request.args.get('pageSize'),
                search_term=request.args.get('search'),
                start_date=request.args.get('startDate'),
                end_date=request.args.get('endDate'),
            )
            return jsonify(history_page)
        except AuthStoreError:
            return _iap_admin_store_error_response()

    @app.route('/api/admin/iap/bank-hook-history/<int:history_id>', methods=['GET'])
    def admin_iap_bank_hook_history_detail_route(history_id):
        _claims, auth_error = require_admin_access()
        if auth_error:
            return auth_error
        try:
            return jsonify({'historyRecord': get_iap_bank_hook_history(history_id)})
        except IapBankHookHistoryNotFoundError:
            return jsonify({'error': 'Bank hook history record not found'}), 404
        except AuthStoreError:
            return _iap_admin_store_error_response()

    @app.route('/api/admin/iap/api-keys/<int:key_id>', methods=['DELETE'])
    def admin_iap_api_key_detail_route(key_id):
        _claims, auth_error = require_admin_access()
        if auth_error:
            return auth_error
        try:
            return jsonify({'apiKey': delete_iap_api_key(key_id)})
        except IapApiKeyNotFoundError:
            return jsonify({'error': 'IAP API key not found'}), 404
        except AuthStoreError:
            return _iap_admin_store_error_response()

    @app.route('/api/admin/iap/pack-functions', methods=['GET', 'POST'])
    def admin_iap_pack_functions_route():
        _claims, auth_error = require_admin_access()
        if auth_error:
            return auth_error

        if request.method == 'GET':
            try:
                return jsonify({'packFunctions': list_iap_pack_functions()})
            except AuthStoreError:
                return _iap_admin_store_error_response()

        payload = request.get_json(silent=True) or {}
        try:
            pack_function = create_iap_pack_function(
                payload.get('packIapId'),
                payload.get('functionType'),
                credits=payload.get('credits'),
                premium_mode=payload.get('premiumMode'),
                premium_duration_days=payload.get('premiumDurationDays'),
                is_active=payload.get('isActive', True),
            )
            return jsonify({'packFunction': pack_function}), 201
        except IapAdminValidationError as error:
            return jsonify({'error': str(error)}), 400
        except AuthStoreError:
            return _iap_admin_store_error_response()

    @app.route('/api/admin/iap/pack-functions/<int:record_id>', methods=['DELETE'])
    def admin_iap_pack_function_detail_route(record_id):
        _claims, auth_error = require_admin_access()
        if auth_error:
            return auth_error
        try:
            return jsonify({'packFunction': delete_iap_pack_function(record_id)})
        except IapAdminNotFoundError:
            return jsonify({'error': 'IAP pack function not found'}), 404
        except AuthStoreError:
            return _iap_admin_store_error_response()

    @app.route('/api/admin/iap/sales', methods=['GET', 'POST'])
    def admin_iap_sales_route():
        _claims, auth_error = require_admin_access()
        if auth_error:
            return auth_error

        if request.method == 'GET':
            try:
                return jsonify({'sales': list_iap_sales()})
            except AuthStoreError:
                return _iap_admin_store_error_response()

        payload = request.get_json(silent=True) or {}
        try:
            sale = create_iap_sale(
                payload.get('name'),
                payload.get('packId'),
                discount_percent=payload.get('discountPercent'),
                start_at=payload.get('startAt'),
                end_at=payload.get('endAt'),
                first_pack_purchase=payload.get('firstPackPurchase'),
                first_iap_purchase=payload.get('firstIapPurchase'),
                is_active=payload.get('isActive', True),
            )
            return jsonify({'sale': sale}), 201
        except IapAdminValidationError as error:
            return jsonify({'error': str(error)}), 400
        except AuthStoreError:
            return _iap_admin_store_error_response()

    @app.route('/api/admin/iap/sales/<int:sale_id>', methods=['DELETE'])
    def admin_iap_sale_detail_route(sale_id):
        _claims, auth_error = require_admin_access()
        if auth_error:
            return auth_error
        try:
            return jsonify({'sale': delete_iap_sale(sale_id)})
        except IapAdminNotFoundError:
            return jsonify({'error': 'IAP sale not found'}), 404
        except AuthStoreError:
            return _iap_admin_store_error_response()

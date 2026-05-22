import secrets

try:
    from auth_store import AuthStoreError, MYSQL_DATABASE, _connect, _require_driver
    from vbee_schema import (
        VBEE_STATUS_COMPLETE,
        VBEE_STATUS_FAILED,
        VBEE_STATUS_PROCESSING,
        VBEE_STATUS_QUEUED,
        VbeeNotFoundError,
        aggregate_status,
        ensure_vbee_schema,
        json_dumps,
        now_timestamp,
        row_to_request,
        row_to_segment,
    )
except ImportError:
    from .auth_store import AuthStoreError, MYSQL_DATABASE, _connect, _require_driver
    from .vbee_schema import (
        VBEE_STATUS_COMPLETE,
        VBEE_STATUS_FAILED,
        VBEE_STATUS_PROCESSING,
        VBEE_STATUS_QUEUED,
        VbeeNotFoundError,
        aggregate_status,
        ensure_vbee_schema,
        json_dumps,
        now_timestamp,
        row_to_request,
        row_to_segment,
    )


def generate_request_id():
    return f'vbee-{now_timestamp()}-{secrets.token_hex(5)}'


def create_vbee_request_record(user_id, language, voice_code, payload, segments):
    ensure_vbee_schema()
    request_id = generate_request_id()
    now = now_timestamp()
    total_segments = len(segments)
    completed_segments = sum(1 for segment in segments if segment.get('status') == VBEE_STATUS_COMPLETE)
    failed_segments = sum(1 for segment in segments if segment.get('status') == VBEE_STATUS_FAILED)
    character_count = sum(int(segment.get('characterCount') or len(segment.get('text') or '')) for segment in segments)
    status = aggregate_status(total_segments, completed_segments, failed_segments, total_segments - completed_segments - failed_segments, 0)
    result_urls = [segment.get('audioUrl') for segment in segments if segment.get('audioUrl')]
    progress = int(round((completed_segments / total_segments) * 100)) if total_segments else 0
    driver = _require_driver()
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO vbee_voice_requests
                        (request_id, user_id, status, progress, queue_position, total_segments, completed_segments, failed_segments, character_count, language, voice_code, payload_json, result_urls_json, error_message, created_at, updated_at)
                    VALUES (%s, %s, %s, %s, 0, %s, %s, %s, %s, %s, %s, %s, %s, '', %s, %s)
                    """,
                    (request_id, user_id, status, progress, total_segments, completed_segments, failed_segments, character_count, language, voice_code, json_dumps(payload), json_dumps(result_urls), now, now),
                )
                for index, segment in enumerate(segments):
                    cursor.execute(
                        """
                        INSERT INTO vbee_voice_segments
                            (request_id, segment_index, text_content, start_ms, end_ms, language, voice_code, cache_key, token_id, provider_request_id, status, audio_url, error_message, character_count, created_at, updated_at)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NULL, %s, %s, %s, %s, %s, %s, %s)
                        """,
                        (request_id, index, segment['text'], int(segment.get('startMs') or 0), int(segment.get('endMs') or 0), language, voice_code, segment['cacheKey'], segment.get('providerRequestId'), segment.get('status') or VBEE_STATUS_QUEUED, segment.get('audioUrl') or None, segment.get('errorMessage') or None, int(segment.get('characterCount') or len(segment['text'])), now, now),
                    )
        finally:
            connection.close()
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to create Vbee request') from error
    return get_vbee_request(request_id)


def refresh_vbee_request_summary(request_id):
    ensure_vbee_schema()
    driver = _require_driver()
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute('SELECT status, COUNT(*) AS count_value FROM vbee_voice_segments WHERE request_id = %s GROUP BY status', (request_id,))
                counts = {row['status']: int(row.get('count_value') or 0) for row in cursor.fetchall() or []}
                cursor.execute('SELECT COUNT(*) AS total_segments, COALESCE(SUM(character_count), 0) AS character_count FROM vbee_voice_segments WHERE request_id = %s', (request_id,))
                totals_row = cursor.fetchone() or {}
                total = int(totals_row.get('total_segments') or 0)
                completed = counts.get(VBEE_STATUS_COMPLETE, 0)
                failed = counts.get(VBEE_STATUS_FAILED, 0)
                queued = counts.get(VBEE_STATUS_QUEUED, 0)
                processing = counts.get(VBEE_STATUS_PROCESSING, 0)
                character_count = int(totals_row.get('character_count') or 0)
                status = aggregate_status(total, completed, failed, queued, processing)
                progress = int(round((completed / total) * 100)) if total else 0
                cursor.execute('SELECT audio_url FROM vbee_voice_segments WHERE request_id = %s AND status = %s AND audio_url IS NOT NULL ORDER BY segment_index ASC', (request_id, VBEE_STATUS_COMPLETE))
                result_urls = [row.get('audio_url') for row in cursor.fetchall() or [] if row.get('audio_url')]
                cursor.execute('SELECT COUNT(*) AS queue_position FROM vbee_voice_requests WHERE status = %s AND created_at < (SELECT created_at FROM vbee_voice_requests WHERE request_id = %s)', (VBEE_STATUS_QUEUED, request_id))
                queue_position = int((cursor.fetchone() or {}).get('queue_position') or 0) + 1 if status == VBEE_STATUS_QUEUED else 0
                cursor.execute(
                    'UPDATE vbee_voice_requests SET status = %s, progress = %s, queue_position = %s, total_segments = %s, completed_segments = %s, failed_segments = %s, character_count = %s, result_urls_json = %s, updated_at = %s WHERE request_id = %s',
                    (status, progress, queue_position, total, completed, failed, character_count, json_dumps(result_urls), now_timestamp(), request_id),
                )
        finally:
            connection.close()
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to update Vbee request') from error
    return get_vbee_request(request_id)


def list_vbee_segments(request_id):
    ensure_vbee_schema()
    driver = _require_driver()
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute('SELECT * FROM vbee_voice_segments WHERE request_id = %s ORDER BY segment_index ASC', (request_id,))
                return [row_to_segment(row) for row in cursor.fetchall() or []]
        finally:
            connection.close()
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to list Vbee segments') from error


def get_vbee_request(request_id, user_id=None):
    ensure_vbee_schema()
    driver = _require_driver()
    params = [request_id]
    user_clause = ''
    if user_id is not None:
        user_clause = ' AND user_id = %s'
        params.append(user_id)
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute(f'SELECT * FROM vbee_voice_requests WHERE request_id = %s{user_clause} LIMIT 1', tuple(params))
                row = cursor.fetchone()
                if not row:
                    raise VbeeNotFoundError('Vbee request not found')
                return row_to_request(row, segments=list_vbee_segments(request_id))
        finally:
            connection.close()
    except VbeeNotFoundError:
        raise
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to load Vbee request') from error


def list_vbee_requests_page(status='', page=1, page_size=20):
    ensure_vbee_schema()
    safe_page = max(1, int(page or 1))
    safe_page_size = max(1, min(100, int(page_size or 20)))
    normalized_status = str(status or '').strip().lower()
    where_clause = 'WHERE status = %s' if normalized_status else ''
    params = [normalized_status] if normalized_status else []
    driver = _require_driver()
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute(f'SELECT COUNT(*) AS total_items FROM vbee_voice_requests {where_clause}', tuple(params))
                total_items = int((cursor.fetchone() or {}).get('total_items') or 0)
                total_pages = max(1, (total_items + safe_page_size - 1) // safe_page_size)
                current_page = min(safe_page, total_pages)
                cursor.execute(
                    f'SELECT * FROM vbee_voice_requests {where_clause} ORDER BY updated_at DESC, created_at DESC LIMIT %s OFFSET %s',
                    tuple(params + [safe_page_size, (current_page - 1) * safe_page_size]),
                )
                return {
                    'requests': [row_to_request(row) for row in cursor.fetchall() or []],
                    'pagination': {
                        'page': current_page,
                        'pageSize': safe_page_size,
                        'totalItems': total_items,
                        'totalPages': total_pages,
                        'hasNext': current_page < total_pages,
                        'hasPrevious': current_page > 1,
                    },
                }
        finally:
            connection.close()
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to list Vbee requests') from error


def list_queued_vbee_segments(limit=25):
    ensure_vbee_schema()
    safe_limit = max(1, min(200, int(limit or 25)))
    driver = _require_driver()
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute('SELECT * FROM vbee_voice_segments WHERE status = %s ORDER BY created_at ASC, id ASC LIMIT %s', (VBEE_STATUS_QUEUED, safe_limit))
                return [row_to_segment(row) for row in cursor.fetchall() or []]
        finally:
            connection.close()
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to list queued Vbee segments') from error


def list_processing_vbee_segments(limit=50):
    ensure_vbee_schema()
    safe_limit = max(1, min(200, int(limit or 50)))
    driver = _require_driver()
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute('SELECT * FROM vbee_voice_segments WHERE status = %s AND provider_request_id IS NOT NULL ORDER BY updated_at ASC, id ASC LIMIT %s', (VBEE_STATUS_PROCESSING, safe_limit))
                return [row_to_segment(row) for row in cursor.fetchall() or []]
        finally:
            connection.close()
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to list processing Vbee segments') from error


def mark_vbee_segment_processing(segment_id, token_id, provider_request_id, voice_code=None):
    return update_vbee_segment(segment_id, status=VBEE_STATUS_PROCESSING, token_id=token_id, provider_request_id=provider_request_id, voice_code=voice_code)


def update_vbee_segment(segment_id, status=None, token_id=None, provider_request_id=None, audio_url=None, error_message=None, language=None, voice_code=None):
    ensure_vbee_schema()
    driver = _require_driver()
    assignments = ['updated_at = %s']
    params = [now_timestamp()]
    if status is not None:
        assignments.append('status = %s')
        params.append(status)
    if token_id is not None:
        assignments.append('token_id = %s')
        params.append(token_id)
    if provider_request_id is not None:
        assignments.append('provider_request_id = %s')
        params.append(provider_request_id)
    if audio_url is not None:
        assignments.append('audio_url = %s')
        params.append(audio_url)
    if error_message is not None:
        assignments.append('error_message = %s')
        params.append(error_message)
    if language is not None:
        assignments.append('language = %s')
        params.append(language)
    if voice_code is not None:
        assignments.append('voice_code = %s')
        params.append(voice_code)
    params.append(int(segment_id))
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute(f'UPDATE vbee_voice_segments SET {", ".join(assignments)} WHERE id = %s', tuple(params))
                cursor.execute('SELECT request_id FROM vbee_voice_segments WHERE id = %s LIMIT 1', (int(segment_id),))
                row = cursor.fetchone()
                if row and (language is not None or voice_code is not None):
                    request_assignments = ['updated_at = %s']
                    request_params = [now_timestamp()]
                    if language is not None:
                        request_assignments.append('language = %s')
                        request_params.append(language)
                    if voice_code is not None:
                        request_assignments.append('voice_code = %s')
                        request_params.append(voice_code)
                    request_params.append(row['request_id'])
                    cursor.execute(f'UPDATE vbee_voice_requests SET {", ".join(request_assignments)} WHERE request_id = %s', tuple(request_params))
        finally:
            connection.close()
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to update Vbee segment') from error
    return refresh_vbee_request_summary(row['request_id']) if row else None


def clear_vbee_request_data_for_cache_key(cache_key):
    ensure_vbee_schema()
    safe_cache_key = str(cache_key or '').strip()
    if not safe_cache_key:
        raise VbeeNotFoundError('Vbee segment not found')
    driver = _require_driver()
    request_ids = []
    refresh_request_ids = []
    deleted_request_count = 0
    segment_count = 0
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute('SELECT DISTINCT request_id FROM vbee_voice_segments WHERE cache_key = %s', (safe_cache_key,))
                request_ids = [row.get('request_id') or '' for row in cursor.fetchall() or [] if row.get('request_id')]
                cursor.execute('SELECT COUNT(*) AS total_items FROM vbee_voice_segments WHERE cache_key = %s', (safe_cache_key,))
                segment_count = int((cursor.fetchone() or {}).get('total_items') or 0)
                if segment_count <= 0:
                    raise VbeeNotFoundError('Vbee segment not found')
                cursor.execute('DELETE FROM vbee_voice_segments WHERE cache_key = %s', (safe_cache_key,))
                for request_id in request_ids:
                    cursor.execute('SELECT COUNT(*) AS total_items FROM vbee_voice_segments WHERE request_id = %s', (request_id,))
                    remaining_segments = int((cursor.fetchone() or {}).get('total_items') or 0)
                    if remaining_segments > 0:
                        refresh_request_ids.append(request_id)
                        continue
                    cursor.execute('DELETE FROM vbee_voice_requests WHERE request_id = %s', (request_id,))
                    deleted_request_count += int(cursor.rowcount or 0)
        finally:
            connection.close()
    except VbeeNotFoundError:
        raise
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to clear Vbee segment request data') from error

    for request_id in refresh_request_ids:
        refresh_vbee_request_summary(request_id)

    return {
        'deletedRequestCount': deleted_request_count,
        'requestCount': len(request_ids),
        'requestIds': request_ids,
        'segmentCount': segment_count,
    }


def clear_all_vbee_request_data():
    ensure_vbee_schema()
    driver = _require_driver()
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute('SELECT COUNT(*) AS total_items FROM vbee_voice_requests')
                request_count = int((cursor.fetchone() or {}).get('total_items') or 0)
                cursor.execute('SELECT COUNT(*) AS total_items FROM vbee_voice_segments')
                segment_count = int((cursor.fetchone() or {}).get('total_items') or 0)
                cursor.execute('SELECT COUNT(*) AS total_items FROM vbee_audio_cache')
                asset_count = int((cursor.fetchone() or {}).get('total_items') or 0)
                cursor.execute('DELETE FROM vbee_voice_segments')
                cursor.execute('DELETE FROM vbee_voice_requests')
                cursor.execute('DELETE FROM vbee_audio_cache')
        finally:
            connection.close()
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to clear Vbee request data') from error
    return {
        'assetCount': asset_count,
        'requestCount': request_count,
        'segmentCount': segment_count,
    }


def get_vbee_segment_by_provider_request(provider_request_id):
    ensure_vbee_schema()
    driver = _require_driver()
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute('SELECT * FROM vbee_voice_segments WHERE provider_request_id = %s LIMIT 1', (provider_request_id,))
                segment = row_to_segment(cursor.fetchone())
                if not segment:
                    raise VbeeNotFoundError('Vbee segment not found')
                return segment
        finally:
            connection.close()
    except VbeeNotFoundError:
        raise
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to load Vbee segment') from error



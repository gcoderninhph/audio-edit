try:
    from services.auth_store import DEFAULT_INITIAL_CREDITS, DEFAULT_USER_ROLE, find_user_by_id
except ImportError:
    from ..services.auth_store import DEFAULT_INITIAL_CREDITS, DEFAULT_USER_ROLE, find_user_by_id



def normalize_display_name(display_name, email):
    normalized_name = str(display_name or '').strip()
    if normalized_name:
        return normalized_name[:80]
    return email.split('@', 1)[0] if '@' in email else 'Editor'



def normalize_username(username):
    normalized_value = ''.join(
        character for character in str(username or '').strip().lower()
        if character.isalnum() or character in {'-', '_', '.'}
    )
    return normalized_value[:80]



def public_user_from_record(user_record):
    return {
        'id': user_record['id'],
        'credits': max(0, int(user_record.get('credits') or 0)),
        'email': user_record['email'],
        'isLocked': bool(user_record.get('isLocked')),
        'isPremium': bool(user_record.get('isPremium')),
        'premiumStartAt': int(user_record.get('premiumStartAt') or 0),
        'premiumEndAt': int(user_record.get('premiumEndAt') or 0),
        'role': user_record.get('role') or DEFAULT_USER_ROLE,
        'username': user_record.get('username') or '',
        'displayName': user_record.get('displayName') or normalize_display_name('', user_record['email']),
        'isTemporaryAdmin': False,
        'mustSetupAdmin': False,
    }



def build_fallback_user(
    user_id,
    email,
    display_name,
    fallback_credits=DEFAULT_INITIAL_CREDITS,
    fallback_is_premium=False,
    fallback_role=DEFAULT_USER_ROLE,
    fallback_username='',
    is_temporary_admin=False,
    must_setup_admin=False,
):
    return {
        'id': user_id,
        'credits': max(0, int(fallback_credits or 0)),
        'email': email,
        'isLocked': False,
        'isPremium': bool(fallback_is_premium),
        'premiumStartAt': 0,
        'premiumEndAt': 0,
        'role': fallback_role or DEFAULT_USER_ROLE,
        'username': fallback_username or '',
        'displayName': display_name,
        'isTemporaryAdmin': bool(is_temporary_admin),
        'mustSetupAdmin': bool(must_setup_admin),
    }



def get_current_user_state(
    user_id,
    email,
    display_name,
    fallback_credits=DEFAULT_INITIAL_CREDITS,
    fallback_is_premium=False,
    fallback_role=DEFAULT_USER_ROLE,
    fallback_username='',
    is_temporary_admin=False,
    must_setup_admin=False,
):
    if is_temporary_admin:
        return build_fallback_user(
            user_id,
            email,
            display_name,
            fallback_credits=fallback_credits,
            fallback_is_premium=fallback_is_premium,
            fallback_role=fallback_role,
            fallback_username=fallback_username,
            is_temporary_admin=True,
            must_setup_admin=must_setup_admin,
        )

    stored_user = find_user_by_id(user_id)
    if stored_user:
        return public_user_from_record(stored_user)
    return build_fallback_user(
        user_id,
        email,
        display_name,
        fallback_credits=fallback_credits,
        fallback_is_premium=fallback_is_premium,
        fallback_role=fallback_role,
        fallback_username=fallback_username,
    )

from flask import jsonify

try:
    from auth_store import AuthStoreError, InsufficientCreditsError, debit_user_credits, refund_user_credits
    from proxy_route_helpers import get_claim_user_id
except ImportError:
    from .auth_store import AuthStoreError, InsufficientCreditsError, debit_user_credits, refund_user_credits
    from .proxy_route_helpers import get_claim_user_id


def auth_store_error_response():
    return jsonify({'error': 'Authentication database is unavailable'}), 503


def build_credit_error_response(error, action_label):
    return jsonify({
        'error': f'Not enough credits to {action_label}',
        'availableCredits': error.available_credits,
        'creditBalance': error.available_credits,
        'requiredCredits': error.required_credits,
    }), 402


def charge_user_credits_or_error(claims, credit_cost, action_label, change_type, details=None):
    try:
        return debit_user_credits(
            get_claim_user_id(claims),
            credit_cost,
            change_type=change_type,
            note=action_label,
            details=details,
        ), None
    except InsufficientCreditsError as error:
        return None, build_credit_error_response(error, action_label)
    except AuthStoreError:
        return None, auth_store_error_response()


def refund_credits_if_needed(user_id, credit_cost, change_type, note, details=None):
    if not user_id or credit_cost <= 0:
        return

    try:
        refund_user_credits(user_id, credit_cost, change_type=change_type, note=note, details=details)
    except AuthStoreError as error:
        print(f'Unable to refund credits after failed request: {error}')
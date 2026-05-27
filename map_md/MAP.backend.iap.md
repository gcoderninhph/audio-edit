# MAP.backend.iap

## IAP controllers
- `server/controllers/iap_routes.py` - Defines public IAP catalog APIs plus admin package, key, history, function, and sale APIs.
- `server/controllers/iap_payment_routes.py` - Defines desktop payment, refund, QR-image, and payment-expiry APIs.

## IAP services
- `server/services/iap_admin_store.py` - Owns admin IAP pack-function and sale validation rules.
- `server/services/iap_api_key_store.py` - Owns payment-hook API key validation and header matching.
- `server/services/iap_bank_hook_history_store.py` - Owns bank-hook history normalization, filtering, detail shaping, and paging.
- `server/services/iap_beneficiary_store.py` - Owns beneficiary account validation and current-account rules.
- `server/services/iap_cache.py` - Stores public IAP package cache keys and TTL helpers.
- `server/services/iap_payment_expiry.py` - Runs the background worker that expires pending payment tickets.
- `server/services/iap_payment_store.py` - Owns payment ticket creation, matching, refund, and entitlement application.
- `server/services/iap_store.py` - Owns IAP package validation, normalization, and catalog persistence behavior.

## IAP repositories
- `server/repositories/iap_admin_repository.py` - Owns admin IAP pack-function and sale SQL.
- `server/repositories/iap_api_key_repository.py` - Owns payment-hook API key schema and CRUD SQL.
- `server/repositories/iap_bank_hook_history_repository.py` - Owns bank-hook history schema, insert, detail, and paged list SQL.
- `server/repositories/iap_beneficiary_repository.py` - Owns beneficiary account schema and CRUD SQL.
- `server/repositories/iap_package_repository.py` - Owns IAP package schema and CRUD SQL.
- `server/repositories/iap_payment_repository.py` - Owns payment ticket, refund, and entitlement mutation SQL.

## IAP utilities
- `server/utils/iap_payment_records.py` - Maps payment/refund rows and shared IAP pagination payloads.

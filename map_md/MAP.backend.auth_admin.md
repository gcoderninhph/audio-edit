# MAP.backend.auth_admin

## auth and admin controllers
- `server/controllers/auth_routes.py` - Defines login, logout, refresh, current-user, and admin access guard routes.
- `server/controllers/admin_routes.py` - Defines admin bootstrap, user-management, credit-history, and request-summary APIs.

## auth and admin services
- `server/services/admin_bootstrap.py` - Creates and clears temporary bootstrap admin credentials.
- `server/services/admin_store.py` - Implements admin user-management validation and payload shaping.
- `server/services/auth_credit_store.py` - Owns credit-history reads and balance mutation rules.
- `server/services/auth_refresh_store.py` - Owns refresh-token issuance, validation, and cleanup rules.
- `server/services/auth_store.py` - Owns auth user normalization, session behavior, and schema bootstrap.
- `server/services/request_store.py` - Shapes request records and request-history pagination for admin views.

## auth and admin repositories
- `server/repositories/admin_user_repository.py` - Owns admin-user SQL reads, writes, and list queries.
- `server/repositories/auth_credit_repository.py` - Owns credit-history and balance-mutation SQL.
- `server/repositories/auth_refresh_repository.py` - Owns refresh-token persistence SQL.
- `server/repositories/auth_user_repository.py` - Owns auth-user schema bootstrap and user persistence SQL.
- `server/repositories/request_repository.py` - Owns request-record persistence and paging queries.

## auth and admin utilities
- `server/utils/auth_identity.py` - Normalizes auth-facing usernames, display names, and public user payloads.
- `server/utils/auth_user_record.py` - Normalizes auth user role, lock, and premium-window fields.

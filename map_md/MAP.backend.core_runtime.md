# MAP.backend.core_runtime

## backend bootstrap
- `server/app.py` - Initializes Flask, registers controller modules, configures logging, and starts background workers.
- `server/Dockerfile` - Builds the backend image and embeds the built admin frontend output.
- `server/requirements.txt` - Lists Python runtime dependencies used by the backend container.
- `server/controllers/__init__.py` - Marks the controller package used during route registration.
- `server/services/__init__.py` - Marks the service package used for backend business domains.
- `server/repositories/__init__.py` - Marks the repository package used for SQL and persistence domains.
- `server/utils/__init__.py` - Marks the shared backend utility package.

## admin web serving
- `server/controllers/admin_web_routes.py` - Serves the built standalone admin SPA and nested `/admin/...` routes.

## backend shared utilities
- `server/utils/logging_setup.py` - Configures backend log files and request/response logging behavior.
- `server/utils/mysql_connection.py` - Centralizes MySQL connection creation and identifier quoting helpers.
- `server/utils/pagination.py` - Provides shared pagination normalization and payload builders.
- `server/utils/redis_connection.py` - Centralizes Redis client construction and env resolution.

## backend scripts
- `server/scripts/cleanup_whisper_queue.py` - Inspects Whisper queue directories and safely cleans unused queue data.
- `cleanup_whisper_queue.ps1` - Runs the Whisper queue cleanup script inside the backend container on Windows.

## backend runtime root
- `docker-compose.yml` - Defines the backend stack, admin build embedding, MySQL, Redis, and Whisper runtime services.

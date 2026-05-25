# Backend Map

## server root
- `server/app.py` - Flask entrypoint that wires controller modules, shared logging, centralized HTTP request or response logging hooks, health checks, and background workers including the Whisper queue dispatcher through the new role-based package layout.
- `server/controllers/__init__.py` - Marks the controller package that owns HTTP route registration modules.
- `server/services/__init__.py` - Marks the service package that owns business workflows, store orchestration, caches, and workers.
- `server/repositories/__init__.py` - Marks the repository package that owns SQL and low-level persistence access.
- `server/utils/__init__.py` - Marks the utility package that owns shared helpers reused across controllers, services, and repositories.
- `server/requirements.txt` - Lists Python runtime dependencies for the subtitle-service backend.
- `server/Dockerfile` - Builds the backend runtime image and serves Flask on port `5000`.

## server/controllers
- `server/controllers/admin_routes.py` - Registers admin-only backend APIs for bootstrap, user management, credit history, and recent requests.
- `server/controllers/admin_web_routes.py` - Serves the built standalone admin frontend from the workspace-level `admin-frontend/dist`, redirects `/` into the admin SPA, and handles nested `/admin/...` routes.
- `server/controllers/auth_routes.py` - Registers auth endpoints, JWT access or refresh flows, current-user reads, logout, and admin access guards.
- `server/controllers/iap_payment_routes.py` - Registers desktop payment ticket APIs, QR-image proxying, admin payment APIs, and payment expiry worker startup.
- `server/controllers/iap_routes.py` - Registers public IAP catalog reads plus admin IAP package, API key, history, function, and sale APIs.
- `server/controllers/openai_translation_routes.py` - Registers admin-only Service/OpenAI token, request, config, and one-off test-translation upload APIs.
- `server/controllers/proxy_routes.py` - Registers transcription proxy endpoints plus the OpenAI-backed subtitle translation contract, exposes authenticated Create Sub credit estimation, calculates word-based translation credits from SRT text before charging, and enforces local request ownership checks.
- `server/controllers/proxy_transcription_routes.py` - Owns the authenticated transcription proxy endpoints, calculates Whisper detect credits from configured per-minute rates and floored video duration, charges or refunds credits around Whisper job creation, returns stable local request ids for queued or processing transcription jobs, and reads queue-aware status snapshots from the Whisper runtime service.
- `server/controllers/vbee_routes.py` - Registers client voiceover config, credit-estimate, start, and status APIs plus admin Service/Vbee token, request, segment, audio, cache-clear, delete, and config APIs, using the server-side estimate as the actual narration credit charge.
- `server/controllers/whisper_routes.py` - Registers admin-only Service/Whisper request-list, config, plus processing-node list, create, update, and delete APIs.

## server/services
- `server/services/admin_bootstrap.py` - Creates and clears the temporary bootstrap admin credentials when no persisted admin exists.
- `server/services/admin_store.py` - Owns admin-user business rules and validation while delegating SQL execution to `server/repositories/admin_user_repository.py` and shared pagination helpers.
- `server/services/auth_credit_store.py` - Owns auth credit business rules while delegating SQL execution to `server/repositories/auth_credit_repository.py` and shared pagination helpers.
- `server/services/auth_refresh_store.py` - Owns refresh-token business logic, schema guards, and auth-facing error mapping while delegating SQL execution to `server/repositories/auth_refresh_repository.py`.
- `server/services/auth_store.py` - Owns auth-user normalization, premium or lock state shaping, duplicate-user handling, and compatibility exports while delegating auth-user SQL execution to `server/repositories/auth_user_repository.py`.
- `server/services/iap_admin_store.py` - Owns admin-only IAP pack-function and sale validation/rule logic while delegating SQL execution to `server/repositories/iap_admin_repository.py`.
- `server/services/iap_api_key_store.py` - Owns payment-hook API key business validation and inbound header-match logic while delegating SQL execution to `server/repositories/iap_api_key_repository.py`.
- `server/services/iap_bank_hook_history_store.py` - Owns bank-hook history payload normalization, date/filter shaping, and paginated response shaping while delegating SQL execution to `server/repositories/iap_bank_hook_history_repository.py`.
- `server/services/iap_beneficiary_store.py` - Owns beneficiary-account validation and current-account business rules while delegating SQL execution to `server/repositories/iap_beneficiary_repository.py`.
- `server/services/iap_cache.py` - Owns the public IAP package cache keys and TTL behavior while reusing the shared Redis helper package.
- `server/services/iap_payment_expiry.py` - Starts the worker that expires pending payment tickets every minute.
- `server/services/iap_payment_store.py` - Owns QR payment entitlement and matching logic while delegating SQL execution to `server/repositories/iap_payment_repository.py` and helper row mappers.
- `server/services/iap_store.py` - Owns IAP package business validation, payload normalization, and auth-facing error mapping while delegating SQL execution to `server/repositories/iap_package_repository.py`.
- `server/services/openai_translation_client.py` - Owns the low-level OpenAI request-building, prompt assembly, usage extraction, and SRT-response normalization helpers used by the OpenAI translation service flow.
- `server/services/openai_translation_service.py` - Runs asynchronous OpenAI subtitle translation jobs, synchronous admin `.srt` tests, and request-history persistence.
- `server/services/openai_translation_store.py` - Owns OpenAI token/config/request validation, including credit-per-word translation billing config, and detail sanitization flow while delegating SQL execution to `server/repositories/openai_translation_repository.py` and shared pagination helpers.
- `server/services/request_store.py` - Owns request-record serialization, legacy-file migration orchestration, and request-facing error mapping while delegating SQL execution to `server/repositories/request_repository.py` and shared pagination helpers.
- `server/services/translation_fallback.py` - Retains the local subtitle translation helpers plus shared SRT parsing utilities used by translation job flows.
- `server/services/subtitle_credit_service.py` - Calculates subtitle workflow credits by counting words from SRT text or cached subtitle JSON for OpenAI translation, applying configured Whisper detect-credit-per-minute rates to floored video duration, and composing Create Sub estimates for detect-first versus cached-origin flows.
- `server/services/vbee_asset_expiry.py` - Starts the daemon worker that expires old Vbee segment assets.
- `server/services/vbee_asset_service.py` - Orchestrates the Cloudflare R2-backed Vbee asset lifecycle, reuse expiry, delete helpers, and the shared reusable-cache predicate that lets both credit estimation and request creation recognize cross-project Vbee segment reuse.
- `server/services/vbee_audio_cache_store.py` - Owns Vbee audio-cache payload shaping and post-clear refresh orchestration while delegating SQL execution to `server/repositories/vbee_audio_cache_repository.py`.
- `server/services/vbee_cache.py` - Owns Vbee request and audio cache keys plus TTL behavior while reusing the shared Redis helper package.
- `server/services/vbee_credit_service.py` - Estimates Vbee narration credits from normalized subtitle text by comparing reusable cached or backfillable segment assets against uncached Vbee calls, applying configured float per-character rates, and rounding the final charge up to an integer.
- `server/services/vbee_request_store.py` - Owns Vbee request/segment business orchestration, status aggregation logic, string segment-id generation for new rows, and pagination while delegating SQL execution to `server/repositories/vbee_request_repository.py`.
- `server/services/vbee_segment_store.py` - Owns grouped Vbee segment status derivation, failure-detail shaping, pagination, and summary normalization for string-backed Vbee token references while delegating SQL execution to `server/repositories/vbee_segment_repository.py`.
- `server/services/vbee_service.py` - Orchestrates Vbee voiceover creation, provider polling, webhook completion, reuse, request summary refresh, and language-aware voice selection.
- `server/services/vbee_token_store.py` - Owns Vbee token/config normalization, including per-character and cached per-character credit-rate settings, and response shaping while delegating SQL execution to `server/repositories/vbee_token_repository.py`.
- `server/services/whisper_admin_store.py` - Owns Whisper admin request paging, provider billing config, per-request queue metadata shaping, processing-node name/URL/concurrency validation, node-update and delete rules, schema bootstrap, and dispatch-node selection while delegating SQL execution to the Whisper admin and config repositories.
- `server/services/whisper_runtime.py` - Owns the Whisper temp-file queue lifecycle, local request-id generation, background dispatch worker, the lock-scoped queue-claim step that assigns node capacity before dispatch, the guard that skips provider polling while a sync dispatch still has no real provider job id, in-flight dispatch status transitions used by the admin node-processing counter, provider polling, queue-aware status payload shaping, and automatic submission of saved files when node capacity frees up.
- `server/services/whisper_runtime_status.py` - Holds Whisper runtime status constants plus the shared request-status and provider-status normalization helpers extracted from `server/services/whisper_runtime.py` to keep the dispatch orchestrator under the workspace line-count guardrail.

## server/repositories
- `server/repositories/admin_user_repository.py` - Owns admin-user SQL reads and writes for counts, list paging, summaries, and role/premium/lock updates.
- `server/repositories/auth_credit_repository.py` - Owns auth credit-history SQL and low-level balance mutation queries.
- `server/repositories/auth_refresh_repository.py` - Owns the auth refresh-token SQL and low-level cursor work.
- `server/repositories/auth_user_repository.py` - Owns auth-user schema SQL, legacy-user migration inserts, and low-level user read/create queries.
- `server/repositories/iap_admin_repository.py` - Owns admin IAP pack-function and sale SQL for schema, list/detail, create, update, and delete operations.
- `server/repositories/iap_api_key_repository.py` - Owns payment-hook API key SQL and low-level cursor work for schema, list, create, delete, method filtering, and usage touch updates.
- `server/repositories/iap_bank_hook_history_repository.py` - Owns bank-hook history SQL and low-level cursor work for schema, detail lookup, inserts, and paged list/count queries.
- `server/repositories/iap_beneficiary_repository.py` - Owns beneficiary-account SQL and low-level cursor work for schema, list/detail, current-flag updates, create/update/delete, and fallback current-account selection.
- `server/repositories/iap_package_repository.py` - Owns IAP package SQL and low-level cursor work for package schema, list, create, update, and delete operations.
- `server/repositories/iap_payment_repository.py` - Owns IAP payment-ticket/refund SQL for schema, ticket lifecycle mutations, refund inserts, premium updates, and paged record reads.
- `server/repositories/openai_translation_repository.py` - Owns OpenAI translation schema SQL plus token/config/request-row CRUD and paging queries, including the credit-per-word config column.
- `server/repositories/request_repository.py` - Owns request-storage schema SQL plus translation-job and server-request CRUD/paging queries.
- `server/repositories/vbee_audio_cache_repository.py` - Owns Vbee reusable-audio-cache SQL and segment-audio clear queries.
- `server/repositories/vbee_request_repository.py` - Owns Vbee request/segment SQL for request creation, explicit string segment-id inserts, summary aggregation, paging, segment updates, and cache-clear deletes.
- `server/repositories/vbee_segment_repository.py` - Owns grouped Vbee segment summary/detail SQL reads for admin segment surfaces.
- `server/repositories/vbee_token_repository.py` - Owns Vbee token/config SQL, token stats reads, and active-capacity query operations.
- `server/repositories/whisper_admin_repository.py` - Owns Whisper admin SQL for processing-node schema or CRUD with `node_name` plus `max_concurrent_requests`, processing-node delete statements, queue-position reads, named dispatch locks, and filtered Whisper request count or paging queries over `server_requests`.
- `server/repositories/whisper_config_repository.py` - Owns the split Whisper service config table and persistence for detect-credit-per-minute billing so `whisper_admin_repository.py` remains under the 400-line guardrail.

## server/utils
- `server/utils/auth_identity.py` - Holds shared auth-side username normalization, display-name normalization, and public-user shaping helpers reused by auth controllers.
- `server/utils/auth_user_record.py` - Centralizes auth-user role, lock, and premium-window normalization.
- `server/utils/iap_payment_records.py` - Holds payment ticket/refund row mappers plus IAP record pagination helpers.
- `server/utils/logging_setup.py` - Configures hourly rotating backend log files, resolves the runtime log directory for Docker versus local runs, and registers compact single-line HTTP logging with `reqId`, a `HTTP [<time>ms]` prefix, 100-character request or response body previews, and masking for sensitive headers or payload fields such as authorization, password, token, and secret values.
- `server/utils/mysql_connection.py` - Centralizes MySQL env-resolution order, PyMySQL loading, identifier quoting, and the shared `driver.connect(...)` path reused by repositories and services.
- `server/utils/openai_translation_record_utils.py` - Holds the OpenAI token/config/request-row serialization, including credit-per-word config shaping, and request-detail scrubbing helpers.
- `server/utils/pagination.py` - Centralizes page/page-size normalization and pagination payload construction reused across multiple backend services.
- `server/utils/proxy_credit_helpers.py` - Centralizes shared credit charge/refund helpers for proxy-backed routes.
- `server/utils/proxy_route_helpers.py` - Owns shared proxy-route helpers for provider shaping, persisted request handling, and response shaping.
- `server/utils/redis_connection.py` - Centralizes Redis env-resolution order plus the shared `redis.Redis(...)` client construction used by backend cache modules.
- `server/utils/vbee_schema.py` - Defines Vbee statuses, validators, serializers, and MySQL schema helpers, including compatibility with the live `vbee_voice_segments` string-id schema.
- `server/utils/vbee_voice_catalog.py` - Normalizes the supported voiceover language catalog and resolves matching Vbee `voice_code` values for requested languages.

## server/scripts
- `server/scripts/cleanup_whisper_queue.py` - Safely inspects `server/uploads/whisper-queue` against persisted Whisper request records, keeps only queue dirs still referenced by a live queued or processing request, and supports dry-run or `--apply` cleanup output for operators.

## root
- `.gitignore` - Excludes generated workspace artifacts, runtime data, logs, uploads, and bind-mounted service data.
- `.dockerignore` - Keeps Docker build context small by excluding git metadata, caches, logs, projects, and installed dependencies.
- `.env` - Stores local Docker Compose secrets and backend runtime defaults.
- `cleanup_whisper_queue.ps1` - Runs the safe Whisper queue cleanup command inside the `web` container, defaulting to dry-run mode and forwarding `-Apply` or `-Json` for Windows operators.
- `docker-compose.yml` - Defines the containerized backend stack, internal service wiring, and published ports for the Flask backend, MySQL, Redis, twenty Whisper runtime nodes (`whishper` through `whishper-20`) using shared service anchors with per-node upload and log bind mounts, the internal `translate` dependency required by the Whisper image nginx config, and related runtime services.
- `TASK.md` - Tracks active work, validation state, and follow-up refactors for the repository.
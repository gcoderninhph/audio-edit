# MAP.backend.media_services

## translation and voiceover controllers
- `server/controllers/openai_translation_routes.py` - Defines admin OpenAI token, request, config, and test translation APIs.
- `server/controllers/proxy_routes.py` - Defines subtitle translation proxy APIs and authenticated Create Sub estimate behavior.
- `server/controllers/proxy_transcription_routes.py` - Defines subtitle transcription queue APIs and Whisper credit charging/refund flow.
- `server/controllers/vbee_routes.py` - Defines Vbee config, estimate, start, status, and admin Vbee management APIs.
- `server/controllers/whisper_routes.py` - Defines admin Whisper request, node, and provider-config APIs.

## translation and voiceover services
- `server/services/openai_translation_client.py` - Builds OpenAI requests and normalizes translation responses.
- `server/services/openai_translation_service.py` - Runs OpenAI subtitle translation jobs and admin test translations.
- `server/services/openai_translation_store.py` - Owns OpenAI token/config/request validation and detail shaping.
- `server/services/subtitle_credit_service.py` - Calculates Create Sub credit estimates across detect and translation phases.
- `server/services/translation_fallback.py` - Holds local subtitle translation helpers and shared SRT parsing utilities.
- `server/services/vbee_asset_expiry.py` - Runs the background expiry worker for old Vbee segment assets.
- `server/services/vbee_asset_service.py` - Owns Vbee asset storage, reuse, delete, and cache-eligibility behavior.
- `server/services/vbee_audio_cache_store.py` - Shapes Vbee audio-cache payloads and cache-clear refresh behavior.
- `server/services/vbee_cache.py` - Stores Vbee request and audio cache keys and TTL behavior.
- `server/services/vbee_credit_service.py` - Estimates Vbee narration credit cost from subtitle content and reusable cache state.
- `server/services/vbee_request_store.py` - Owns Vbee request orchestration, status shaping, and segment persistence behavior.
- `server/services/vbee_segment_store.py` - Shapes grouped Vbee segment summaries, detail payloads, and failure data.
- `server/services/vbee_service.py` - Orchestrates Vbee request creation, polling, webhook completion, and reuse behavior.
- `server/services/vbee_token_store.py` - Owns Vbee token/config normalization and persistence behavior.
- `server/services/whisper_admin_store.py` - Owns Whisper admin paging, node validation, config persistence, and dispatch-node selection.
- `server/services/whisper_runtime.py` - Owns the Whisper queue, dispatch worker, provider polling, and runtime status transitions.
- `server/services/whisper_runtime_status.py` - Holds shared Whisper runtime status constants and normalization helpers.

## translation and voiceover repositories
- `server/repositories/openai_translation_repository.py` - Owns OpenAI schema, token/config, and request-history SQL.
- `server/repositories/vbee_audio_cache_repository.py` - Owns Vbee reusable-audio-cache SQL and cache-clear deletes.
- `server/repositories/vbee_request_repository.py` - Owns Vbee request/segment persistence, paging, and summary SQL.
- `server/repositories/vbee_segment_repository.py` - Owns grouped Vbee segment summary and detail SQL reads.
- `server/repositories/vbee_token_repository.py` - Owns Vbee token/config SQL and token-capacity reads.
- `server/repositories/whisper_admin_repository.py` - Owns Whisper processing-node CRUD, queue, and request paging SQL.
- `server/repositories/whisper_config_repository.py` - Owns split Whisper provider-config persistence for detect-credit billing.

## translation and voiceover utilities
- `server/utils/openai_translation_record_utils.py` - Serializes OpenAI config/request rows and scrubs detail payloads.
- `server/utils/proxy_credit_helpers.py` - Centralizes credit charge/refund helpers for proxy-backed subtitle routes.
- `server/utils/proxy_route_helpers.py` - Centralizes shared subtitle proxy request/response helpers.
- `server/utils/vbee_schema.py` - Defines Vbee statuses, serializers, and schema helpers.
- `server/utils/vbee_voice_catalog.py` - Normalizes supported Vbee languages and resolves voice codes.

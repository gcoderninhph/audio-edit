# MAP.admin_web.service

## admin service routing
- `admin-frontend/src/components/ServicePage.jsx` - Wraps the dedicated Service route and passes route state into the Service shell.
- `admin-frontend/src/components/ServiceManagementTabs.jsx` - Renders the top-level Service tab shell for OpenAI, Vbee, and Whisper.

## admin OpenAI service
- `admin-frontend/src/api/adminOpenAiApi.js` - Wraps admin OpenAI token, request, config, and test-upload APIs.
- `admin-frontend/src/components/OpenAiOperationsPanel.jsx` - Renders the OpenAI left-nav shell and route-driven detail layout.
- `admin-frontend/src/components/OpenAiTokensPanel.jsx` - Renders OpenAI token CRUD and active-state controls.
- `admin-frontend/src/components/OpenAiRequestsPanel.jsx` - Renders paginated OpenAI request monitoring and row navigation.
- `admin-frontend/src/components/OpenAiRequestDetailPanel.jsx` - Renders OpenAI request detail summaries and metadata rows.
- `admin-frontend/src/components/OpenAiTokenUsagePanel.jsx` - Renders token-usage analytics across saved OpenAI requests.
- `admin-frontend/src/components/OpenAiTestPanel.jsx` - Renders the one-off `.srt` translation test tool.
- `admin-frontend/src/components/OpenAiConfigPanel.jsx` - Renders provider config for model, prompt, timeout, and billing inputs.

## admin Vbee service
- `admin-frontend/src/api/adminVbeeApi.js` - Wraps admin Vbee token, request, segment, cache, audio, and config APIs.
- `admin-frontend/src/components/VbeeOperationsPanel.jsx` - Renders the Vbee left-nav shell and route-driven content surface.
- `admin-frontend/src/components/VbeeTokensPanel.jsx` - Renders Vbee token CRUD and concurrency settings.
- `admin-frontend/src/components/VbeeRequestsPanel.jsx` - Renders Vbee request monitoring and detail replacement views.
- `admin-frontend/src/components/VbeeSegmentsPanel.jsx` - Renders grouped Vbee segment lists, filters, and cache-clear actions.
- `admin-frontend/src/components/VbeeSegmentDetailPanel.jsx` - Renders Vbee segment detail, failure data, and audio preview actions.
- `admin-frontend/src/components/VbeeConfigPanel.jsx` - Renders Vbee provider config and enabled-language controls.

## admin Whisper service
- `admin-frontend/src/api/adminWhisperApi.js` - Wraps admin Whisper request, node, and config APIs.
- `admin-frontend/src/components/WhisperOperationsPanel.jsx` - Renders the Whisper left-nav shell and route-driven content layout.
- `admin-frontend/src/components/WhisperNodesPanel.jsx` - Renders Whisper node-management CRUD and capacity summaries.
- `admin-frontend/src/components/WhisperRequestsPanel.jsx` - Renders paginated Whisper request monitoring with queue metadata.
- `admin-frontend/src/components/WhisperConfigPanel.jsx` - Renders Whisper provider config and detect-credit billing inputs.

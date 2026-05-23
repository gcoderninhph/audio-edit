WHISPER_STATUS_QUEUED = 'queued'
WHISPER_STATUS_PROCESSING = 'processing'
WHISPER_STATUS_SUCCESS = 'success'
WHISPER_STATUS_FAILED = 'failed'


def normalize_whisper_runtime_status(status):
    safe_status = str(status or '').strip().lower()
    if safe_status == 'running':
        return WHISPER_STATUS_PROCESSING
    if safe_status in {WHISPER_STATUS_QUEUED, WHISPER_STATUS_PROCESSING, WHISPER_STATUS_SUCCESS, WHISPER_STATUS_FAILED}:
        return safe_status
    return WHISPER_STATUS_PROCESSING


def normalize_whisper_provider_job_status(raw_status):
    safe_status = str(raw_status or '').strip().lower()
    if safe_status in {'2', 'success', 'succeeded', 'complete', 'completed', 'finished', 'done'}:
        return WHISPER_STATUS_SUCCESS
    if safe_status in {'-1', 'failed', 'failure', 'error', 'errored', 'cancelled', 'canceled'}:
        return WHISPER_STATUS_FAILED
    return WHISPER_STATUS_PROCESSING


def read_whisper_request_details(record):
    details = record.get('details') or {}
    return dict(details) if isinstance(details, dict) else {}
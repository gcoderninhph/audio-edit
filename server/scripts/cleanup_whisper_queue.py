import argparse
import json
import shutil
import sys
from pathlib import Path

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

from services.request_store import RequestStoreError, get_request_record  # noqa: E402
from services.whisper_runtime_status import (  # noqa: E402
    WHISPER_STATUS_PROCESSING,
    WHISPER_STATUS_QUEUED,
    normalize_whisper_runtime_status,
)

QUEUE_ROOT = SERVER_ROOT / 'uploads' / 'whisper-queue'
WHISPER_PROVIDERS = {'whisper', 'whishper'}


def _entry_contains_path(entry_path, target_path):
    resolved_entry = entry_path.resolve()
    resolved_target = target_path.resolve()
    if resolved_entry.is_dir():
        try:
            resolved_target.relative_to(resolved_entry)
            return True
        except ValueError:
            return False
    return resolved_target == resolved_entry


def _read_live_queue_path(record):
    if not record:
        return None
    if str(record.get('request_type') or '').strip() != 'transcription':
        return None
    if str(record.get('provider') or '').strip().lower() not in WHISPER_PROVIDERS:
        return None
    status = normalize_whisper_runtime_status(record.get('status') or '')
    if status not in {WHISPER_STATUS_QUEUED, WHISPER_STATUS_PROCESSING}:
        return None
    details = record.get('details') if isinstance(record.get('details'), dict) else {}
    temp_file_path = str(details.get('tempFilePath') or '').strip()
    if not temp_file_path:
        return None
    path = Path(temp_file_path).resolve()
    if not path.exists():
        return None
    return path


def _classify_queue_entry(entry_path):
    request_id = entry_path.name
    record = get_request_record(request_id)
    live_queue_path = _read_live_queue_path(record)
    if live_queue_path and _entry_contains_path(entry_path, live_queue_path):
        return {
            'action': 'keep',
            'entry': str(entry_path),
            'reason': 'live-request-queue-file',
            'requestId': request_id,
            'status': normalize_whisper_runtime_status(record.get('status') or ''),
        }

    if record is None:
        return {
            'action': 'delete',
            'entry': str(entry_path),
            'reason': 'missing-request-record',
            'requestId': request_id,
            'status': '',
        }

    status = normalize_whisper_runtime_status(record.get('status') or '')
    details = record.get('details') if isinstance(record.get('details'), dict) else {}
    temp_file_path = str(details.get('tempFilePath') or '').strip()
    if status in {WHISPER_STATUS_QUEUED, WHISPER_STATUS_PROCESSING} and temp_file_path:
        reason = 'queue-reference-mismatch'
    elif status == WHISPER_STATUS_QUEUED:
        reason = 'queued-without-temp-file'
    elif status == WHISPER_STATUS_PROCESSING:
        reason = 'processing-without-temp-file'
    else:
        reason = f'completed-request-{status or "unknown"}'

    return {
        'action': 'delete',
        'entry': str(entry_path),
        'reason': reason,
        'requestId': request_id,
        'status': status,
    }


def _delete_entry(entry_path):
    if entry_path.is_dir():
        shutil.rmtree(entry_path)
    elif entry_path.exists():
        entry_path.unlink()


def cleanup_whisper_queue(apply_changes=False):
    if not QUEUE_ROOT.exists():
        return {
            'apply': apply_changes,
            'deletedCount': 0,
            'entries': [],
            'keptCount': 0,
            'queueRoot': str(QUEUE_ROOT),
        }

    actions = []
    for entry_path in sorted(QUEUE_ROOT.iterdir()):
        try:
            action = _classify_queue_entry(entry_path)
        except RequestStoreError as error:
            raise RuntimeError(f'Unable to inspect Whisper request records: {error}') from error

        if action['action'] == 'delete' and apply_changes:
            _delete_entry(entry_path)
            action['deleted'] = True
        else:
            action['deleted'] = False
        actions.append(action)

    return {
        'apply': apply_changes,
        'deletedCount': sum(1 for action in actions if action['deleted']),
        'entries': actions,
        'keptCount': sum(1 for action in actions if action['action'] == 'keep'),
        'queueRoot': str(QUEUE_ROOT),
    }


def _build_argument_parser():
    parser = argparse.ArgumentParser(description='Safely clean orphaned Whisper queue files.')
    parser.add_argument('--apply', action='store_true', help='Delete orphaned queue entries instead of only previewing them.')
    parser.add_argument('--json', action='store_true', help='Emit machine-readable JSON output.')
    return parser


def main():
    parser = _build_argument_parser()
    args = parser.parse_args()
    result = cleanup_whisper_queue(apply_changes=args.apply)
    if args.json:
        print(json.dumps(result, ensure_ascii=False))
        return

    mode = 'APPLY' if args.apply else 'DRY-RUN'
    print(f'Whisper queue cleanup mode: {mode}')
    print(f"Queue root: {result['queueRoot']}")
    for action in result['entries']:
        verb = 'DELETE' if action['action'] == 'delete' else 'KEEP'
        print(f"[{verb}] {action['requestId']} :: {action['reason']}")
    print(f"Kept: {result['keptCount']}")
    print(f"Deleted: {result['deletedCount']}")


if __name__ == '__main__':
    main()

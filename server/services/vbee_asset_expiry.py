import logging
import threading
import time

try:
    from services.vbee_asset_service import expire_vbee_segment_assets
except ImportError:
    from .vbee_asset_service import expire_vbee_segment_assets


_worker_started = False
_worker_lock = threading.Lock()


def _expiry_loop():
    while True:
        try:
            expire_vbee_segment_assets()
        except Exception as error:  # pragma: no cover - defensive background logging
            logging.getLogger(__name__).warning('Unable to expire Vbee segment assets: %s', error)
        time.sleep(300)


def start_vbee_asset_expiry_worker():
    global _worker_started
    with _worker_lock:
        if _worker_started:
            return
        thread = threading.Thread(target=_expiry_loop, name='vbee-asset-expiry', daemon=True)
        thread.start()
        _worker_started = True
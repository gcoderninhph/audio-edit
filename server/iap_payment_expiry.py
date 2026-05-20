import logging
import threading
import time

try:
    from iap_payment_store import expire_iap_payment_tickets
except ImportError:
    from .iap_payment_store import expire_iap_payment_tickets


_worker_started = False
_worker_lock = threading.Lock()


def _expiry_loop():
    while True:
        try:
            expire_iap_payment_tickets()
        except Exception as error:  # pragma: no cover - defensive background logging
            logging.getLogger(__name__).warning('Unable to expire IAP payment tickets: %s', error)
        time.sleep(60)


def start_iap_payment_expiry_worker():
    global _worker_started
    with _worker_lock:
        if _worker_started:
            return
        thread = threading.Thread(target=_expiry_loop, name='iap-payment-expiry', daemon=True)
        thread.start()
        _worker_started = True

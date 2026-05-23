import logging
import os
from logging.handlers import TimedRotatingFileHandler
from pathlib import Path

from flask.logging import default_handler


LOG_FORMAT = '%(asctime)s | %(levelname)s | %(name)s | %(message)s'
DEFAULT_LOG_BACKUP_COUNT = int(os.environ.get('BACKEND_LOG_BACKUP_COUNT', '168'))


def _resolve_log_level():
    configured_level = str(os.environ.get('BACKEND_LOG_LEVEL', 'INFO')).upper()
    return getattr(logging, configured_level, logging.INFO)


def _has_hourly_log_handler(logger, log_file_path):
    target_path = str(log_file_path)
    return any(
        isinstance(handler, TimedRotatingFileHandler)
        and getattr(handler, 'baseFilename', None) == target_path
        for handler in logger.handlers
    )


def configure_backend_logging(app):
    logs_directory = Path(__file__).resolve().parent.parent / 'logs'
    logs_directory.mkdir(parents=True, exist_ok=True)
    log_file_path = logs_directory / 'backend.log'
    log_level = _resolve_log_level()

    root_logger = logging.getLogger()
    root_logger.setLevel(log_level)
    if not _has_hourly_log_handler(root_logger, log_file_path):
        hourly_file_handler = TimedRotatingFileHandler(
            log_file_path,
            when='H',
            interval=1,
            backupCount=DEFAULT_LOG_BACKUP_COUNT,
            encoding='utf-8',
        )
        hourly_file_handler.setLevel(log_level)
        hourly_file_handler.setFormatter(logging.Formatter(LOG_FORMAT))
        root_logger.addHandler(hourly_file_handler)

    if default_handler in app.logger.handlers:
        app.logger.removeHandler(default_handler)

    app.logger.setLevel(log_level)
    app.logger.propagate = True

    werkzeug_logger = logging.getLogger('werkzeug')
    werkzeug_logger.setLevel(log_level)
    werkzeug_logger.propagate = True

    app.logger.info('Hourly backend logging enabled at %s', log_file_path)
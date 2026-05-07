from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import json
import re
import threading
import time
import uuid

from deep_translator import GoogleTranslator


LOCAL_TRANSLATION_JOB_PREFIX = 'local-translation-'
LOCAL_TRANSLATION_ROOT = Path(__file__).resolve().parent / 'uploads' / 'translation-jobs'
SRT_TIMING_PATTERN = re.compile(r'^\d{2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{2}:\d{2}:\d{2},\d{3}$')
LOCAL_TRANSLATION_JOBS = {}
LOCAL_TRANSLATION_LOCK = threading.Lock()
LOCAL_TRANSLATION_EXECUTOR = ThreadPoolExecutor(max_workers=2, thread_name_prefix='subtitle-translation')

TARGET_LANGUAGE_CODES = {
  'vietnamese': 'vi',
  'vi': 'vi',
  'english': 'en',
  'en': 'en',
  'japanese': 'ja',
  'ja': 'ja',
  'korean': 'ko',
  'ko': 'ko',
  'chinese': 'zh-CN',
  'zh': 'zh-CN',
  'zh-cn': 'zh-CN',
}


def is_local_translation_job(job_id):
  return str(job_id or '').startswith(LOCAL_TRANSLATION_JOB_PREFIX)


def normalize_target_language(target_language):
  normalized = str(target_language or '').strip()
  language_code = TARGET_LANGUAGE_CODES.get(normalized.lower())
  if language_code:
    return language_code

  if re.fullmatch(r'[a-z]{2}(?:-[A-Za-z]{2,4})?', normalized):
    return normalized

  raise ValueError(f'Unsupported target language: {target_language}')


def ensure_translation_root():
  LOCAL_TRANSLATION_ROOT.mkdir(parents=True, exist_ok=True)


def sanitize_file_name(file_name, fallback='translated.srt'):
  cleaned = re.sub(r'[^a-zA-Z0-9._-]+', '_', str(file_name or fallback)).strip('._')
  return cleaned or fallback


def get_metadata_path(job_id):
  return LOCAL_TRANSLATION_ROOT / f'{job_id}.json'


def get_output_path(job_id, output_file_name):
  return LOCAL_TRANSLATION_ROOT / f'{job_id}-{sanitize_file_name(output_file_name)}'


def persist_job(job):
  ensure_translation_root()
  metadata = {
    'job_id': job['job_id'],
    'status': job['status'],
    'error': job.get('error'),
    'target_language': job['target_language'],
    'output_file_name': job['output_file_name'],
    'output_path': job['output_path'],
    'created_at': job['created_at'],
    'updated_at': job['updated_at'],
  }
  get_metadata_path(job['job_id']).write_text(json.dumps(metadata, ensure_ascii=False), encoding='utf-8')


def load_persisted_job(job_id):
  metadata_path = get_metadata_path(job_id)
  if not metadata_path.exists():
    return None

  metadata = json.loads(metadata_path.read_text(encoding='utf-8'))
  return {
    'job_id': metadata['job_id'],
    'status': metadata.get('status', 'failed'),
    'error': metadata.get('error'),
    'target_language': metadata.get('target_language', ''),
    'output_file_name': metadata.get('output_file_name', 'translated.srt'),
    'output_path': metadata.get('output_path'),
    'created_at': metadata.get('created_at', time.time()),
    'updated_at': metadata.get('updated_at', time.time()),
  }


def update_job(job_id, **updates):
  with LOCAL_TRANSLATION_LOCK:
    job = LOCAL_TRANSLATION_JOBS.get(job_id) or load_persisted_job(job_id)
    if not job:
      return None

    job.update(updates)
    job['updated_at'] = time.time()
    LOCAL_TRANSLATION_JOBS[job_id] = job
    persist_job(job)
    return job


def get_local_translation_job(job_id):
  with LOCAL_TRANSLATION_LOCK:
    job = LOCAL_TRANSLATION_JOBS.get(job_id)
    if job:
      return dict(job)

  persisted_job = load_persisted_job(job_id)
  if persisted_job:
    with LOCAL_TRANSLATION_LOCK:
      LOCAL_TRANSLATION_JOBS[job_id] = persisted_job
    return dict(persisted_job)

  return None


def create_local_translation_job(file_bytes, original_file_name, target_language):
  ensure_translation_root()
  job_id = f'{LOCAL_TRANSLATION_JOB_PREFIX}{uuid.uuid4()}'
  output_file_name = sanitize_file_name(f'translated_{original_file_name or "subtitles.srt"}')
  job = {
    'job_id': job_id,
    'status': 'running',
    'error': None,
    'target_language': normalize_target_language(target_language),
    'output_file_name': output_file_name,
    'output_path': str(get_output_path(job_id, output_file_name)),
    'created_at': time.time(),
    'updated_at': time.time(),
  }

  with LOCAL_TRANSLATION_LOCK:
    LOCAL_TRANSLATION_JOBS[job_id] = job
    persist_job(job)

  LOCAL_TRANSLATION_EXECUTOR.submit(run_local_translation_job, job_id, bytes(file_bytes))
  return {
    'requestId': job_id,
    'outputFileName': output_file_name,
    'provider': 'local-google-translate',
  }


def parse_srt_entries(srt_text):
  entries = []
  blocks = re.split(r'\r?\n\r?\n+', srt_text.strip())

  for block in blocks:
    lines = [line.rstrip('\r') for line in block.splitlines()]
    if not lines:
      continue

    if len(lines) >= 2 and SRT_TIMING_PATTERN.match(lines[0].strip()):
      timing_line = lines[0].strip()
      text_lines = lines[1:]
    elif len(lines) >= 3 and SRT_TIMING_PATTERN.match(lines[1].strip()):
      timing_line = lines[1].strip()
      text_lines = lines[2:]
    else:
      continue

    text = '\n'.join(text_lines).strip()
    if not text:
      continue

    entries.append({
      'timing_line': timing_line,
      'text': text,
    })

  return entries


def rebuild_srt(entries):
  blocks = []
  for index, entry in enumerate(entries, start=1):
    blocks.append(f"{index}\n{entry['timing_line']}\n{entry['text']}")
  return '\n\n'.join(blocks) + '\n'


def chunk_items(items, chunk_size):
  for index in range(0, len(items), chunk_size):
    yield items[index:index + chunk_size]


def translate_text_batch(translator, texts):
  try:
    translated = translator.translate_batch(texts)
  except Exception:
    translated = [translator.translate(text) for text in texts]

  if isinstance(translated, str):
    translated = [translated]

  if len(translated) != len(texts):
    translated = [translator.translate(text) for text in texts]

  return [str(text or '').strip() for text in translated]


def run_local_translation_job(job_id, file_bytes):
  job = get_local_translation_job(job_id)
  if not job:
    return

  try:
    srt_text = file_bytes.decode('utf-8-sig')
    entries = parse_srt_entries(srt_text)
    if not entries:
      raise ValueError('Subtitle file is empty or not a valid SRT file.')

    translator = GoogleTranslator(source='auto', target=job['target_language'])
    translated_texts = []
    for batch in chunk_items([entry['text'] for entry in entries], 20):
      translated_texts.extend(translate_text_batch(translator, batch))

    translated_entries = []
    for entry, translated_text in zip(entries, translated_texts):
      translated_entries.append({
        'timing_line': entry['timing_line'],
        'text': translated_text or entry['text'],
      })

    output_text = rebuild_srt(translated_entries)
    output_path = Path(job['output_path'])
    output_path.write_text(output_text, encoding='utf-8')
    update_job(job_id, status='finished', error=None)
  except Exception as error:
    update_job(job_id, status='failed', error=str(error))


def get_local_translation_status(job_id):
  job = get_local_translation_job(job_id)
  if not job:
    return None

  payload = {
    'jobId': job['job_id'],
    'status': job['status'],
    'provider': 'local-google-translate',
  }
  if job.get('error'):
    payload['error'] = job['error']
    payload['message'] = job['error']
  return payload


def get_local_translation_download(job_id, file_name):
  job = get_local_translation_job(job_id)
  if not job:
    return None

  if sanitize_file_name(file_name) != sanitize_file_name(job['output_file_name']):
    return None

  output_path = Path(job['output_path'])
  if not output_path.exists():
    return None

  return {
    'path': output_path,
    'output_file_name': job['output_file_name'],
  }
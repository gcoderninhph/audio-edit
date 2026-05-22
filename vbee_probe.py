import sys
import os
import requests

sys.path.append(os.path.join(os.getcwd(), 'server'))

try:
    from vbee_token_store import get_vbee_config, list_active_vbee_tokens_with_capacity
except ImportError as e:
    print(f'Error importing server modules: {e}')
    sys.exit(1)

config = get_vbee_config()
tokens = list_active_vbee_tokens_with_capacity()

if not tokens:
    print('No active Vbee tokens found.')
    sys.exit(1)

token_data = tokens[0]
token_secret = token_data['token']
client_id = token_data['clientId']
api_base_url = config.get('apiBaseUrl')

masked_client_id = client_id[:3] + '*' * (len(client_id) - 6) + client_id[-3:] if len(client_id) > 6 else '***'
print(f'Configured apiBaseUrl: {api_base_url}')
print(f'Masked Client ID: {masked_client_id}')

url = 'https://vbee.vn/api/public/v1/voices'

variants = [
    ('Authorization + app-id', {'Authorization': f'Bearer {token_secret}', 'app-id': client_id}),
    ('Authorization only', {'Authorization': f'Bearer {token_secret}'}),
    ('Authorization + app_id', {'Authorization': f'Bearer {token_secret}', 'app_id': client_id}),
    ('Authorization + both app-id and app_id', {'Authorization': f'Bearer {token_secret}', 'app-id': client_id, 'app_id': client_id}),
]

for name, headers in variants:
    try:
        response = requests.get(url, headers=headers, params={'voice_ownership': 'VBEE'}, timeout=10)
        print(f'Variant: {name}')
        print(f'Status Code: {response.status_code}')
        print(f'Response: {response.text[:300]}')
        print('-' * 20)
    except Exception as e:
        print(f'Variant: {name} failed with error: {e}')

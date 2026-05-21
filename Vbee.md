# Vbee TTS API

Source: https://documenter.getpostman.com/view/12951168/Uz5FHbSd#23ff2526-76bf-49c8-bd84-94152d3e9af3

Vbee TTS API is an HTTPS API for sending text-to-speech requests and receiving JSON responses for request status, generated audio, callback delivery, and available voices.

## Base Information

- Base API host: `https://vbee.vn`
- Main TTS base path: `/api/v1/tts`
- Public voices path: `/api/public/v1/voices`
- Content type: `application/json`
- Response type: `text/json`
- Authentication: Bearer token generated for the Vbee app.

Common authorization header:

```http
Authorization: Bearer <token>
```

Some public voice requests also require the app id header:

```http
app-id: <app_id>
```

## Endpoints

| Name | Method | URL | Purpose |
| --- | --- | --- | --- |
| List voices | `GET` | `https://vbee.vn/api/public/v1/voices` | Get available Vbee voices. |
| Text to speech | `POST` | `https://vbee.vn/api/v1/tts` | Create a text-to-speech synthesis request. |
| Get Request | `GET` | `https://vbee.vn/api/v1/tts/{request_id}` | Get processing status and audio link for a request. |
| Get Callback Result | `GET` | `https://vbee.vn/api/v1/tts/{request_id}/callback-result` | Get callback delivery result for a callback request. |

## List Voices

Gets the list of voices provided by Vbee API.

```http
GET https://vbee.vn/api/public/v1/voices
Authorization: Bearer <token>
app-id: <app_id>
```

Response fields:

| Field | Description |
| --- | --- |
| `status` | API status. `1` means success, `0` means failure. |
| `result.pagination.has_next_page` | Whether another page exists. |
| `result.pagination.has_prev_page` | Whether a previous page exists. |
| `result.pagination.next_cursor` | Cursor for the next page. |
| `result.pagination.prev_cursor` | Cursor for the previous page; can be null. |
| `result.voices[].code` | Voice code used in synthesis requests. |
| `result.voices[].name` | Display name of the voice. |
| `result.voices[].gender` | Voice gender. |
| `result.voices[].language_code` | Language code of the voice. |
| `result.voices[].demo` | Demo audio URL. |
| `result.voices[].credit_factor` | Credit consumption factor per character. |

Example response:

```json
{
  "result": {
    "pagination": {
      "has_next_page": true,
      "has_prev_page": false,
      "next_cursor": "WyI2NmE4OTJiNmFhNTBlYmJhMGRjMmQyMmMiXQ==",
      "prev_cursor": null
    },
    "voices": [
      {
        "code": "hn_female_ngochuyen_full_48k-fhg",
        "credit_factor": 1,
        "demo": "https://vbee.s3.ap-southeast-1.amazonaws.com/audios/demo/vbee/hn_female_ngochuyen_fast_news_48k-thg.mp3",
        "gender": "female",
        "language_code": "vi-VN",
        "name": "HN - Ngoc Huyen"
      }
    ]
  },
  "status": 1
}
```

## Text To Speech

Creates a TTS request. For callback mode, Vbee sends the finished synthesis result to the submitted callback URL.

```http
POST https://vbee.vn/api/v1/tts
Authorization: Bearer <token>
Content-Type: application/json
```

Request body:

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `app_id` | String | Required | Application id generated when the app is created. |
| `response_type` | String | Yes | Use `indirect`. |
| `callback_url` | String | Required | Webhook that receives the synthesis result. |
| `input_text` | String | Optional; required when `sentences` is not provided | Input text to synthesize. |
| `voice_code` | String | Optional; required when `input_text` is provided | Voice code to use. |
| `audio_type` | String | Optional | Output audio type. Default is `mp3`. Allowed values: `mp3`, `wav`. |
| `bitrate` | Number | Optional | Output bit rate for MP3. Default is `128`. Allowed values: `8`, `16`, `32`, `64`, `128`. Only applies when `audio_type` is `mp3`. |
| `speed_rate` | Number | Optional | Voice speed. Default is `1.0`. Allowed range is `0.1` to `1.9`, with one decimal digit. |
| `sample_rate` | Number | Optional | Desired sample rate. Supported values depend on the selected voice. |
| `emphasis_intensity` | Number | Optional | Emphasis intensity from `0` to `100`, in steps of `10`. Only applies to voices that support emphasis and return `has_emphasis` in the voices API. |

Example request:

```json
{
  "app_id": "{{app_id}}",
  "response_type": "indirect",
  "callback_url": "https://mydomain/callback",
  "input_text": "Xin chao mung den voi website cua chung toi!",
  "voice_code": "hn_female_ngochuyen_full_48k-fhg",
  "audio_type": "mp3",
  "bitrate": 128,
  "speed_rate": "1.0"
}
```

Example response:

```json
{
  "result": {
    "app_id": "55e0053d-f86f-4c2b-b791-b1ba6d59a868",
    "audio_type": "mp3",
    "bitrate": 128,
    "characters": 297,
    "request_id": "5509d1e6-8906-4291-899b-c25643a624af",
    "speed_rate": "1.0",
    "status": "IN_PROGRESS",
    "voice_code": "hn_female_ngochuyen_full_48k-fhg"
  },
  "status": 1
}
```

Response fields:

| Field | Description |
| --- | --- |
| `status` | API status. `1` means success, `0` means failure. |
| `error_code` | Error code when the request fails. |
| `error_message` | Error details when the request fails. |
| `result.app_id` | Application id. |
| `result.request_id` | Request id used for status polling. |
| `result.characters` | Number of converted characters. |
| `result.voice_code` | Voice code used for synthesis. |
| `result.audio_type` | Output audio type. |
| `result.speed_rate` | Voice speed. |
| `result.sample_rate` | Output sample rate, when returned. |
| `result.bitrate` | Output bit rate. |
| `result.created_at` | Request creation time, when returned. |
| `result.status` | Request status, usually `IN_PROGRESS` immediately after creation. |

Important audio lifetime note: returned audio links are valid for 3 minutes. Audio files remain stored for 3 days after successful synthesis. Call Get Request to obtain a new audio link when the original link expires.

## Callback API

When a request completes successfully, Vbee TTS sends an HTTP POST to the callback URL provided in the TTS request.

Callback request:

```http
POST <callback_url>
Content-Type: application/json
```

Callback body fields:

| Field | Type | Description |
| --- | --- | --- |
| `app_id` | String | Application id. |
| `request_id` | String | Request id. |
| `characters` | Number | Number of characters in the text. |
| `voice_code` | String | Voice code. |
| `audio_type` | String | Output audio type. |
| `speed_rate` | Number | Voice speed. |
| `sample_rate` | String | Output sample rate. |
| `bitrate` | Number | Output bit rate. |
| `created_at` | String | Request creation time. |
| `status` | String | Request result. `SUCCESS` means success, `FAILURE` means failure. |
| `audio_link` | String | URL to download the synthesized audio file. |

## Get Request

Gets request information by request id.

```http
GET https://vbee.vn/api/v1/tts/{request_id}
Authorization: Bearer <token>
Content-Type: application/json
```

Response fields:

| Field | Description |
| --- | --- |
| `status` | API status. `1` means success, `0` means failure. |
| `error_code` | Error code when the request fails. |
| `error_message` | Error details when the request fails. |
| `result.app_id` | Application id. |
| `result.request_id` | Request id. |
| `result.characters` | Number of converted characters. |
| `result.voice_code` | Voice code. |
| `result.audio_type` | Output audio type. |
| `result.speed_rate` | Voice speed. |
| `result.bitrate` | Output bit rate. |
| `result.created_at` | Request creation time, when returned. |
| `result.progress` | Request processing percentage, when returned. |
| `result.status` | Request status. |
| `result.audio_link` | Synthesized audio download URL. |
| `result.audio_expired` | `true` when the audio link has expired. |

Example response:

```json
{
  "result": {
    "app_id": "b5cdad60-6637-4061-98e4-aa9a3ba80932",
    "audio_link": "https://dev-vbee-studio-7.s3.ap-southeast-1.amazonaws.com/synthesis/2022/06/20/f07c269c-a89c-44af-afac-b38fb689ed8d.wav",
    "audio_type": "wav",
    "bitrate": 128,
    "characters": 4874,
    "request_id": "9bc63cb3-7c80-4e61-8cda-7c7391a21bbe",
    "speed_rate": 1,
    "status": "SUCCESS",
    "voice_code": "hn_female_maiphuong_vdts_48k-fhg"
  },
  "status": 1
}
```

Example response when the audio link is expired:

```json
{
  "result": {
    "app_id": "b5cdad60-6637-4061-98e4-aa9a3ba80932",
    "audio_expired": true,
    "audio_type": "wav",
    "bitrate": 128,
    "characters": 4874,
    "request_id": "9bc63cb3-7c80-4e61-8cda-7c7391a21bbe",
    "speed_rate": 1,
    "status": "SUCCESS",
    "voice_code": "hn_female_maiphuong_vdts_48k-fhg"
  },
  "status": 1
}
```

## Get Callback Result

Gets callback delivery information for a callback request.

```http
GET https://vbee.vn/api/v1/tts/{request_id}/callback-result
Authorization: Bearer <token>
Content-Type: application/json
```

Response fields:

| Field | Description |
| --- | --- |
| `status` | API status. `1` means success, `0` means failure. |
| `error_code` | Error code when the request fails. |
| `error_message` | Error details when the request fails. |
| `result.request_id` | Request id. |
| `result.callback_url` | Webhook used to receive the request result. |
| `result.created_at` | Callback execution time. |
| `result.payload` | Payload sent to the callback URL. |
| `result.status_code` | HTTP status code returned by the callback URL. |
| `result.result` | Result returned by the callback URL. |

Example response:

```json
{
  "result": {
    "callback_url": "https://edfe-42-117-19-3.ngrok.io/callback",
    "created_at": "2022-08-12T07:18:54.479Z",
    "payload": {
      "app_id": "abc2baa6-b848-4014-8584-03812870fc28",
      "audio_link": "https://vbee-studio-30.s3.ap-southeast-1.amazonaws.com/synthesis/2022/08/12/fe90184f-7c7f-4803-9f81-5d70afd72e83.wav",
      "audio_type": "wav",
      "bitrate": 128,
      "characters": 16,
      "created_at": "2022-08-12T07:18:51.890Z",
      "request_id": "4fbe1c92-527a-4a31-841e-8f1e6e8d040b",
      "sample_rate": "44100",
      "speed_rate": 1,
      "status": "SUCCESS",
      "voice_code": "hn_female_ngochuyen_full_48k-fhg"
    },
    "request_id": "4fbe1c92-527a-4a31-841e-8f1e6e8d040b",
    "result": "OK",
    "status_code": "200"
  },
  "status": 1
}
```

## Language Codes

The public documentation lists these language codes for voices.

| Code | Name |
| --- | --- |
| `el-GR` | Hy Lap |
| `kn-IN` | An Do (Kannada) |
| `pa-IN` | An Do (Punjabi) |
| `ro-RO` | Ro Man |
| `en-ZA` | Tieng Anh Nam Phi |
| `es-US` | Tay Ban Nha (My) |
| `nl-NL` | Ha Lan |
| `en-NZ` | Tieng Anh New Zealand |
| `gu-IN` | An Do (Gujarati) |
| `ar-XA` | A Rap Xe Ut |
| `en-GB` | Tieng Anh (Anh) |
| `it-IT` | Y |
| `de-DE` | Duc |
| `fr-FR` | Phap |
| `cmn-CN` | Trung Quoc (Phon the) |
| `pt-BR` | Bo Dao Nha (Brazil) |
| `fr-CA` | Phap (Canada) |
| `en-AU` | Tieng Anh (Uc) |
| `fil-PH` | Philippines |
| `ru-RU` | Nga |
| `sr-RS` | Cong hoa Serbia |
| `tr-TR` | Tho Nhi Ky |
| `nl-BE` | Ha Lan (Bi) |
| `ko-KR` | Han Quoc |
| `bn-IN` | Tay Bengal |
| `sv-SE` | Thuy Dien |
| `yue-HK` | Hong Kong |
| `cs-CZ` | Cong hoa Sec |
| `pt-PT` | Bo Dao Nha |
| `lv-LV` | Cong hoa Latvia |
| `ca-ES` | Tay Ban Nha (Catalan) |
| `ja-JP` | Nhat Ban |
| `ms-MY` | Malaysia |
| `pl-PL` | Ba Lan |
| `af-ZA` | Cong hoa Nam Phi |
| `en-IN` | Tieng Anh (An) |
| `nb-NO` | Na-Uy |
| `bg-BG` | Cong hoa Bulgaria |
| `te-IN` | An Do (Telugu) |
| `sk-SK` | Cong hoa Slovakia |
| `da-DK` | Dan Mach |
| `vi-VN` | Viet Nam |
| `en-US` | Tieng Anh (My) |
| `fi-FI` | Phan Lan |
| `ml-IN` | An Do (Malayalam) |
| `is-IS` | Iceland |
| `hu-HU` | Hungary |
| `id-ID` | Indonesia |
| `ta-IN` | An Do (Tamil) |
| `es-ES` | Tay Ban Nha |
| `hi-IN` | An Do (Hindi) |
| `th-TH` | Thai Lan |
| `uk-UA` | Ukraina |
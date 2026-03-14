"""
Smallest AI voice: TTS (Lightning v3.1 SSE) and STT (Pulse) proxy.
API key from env SMALLEST_API_KEY.
Docs: Lightning TTS (SSE) and Pulse STT WebSocket.
"""
import base64
import io
import json
import os
import wave
from typing import Optional

import httpx

SMALLEST_BASE = "https://api.smallest.ai"
# Lightning v3.1 SSE streaming — returns chunks as server-sent events
LIGHTNING_SSE_PATH = "/waves/v1/lightning-v3.1/stream"
# Sync fallback when stream returns no chunks
LIGHTNING_GET_SPEECH_PATH = "/waves/v1/lightning-v3.1/get_speech"
PULSE_WS_BASE = "wss://api.smallest.ai/waves/v1/pulse/get_text"


def get_smallest_key() -> str:
    key = os.getenv("SMALLEST_API_KEY", "").strip()
    if not key:
        raise RuntimeError("SMALLEST_API_KEY is not set.")
    return key


def tts_synthesize(text: str, voice_id: str = "magnus", sample_rate: int = 24000) -> bytes:
    """
    Return WAV bytes from Smallest Lightning v3.1 TTS via SSE streaming.
    POST .../stream with Accept: text/event-stream; parse SSE chunks and build WAV.
    """
    key = get_smallest_key()
    url = f"{SMALLEST_BASE}{LIGHTNING_SSE_PATH}"
    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
    }
    payload = {
        "text": text[:5000],
        "voice_id": voice_id,
        "sample_rate": sample_rate,
    }
    audio_chunks = []
    with httpx.Client(timeout=60.0) as client:
        with client.stream("POST", url, json=payload, headers=headers) as resp:
            if resp.status_code >= 400:
                try:
                    body = resp.read().decode("utf-8", errors="replace")[:500]
                except Exception:
                    body = ""
                raise RuntimeError(
                    f"Smallest TTS returned {resp.status_code}: {body or resp.reason_phrase}"
                )
            for line in resp.iter_lines():
                if not line or not line.strip():
                    continue
                line = line.strip()
                if not line.startswith("data: "):
                    continue
                try:
                    data = json.loads(line[6:].strip())
                except json.JSONDecodeError:
                    continue
                # API sends event: audio + data: {"audio": "base64..."} (no "status" in JSON)
                status = data.get("status") or data.get("event")
                b64 = (data.get("data") or {}).get("audio") or (data.get("audio") if isinstance(data.get("audio"), str) else None)
                if b64:
                    try:
                        # Standard base64; add padding if needed
                        pad = 4 - (len(b64) % 4)
                        if pad != 4:
                            b64 += "=" * pad
                        audio_chunks.append(base64.b64decode(b64))
                    except Exception:
                        try:
                            audio_chunks.append(base64.urlsafe_b64decode(b64 + "=="))
                        except Exception:
                            pass
                if status == "complete" or status == "done":
                    break
                if data.get("error") or data.get("message"):
                    msg = data.get("message") or data.get("error") or str(data)
                    raise RuntimeError(f"TTS stream error: {msg}")
    if not audio_chunks:
        # Fallback: sync get_speech returns full audio (WAV or PCM)
        try:
            sync_url = f"{SMALLEST_BASE}{LIGHTNING_GET_SPEECH_PATH}"
            with httpx.Client(timeout=30.0) as client:
                r = client.post(
                    sync_url,
                    headers={
                        "Authorization": f"Bearer {key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "text": text[:5000],
                        "voice_id": voice_id,
                        "sample_rate": sample_rate,
                    },
                )
                r.raise_for_status()
                body = r.content
                if body.startswith(b"RIFF"):
                    return body
                # Raw PCM: wrap in WAV
                if len(body) % 2:
                    body = body[: len(body) - 1]
                buf = io.BytesIO()
                with wave.open(buf, "wb") as wf:
                    wf.setnchannels(1)
                    wf.setsampwidth(2)
                    wf.setframerate(sample_rate)
                    wf.writeframes(body)
                return buf.getvalue()
        except Exception as sync_err:
            raise RuntimeError(
                f"TTS stream returned no audio chunks and sync fallback failed: {sync_err}"
            )
    raw = b"".join(audio_chunks)
    if not raw:
        raise RuntimeError("TTS returned no audio data.")
    # PCM int16: frame size 2 bytes; ensure even length
    if len(raw) % 2:
        raw = raw[: len(raw) - 1]
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(raw)
    return buf.getvalue()

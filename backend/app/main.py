from typing import List, Optional
import asyncio
import io
import json
import logging
import os
from datetime import datetime, timezone
from urllib.parse import urlencode, urlparse

import httpx
import websockets
from websockets.exceptions import InvalidStatus
from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel
from PIL import Image, UnidentifiedImageError

from .threat_agent import analyze_image, analyze_image_sequence, analyze_text, get_model_name
from . import voice_smallest
from . import scrapegraph

logger = logging.getLogger(__name__)

app = FastAPI(title="Threat Analyzer Backend", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class LogEvent(BaseModel):
    role: str  # "user" | "bot" | "system"
    text: str
    source: str = "external"
    meta: Optional[str] = None
    created_at: Optional[str] = None
    client_id: Optional[str] = None


EVENT_LOG: List[dict] = []
MAX_EVENTS = 200


def add_event(event: LogEvent) -> None:
    payload = event.dict()
    if not payload.get("created_at"):
        payload["created_at"] = datetime.now(timezone.utc).isoformat()
    EVENT_LOG.append(payload)
    if len(EVENT_LOG) > MAX_EVENTS:
        # keep the most recent events
        del EVENT_LOG[0 : len(EVENT_LOG) - MAX_EVENTS]


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "service": "threat-analyzer-backend"}


@app.get("/api/history")
def get_history() -> dict:
    """
    Return a simple list of recent threat analysis events so the frontend
    can display externally-triggered analyses in the UI.
    """
    return {"events": EVENT_LOG}


@app.post("/api/log-event")
def log_event(event: LogEvent) -> dict:
    """
    Generic entry point if an external system wants to push a message into
    the UI history directly.
    """
    add_event(event)
    return {"status": "ok"}


class TextAnalysisRequest(BaseModel):
    text: str


# --- Tools (Frontier Tower SF evidence gathering) ---

TOOLS_LIST = [
    {
        "id": "analyze-image",
        "name": "Analyze Image",
        "description": "Analyze uploaded images for physical threats and hazards. Use the chat panel to attach images and run analysis.",
        "type": "chat",
        "endpoint": "/api/analyze-image",
    },
    {
        "id": "smart-search",
        "name": "Smart Search",
        "description": "AI-powered web search for evidence (evacuation routes, building info, emergency contacts for Frontier Tower SF).",
        "type": "search",
        "endpoint": "/api/tools/smart-search",
    },
    {
        "id": "sitemap",
        "name": "Sitemap",
        "description": "Extract all URLs from a website sitemap. Use with Smart Search results to map reference URLs.",
        "type": "sitemap",
        "endpoint": "/api/tools/sitemap",
    },
    {
        "id": "evacuation-search",
        "name": "Evacuation Search",
        "description": "Search for evacuation routes, assembly points, and emergency procedures (Frontier Tower / San Francisco).",
        "type": "search",
        "endpoint": "/api/tools/smart-search",
        "preset_query": "Frontier Tower San Francisco evacuation routes assembly points emergency procedures",
    },
]


class SmartSearchRequest(BaseModel):
    query: str
    time_range: Optional[str] = "past_week"  # past_hour, past_24_hours, past_week, past_month, past_year


class SitemapRequest(BaseModel):
    website_url: str


def _origin_from_url(url: str) -> Optional[str]:
    """Return scheme + netloc for sitemap (e.g. https://example.com)."""
    try:
        parsed = urlparse(url.strip())
        if parsed.scheme and parsed.netloc:
            return f"{parsed.scheme}://{parsed.netloc}"
    except Exception:
        pass
    return None


def _run_sitemaps_for_reference_urls_sync(
    reference_urls: List[str],
    max_origins: int = 3,
) -> List[dict]:
    """
    Run ScrapeGraph Sitemap for each unique origin derived from reference_urls.
    Returns list of { website_url, urls, status, error? }.
    """
    if not scrapegraph.is_configured() or not reference_urls:
        return []
    seen: set = set()
    origins: List[str] = []
    for u in reference_urls:
        if not u or not isinstance(u, str):
            continue
        origin = _origin_from_url(u)
        if origin and origin not in seen:
            seen.add(origin)
            origins.append(origin)
            if len(origins) >= max_origins:
                break
    sitemaps: List[dict] = []
    for origin in origins:
        try:
            r = scrapegraph.sitemap_run(origin)
            sitemaps.append({
                "website_url": origin,
                "urls": r.get("urls") or [],
                "status": r.get("status"),
                "error": r.get("error") or "",
            })
        except httpx.HTTPStatusError as e:
            err = str(e)
            if e.response.status_code in (401, 403):
                err = "ScrapeGraph API access denied. Check SCRAPEGRAPH_API_KEY and credits at dashboard.scrapegraphai.com."
            sitemaps.append({
                "website_url": origin,
                "urls": [],
                "status": "failed",
                "error": err,
            })
        except Exception as e:
            sitemaps.append({
                "website_url": origin,
                "urls": [],
                "status": "failed",
                "error": str(e),
            })
    return sitemaps


def _fetch_evidence_tools_sync(context: Optional[str] = None) -> dict:
    """
    Run ScrapeGraph for Frontier Tower SF evidence.
    - Hackathon API (sgai-api-v2): uses /scrape + /extract on fixed URLs (no SearchScraper/Sitemap).
    - Official API: SearchScraper + Sitemap on reference URLs.
    """
    if not scrapegraph.is_configured():
        return {}
    if scrapegraph._is_hackathon_api():
        return scrapegraph.evidence_run_hackathon(context)
    out: dict = {"smart_searches": [], "sitemaps": []}
    queries = [
        "Frontier Tower San Francisco evacuation routes assembly points emergency procedures",
        "Frontier Tower San Francisco building emergency contacts safety information",
    ]
    if context and context.strip():
        extra = context.strip()[:100].replace("\n", " ")
        queries.insert(0, f"Frontier Tower San Francisco {extra}")
    all_refs: List[str] = []
    access_denied_msg = (
        "ScrapeGraph API access denied (403/401). "
        "Check SCRAPEGRAPH_API_KEY in .env: use a valid key from dashboard.scrapegraphai.com and ensure you have credits. "
        "To hide this and skip evidence, set SCRAPEGRAPH_DISABLED=true in .env."
    )
    for q in queries[:3]:
        try:
            r = scrapegraph.search_scraper_run(q, time_range="past_month")
            refs = r.get("reference_urls") or []
            all_refs.extend(refs)
            out["smart_searches"].append({
                "query": q,
                "result": r.get("result"),
                "reference_urls": refs,
                "status": r.get("status"),
            })
        except httpx.HTTPStatusError as e:
            if e.response.status_code in (401, 403):
                out["smart_searches"].append({"query": q, "error": access_denied_msg})
                break
            out["smart_searches"].append({"query": q, "error": str(e)})
        except Exception as e:
            out["smart_searches"].append({"query": q, "error": str(e)})
    if all_refs:
        out["sitemaps"] = _run_sitemaps_for_reference_urls_sync(all_refs, max_origins=3)
    return out


class TTSRequest(BaseModel):
    text: str
    voice_id: Optional[str] = "magnus"
    sample_rate: Optional[int] = 24000


@app.post("/api/tts")
def tts_endpoint(payload: TTSRequest) -> Response:
    """Text-to-speech via Smallest Lightning v3.1 SSE. Returns WAV audio."""
    if not payload.text.strip():
        raise HTTPException(status_code=400, detail="Text is required.")
    try:
        wav_bytes = voice_smallest.tts_synthesize(
            payload.text.strip(),
            voice_id=payload.voice_id or "magnus",
            sample_rate=payload.sample_rate or 24000,
        )
    except RuntimeError as e:
        print(f"[TTS] Error: {e}", flush=True)
        logger.warning("TTS RuntimeError: %s", e)
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        print(f"[TTS] Error: {e}", flush=True)
        logger.exception("TTS failed: %s", e)
        raise HTTPException(status_code=500, detail=f"TTS error: {e}")
    return Response(content=wav_bytes, media_type="audio/wav")


@app.websocket("/api/voice/stt")
async def voice_stt_websocket(ws: WebSocket) -> None:
    """
    Proxy to Smallest Pulse STT. Client sends binary audio (linear16 16kHz)
    and when done sends JSON {"type": "finalize"}. Server forwards to Pulse
    and returns transcription JSON (transcript, is_final, is_last, language).
    """
    await ws.accept()
    print("[STT] WebSocket accepted, connecting to Smallest Pulse...", flush=True)
    logger.info("STT WebSocket accepted, connecting to Smallest Pulse...")
    key = os.getenv("SMALLEST_API_KEY", "").strip()
    if not key:
        print("[STT] SMALLEST_API_KEY not set", flush=True)
        logger.warning("STT: SMALLEST_API_KEY not set")
        await ws.send_json({"error": "SMALLEST_API_KEY not set"})
        await ws.close()
        return
    # Match Smallest docs: encoding, sample_rate, language, word_timestamps
    pulse_params = {
        "encoding": "linear16",
        "sample_rate": "16000",
        "language": "en",
        "word_timestamps": "false",
    }
    pulse_url = "wss://api.smallest.ai/waves/v1/pulse/get_text?" + urlencode(pulse_params)
    try:
        async with websockets.connect(
            pulse_url,
            additional_headers={"Authorization": f"Bearer {key}"},
        ) as small_ws:
            print("[STT] Connected to Smallest Pulse, relaying audio...", flush=True)
            logger.info("STT: connected to Smallest Pulse, relaying...")

            async def from_client() -> None:
                try:
                    while True:
                        msg = await ws.receive()
                        if msg.get("type") == "websocket.disconnect":
                            break
                        if "bytes" in msg and msg["bytes"]:
                            await small_ws.send(msg["bytes"])
                        elif "text" in msg and msg["text"]:
                            raw = msg["text"]
                            try:
                                obj = json.loads(raw)
                                if obj.get("type") == "finalize":
                                    await small_ws.send(json.dumps({"type": "finalize"}))
                            except json.JSONDecodeError:
                                pass
                except WebSocketDisconnect:
                    pass
                except Exception as e:
                    logger.exception("STT from_client: %s", e)

            async def from_smallest() -> None:
                try:
                    async for msg in small_ws:
                        try:
                            if isinstance(msg, str):
                                await ws.send_text(msg)
                            else:
                                await ws.send_bytes(msg)
                        except RuntimeError:
                            # Client already closed; stop forwarding
                            break
                        except Exception:
                            break
                except Exception as e:
                    logger.exception("STT from_smallest: %s", e)

            await asyncio.gather(from_client(), from_smallest())
    except InvalidStatus as e:
        status = getattr(e.response, "status_code", 0) if e.response else 0
        print(f"[STT] Smallest rejected connection: HTTP {status}", flush=True)
        logger.warning("STT Smallest InvalidStatus: %s", e)
        msg = f"Smallest API returned HTTP {status}. "
        if status == 401:
            msg += "Check SMALLEST_API_KEY in .env and API key at app.smallest.ai."
        elif status == 500:
            msg += "Smallest server error. Try again later or contact support@smallest.ai."
        else:
            msg += str(e)
        try:
            await ws.send_json({"error": msg})
        except Exception:
            pass
    except Exception as e:
        print(f"[STT] Smallest connection failed: {e}", flush=True)
        logger.exception("STT Smallest connection failed: %s", e)
        try:
            await ws.send_json({"error": str(e)})
        except Exception:
            pass
    finally:
        print("[STT] Connection closing.", flush=True)
        try:
            await ws.close()
        except Exception:
            pass


@app.post("/api/analyze-image")
async def analyze_image_endpoint(
    image: List[UploadFile] = File(..., description="One or more frames from a video"),
    notes: Optional[str] = Form(None),
    client_id: Optional[str] = Header(None, alias="X-Client-Id"),
) -> dict:
    """
    Analyze one or more images.

    - If a single image is provided, returns a per-frame threat assessment.
    - If multiple images are provided, they are treated as a sequence of frames
      from a video and analyzed as an evolving scenario.
    """
    if not image:
        raise HTTPException(status_code=400, detail="At least one image must be provided.")

    for img in image:
        if not img.content_type or not img.content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail="All uploaded files must be images.")

    raw_bytes_list: List[bytes] = []
    mime_types: List[str] = []

    # To avoid 413 errors from the upstream model, downscale and recompress
    # each image to a reasonable resolution and JPEG quality.
    MAX_SIZE = 1024  # max width/height in pixels
    JPEG_QUALITY = 85

    for img in image:
        try:
            raw_bytes = await img.read()
            pil_image = Image.open(io.BytesIO(raw_bytes))
            pil_image.verify()  # type: ignore[arg-type]

            # Re-open after verify (it can close the file)
            pil_image = Image.open(io.BytesIO(raw_bytes)).convert("RGB")
            pil_image.thumbnail((MAX_SIZE, MAX_SIZE))

            buffer = io.BytesIO()
            pil_image.save(buffer, format="JPEG", quality=JPEG_QUALITY, optimize=True)
            compressed_bytes = buffer.getvalue()

            raw_bytes_list.append(compressed_bytes)
            mime_types.append("image/jpeg")
        except (UnidentifiedImageError, OSError):
            raise HTTPException(status_code=400, detail="Invalid image file in sequence.")
        except Exception:
            # If validation fails for another reason, fall back to original bytes.
            fallback_bytes = await img.read()
            raw_bytes_list.append(fallback_bytes)
            mime_types.append(img.content_type or "image/jpeg")

    # Log a synthetic "user" event so externally triggered calls appear in UI history.
    summary_text = notes or "Frames submitted for threat analysis."
    add_event(
        LogEvent(
            role="user",
            text=summary_text,
            source="api/analyze-image",
            meta=f"frames={len(image)}",
            client_id=client_id,
        )
    )

    try:
        if len(raw_bytes_list) == 1:
            analysis = analyze_image(raw_bytes_list[0], mime_types[0], notes)
        else:
            analysis = analyze_image_sequence(raw_bytes_list, mime_types, notes)
    except RuntimeError as e:
        # Configuration / env problems (e.g. missing API key)
        raise HTTPException(status_code=500, detail=f"Threat analyzer configuration error: {e}")
    except Exception as e:
        # Surface the real model error so we can debug Featherless issues.
        raise HTTPException(
            status_code=500,
            detail=f"Threat model error: {e}",
        )

    # Log the model's response as a "bot" event.
    add_event(
        LogEvent(
            role="bot",
            text=analysis,
            source="api/analyze-image",
            meta=f"model={get_model_name()},frames={len(raw_bytes_list)}",
            client_id=client_id,
        )
    )

    # Run ScrapeGraph evidence tools alongside (evacuation, Frontier Tower details)
    tool_results: dict = {}
    try:
        context = (notes or "")[:200] if notes else ""
        tool_results = await asyncio.to_thread(_fetch_evidence_tools_sync, context)
    except Exception:
        tool_results = {}

    return {
        "analysis": analysis,
        "model": get_model_name(),
        "frames": len(raw_bytes_list),
        "tool_results": tool_results if tool_results else None,
    }


@app.post("/api/analyze-text")
async def analyze_text_endpoint(
    payload: TextAnalysisRequest,
    client_id: Optional[str] = Header(None, alias="X-Client-Id"),
) -> dict:
    """
    Analyze a purely textual description of a threat or scene.
    Useful for robots or operators that only have text, not images.
    """
    if not payload.text.strip():
        raise HTTPException(status_code=400, detail="Text description is required.")

    # Log the incoming user description.
    add_event(
        LogEvent(
            role="user",
            text=payload.text,
            source="api/analyze-text",
            client_id=client_id,
        )
    )

    try:
        analysis = await asyncio.to_thread(analyze_text, payload.text)
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=f"Threat analyzer configuration error: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Threat model error: {e}")

    # Log the model response.
    add_event(
        LogEvent(
            role="bot",
            text=analysis,
            source="api/analyze-text",
            meta=f"model={get_model_name()}",
            client_id=client_id,
        )
    )

    # Run ScrapeGraph evidence tools alongside (evacuation, Frontier Tower details)
    tool_results: dict = {}
    try:
        context = payload.text.strip()[:200]
        tool_results = await asyncio.to_thread(_fetch_evidence_tools_sync, context)
    except Exception:
        tool_results = {}

    return {
        "analysis": analysis,
        "model": get_model_name(),
        "tool_results": tool_results if tool_results else None,
    }


@app.get("/api/tools")
def get_tools() -> dict:
    """
    List available evidence-gathering tools for Frontier Tower SF.
    Tools include: Analyze Image, Smart Search, Sitemap, Evacuation Search.
    """
    return {"tools": TOOLS_LIST, "context": "Frontier Tower, San Francisco"}


@app.post("/api/tools/smart-search")
def smart_search_endpoint(
    payload: SmartSearchRequest,
    client_id: Optional[str] = Header(None, alias="X-Client-Id"),
) -> dict:
    """
    Run ScrapeGraph for evidence gathering. Hackathon API: extract from fixed URLs. Official: SearchScraper.
    """
    if not scrapegraph.is_configured():
        raise HTTPException(
            status_code=503,
            detail="ScrapeGraphAI is not configured. Set SCRAPEGRAPH_API_KEY or SGAI_API_KEY.",
        )
    query = payload.query.strip()
    if not query:
        raise HTTPException(status_code=400, detail="query is required.")

    if scrapegraph._is_hackathon_api():
        try:
            out = scrapegraph.evidence_run_hackathon(query)
            searches = out.get("smart_searches") or []
            if not searches:
                return {
                    "request_id": "",
                    "status": "completed",
                    "user_prompt": query,
                    "result": None,
                    "reference_urls": [],
                    "error": "No evidence results.",
                    "sitemaps": [],
                }
            first = searches[0]
            refs = first.get("reference_urls") or []
            return {
                "request_id": first.get("id", ""),
                "status": "completed",
                "user_prompt": query,
                "result": first.get("result"),
                "reference_urls": refs,
                "error": first.get("error", ""),
                "sitemaps": [],
            }
        except httpx.HTTPStatusError as e:
            detail = e.response.text or str(e)
            if e.response.status_code in (401, 403):
                detail = "ScrapeGraph API access denied. Check API key and redeem HACK2026 credits."
            raise HTTPException(status_code=e.response.status_code, detail=detail)
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    try:
        result = scrapegraph.search_scraper_run(
            query,
            time_range=payload.time_range,
        )
    except httpx.HTTPStatusError as e:
        detail = e.response.text or str(e)
        if e.response.status_code in (401, 403):
            detail = (
                "ScrapeGraph API access denied (403/401). "
                "Check SCRAPEGRAPH_API_KEY in .env: use a valid key from dashboard.scrapegraphai.com and ensure you have credits."
            )
        raise HTTPException(status_code=e.response.status_code, detail=detail)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    refs = result.get("reference_urls") or []
    sitemaps: List[dict] = []
    try:
        sitemaps = _run_sitemaps_for_reference_urls_sync(refs, max_origins=3)
    except Exception:
        pass

    return {
        "request_id": result.get("request_id"),
        "status": result.get("status"),
        "user_prompt": result.get("user_prompt"),
        "result": result.get("result"),
        "reference_urls": refs,
        "error": result.get("error", ""),
        "sitemaps": sitemaps,
    }


@app.post("/api/tools/sitemap")
def sitemap_endpoint(
    payload: SitemapRequest,
    client_id: Optional[str] = Header(None, alias="X-Client-Id"),
) -> dict:
    """
    Extract all URLs from a website sitemap (ScrapeGraphAI). Not available on hackathon API.
    """
    if not scrapegraph.is_configured():
        raise HTTPException(
            status_code=503,
            detail="ScrapeGraphAI is not configured. Set SCRAPEGRAPH_API_KEY or SGAI_API_KEY.",
        )
    if scrapegraph._is_hackathon_api():
        raise HTTPException(
            status_code=501,
            detail="Sitemap is not available on the hackathon API (sgai-api-v2). Use the official ScrapeGraph API for sitemap.",
        )
    url = payload.website_url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="website_url is required.")
    if not url.startswith("http://") and not url.startswith("https://"):
        url = "https://" + url

    try:
        result = scrapegraph.sitemap_run(url)
    except httpx.HTTPStatusError as e:
        detail = e.response.text or str(e)
        if e.response.status_code in (401, 403):
            detail = (
                "ScrapeGraph API access denied (403/401). "
                "Check SCRAPEGRAPH_API_KEY in .env: use a valid key from dashboard.scrapegraphai.com and ensure you have credits."
            )
        raise HTTPException(status_code=e.response.status_code, detail=detail)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    urls = result.get("urls") or []
    return {
        "request_id": result.get("request_id"),
        "status": result.get("status"),
        "website_url": result.get("website_url"),
        "urls": urls,
        "error": result.get("error", ""),
    }



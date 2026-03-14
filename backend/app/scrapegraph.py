"""
ScrapeGraphAI client for evidence gathering on Frontier Tower, SF.
- Official API (api.scrapegraphai.com): SearchScraper, Sitemap.
- Hackathon API (sgai-api-v2.onrender.com): POST /api/v1/scrape, POST /api/v1/extract only.
"""
import os
import time
from typing import Any, Dict, List, Optional

import httpx

HEADER_KEY = "SGAI-APIKEY"
HACKATHON_BASE = "https://sgai-api-v2.onrender.com/api/v1"


def _base_url() -> str:
    """API base URL. Hackathon: sgai-api-v2.onrender.com/api/v1. Official: api.scrapegraphai.com/v1."""
    url = os.getenv("SCRAPEGRAPH_BASE_URL", "").strip().rstrip("/")
    hackathon_flag = os.getenv("SCRAPEGRAPH_HACKATHON", "").strip().lower() in ("1", "true", "yes")
    if url:
        if "sgai-api-v2.onrender.com" in url or "sgai-saas-v2.onrender.com" in url:
            return HACKATHON_BASE
        return url if url.endswith("/v1") else f"{url}/v1"
    if hackathon_flag:
        return HACKATHON_BASE
    return "https://api.scrapegraphai.com/v1"


def _is_hackathon_api() -> bool:
    """True when using hackathon API (scrape + extract only, no searchscraper/sitemap)."""
    return _base_url() == HACKATHON_BASE


def _api_key() -> str:
    key = os.getenv("SCRAPEGRAPH_API_KEY") or os.getenv("SGAI_API_KEY", "").strip()
    if not key:
        raise RuntimeError("SCRAPEGRAPH_API_KEY or SGAI_API_KEY must be set for ScrapeGraphAI tools.")
    return key


def _headers() -> Dict[str, str]:
    key = _api_key()
    h = {
        "accept": "application/json",
        HEADER_KEY: key,
        "Content-Type": "application/json",
    }
    if _is_hackathon_api():
        h["Authorization"] = f"Bearer {key}"
    return h


def search_scraper_start(
    user_prompt: str,
    *,
    num_results: int = 3,
    extraction_mode: bool = True,
    time_range: Optional[str] = None,
    output_schema: Optional[Dict[str, Any]] = None,
    location_geo_code: Optional[str] = None,
    mock: bool = False,
) -> Dict[str, Any]:
    """Start a SearchScraper request. API: user_prompt, num_results (3-20), extraction_mode, time_range, etc."""
    payload: Dict[str, Any] = {
        "user_prompt": user_prompt,
        "num_results": min(20, max(3, num_results)),
        "extraction_mode": extraction_mode,
        "mock": mock,
    }
    if time_range:
        payload["time_range"] = time_range
    if output_schema:
        payload["output_schema"] = output_schema
    if location_geo_code:
        payload["location_geo_code"] = location_geo_code

    with httpx.Client(timeout=60.0) as client:
        r = client.post(
            f"{_base_url()}/searchscraper",
            headers=_headers(),
            json=payload,
        )
        r.raise_for_status()
        return r.json()


def search_scraper_status(request_id: str) -> Dict[str, Any]:
    """Get SearchScraper status and result by request_id."""
    with httpx.Client(timeout=30.0) as client:
        r = client.get(
            f"{_base_url()}/searchscraper/{request_id}",
            headers=_headers(),
        )
        r.raise_for_status()
        return r.json()


def search_scraper_run(
    user_prompt: str,
    *,
    num_results: int = 3,
    extraction_mode: bool = True,
    time_range: Optional[str] = None,
    output_schema: Optional[Dict[str, Any]] = None,
    location_geo_code: Optional[str] = None,
    poll_interval: float = 2.0,
    max_wait: float = 120.0,
) -> Dict[str, Any]:
    """Start SearchScraper and poll until completed. Returns full status response."""
    start = search_scraper_start(
        user_prompt,
        num_results=num_results,
        extraction_mode=extraction_mode,
        time_range=time_range,
        output_schema=output_schema,
        location_geo_code=location_geo_code,
    )
    rid = start.get("request_id")
    if not rid:
        return start

    deadline = time.monotonic() + max_wait
    while time.monotonic() < deadline:
        status_resp = search_scraper_status(rid)
        s = status_resp.get("status", "")
        if s in ("completed", "failed"):
            return status_resp
        time.sleep(poll_interval)

    return search_scraper_status(rid)


def sitemap_start(
    website_url: str,
    *,
    mock: bool = False,
    stealth: bool = False,
) -> Dict[str, Any]:
    """Start a Sitemap extraction. Official API: website_url, headers, mock, stealth."""
    payload: Dict[str, Any] = {
        "website_url": website_url,
        "mock": mock,
        "stealth": stealth,
    }
    with httpx.Client(timeout=60.0) as client:
        r = client.post(
            f"{_base_url()}/sitemap",
            headers=_headers(),
            json=payload,
        )
        r.raise_for_status()
        return r.json()


def sitemap_status(request_id: str) -> Dict[str, Any]:
    """Get Sitemap status and URLs by request_id."""
    with httpx.Client(timeout=30.0) as client:
        r = client.get(
            f"{_base_url()}/sitemap/{request_id}",
            headers=_headers(),
        )
        r.raise_for_status()
        return r.json()


def sitemap_run(
    website_url: str,
    *,
    poll_interval: float = 2.0,
    max_wait: float = 90.0,
) -> Dict[str, Any]:
    """Start Sitemap and poll until completed. Returns full response with urls list."""
    start = sitemap_start(website_url)
    rid = start.get("request_id")
    if not rid:
        return start

    deadline = time.monotonic() + max_wait
    while time.monotonic() < deadline:
        status_resp = sitemap_status(rid)
        s = status_resp.get("status", "")
        if s in ("completed", "failed"):
            return status_resp
        time.sleep(poll_interval)

    return sitemap_status(rid)


def is_configured() -> bool:
    """Return True if ScrapeGraphAI is enabled and API key is set."""
    if os.getenv("SCRAPEGRAPH_DISABLED", "").strip().lower() in ("1", "true", "yes"):
        return False
    try:
        _api_key()
        return True
    except RuntimeError:
        return False


# --- Hackathon API (sgai-api-v2.onrender.com): /api/v1/scrape, /api/v1/extract ---

def hackathon_scrape(
    url: str,
    *,
    format: str = "markdown",
    mode: str = "reader",
    fetch_config: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """POST /api/v1/scrape. Returns { id, format, content, metadata }. Cost: 1 credit."""
    base = _base_url()
    if base != HACKATHON_BASE:
        raise RuntimeError("hackathon_scrape only for hackathon API")
    payload: Dict[str, Any] = {"url": url, "format": format, "mode": mode}
    if fetch_config:
        payload["fetch_config"] = fetch_config
    with httpx.Client(timeout=90.0) as client:
        r = client.post(
            f"{base}/scrape",
            headers=_headers(),
            json=payload,
        )
        r.raise_for_status()
        return r.json()


def hackathon_extract(
    url: str,
    prompt: str,
    *,
    schema: Optional[Dict[str, Any]] = None,
    mode: str = "reader",
    fetch_config: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """POST /api/v1/extract from URL. Returns { id, raw, json, usage, metadata }. Cost: 5 credits."""
    base = _base_url()
    if base != HACKATHON_BASE:
        raise RuntimeError("hackathon_extract only for hackathon API")
    payload: Dict[str, Any] = {"url": url, "prompt": prompt, "mode": mode}
    if schema:
        payload["schema"] = schema
    if fetch_config:
        payload["fetch_config"] = fetch_config
    with httpx.Client(timeout=90.0) as client:
        r = client.post(
            f"{base}/extract",
            headers=_headers(),
            json=payload,
        )
        r.raise_for_status()
        return r.json()


def hackathon_extract_from_markdown(
    markdown: str,
    prompt: str,
    *,
    schema: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """POST /api/v1/extract from pre-fetched markdown (no URL fetch). Cost: 5 credits."""
    base = _base_url()
    if base != HACKATHON_BASE:
        raise RuntimeError("hackathon_extract_from_markdown only for hackathon API")
    payload: Dict[str, Any] = {"markdown": markdown, "prompt": prompt}
    if schema:
        payload["schema"] = schema
    with httpx.Client(timeout=90.0) as client:
        r = client.post(
            f"{base}/extract",
            headers=_headers(),
            json=payload,
        )
        r.raise_for_status()
        return r.json()


# Stable URLs for Frontier Tower SF evidence (hackathon: scrape + extract). Avoid dead links.
EVIDENCE_URLS = [
    "https://www.sf.gov/emergency-preparedness",
    "https://www.ready.gov/evacuation",
    "https://www.osha.gov/emergency-evacuation",
]


def evidence_run_hackathon(context: Optional[str] = None) -> dict:
    """
    Use hackathon API (scrape + extract) to gather evidence. No SearchScraper/Sitemap.
    Returns same shape as _fetch_evidence_tools_sync: { smart_searches: [...], sitemaps: [] }.
    """
    if not is_configured() or not _is_hackathon_api():
        return {}
    prompt = (
        "Extract evacuation routes, assembly points, emergency procedures, contacts, "
        "and any safety or building emergency information relevant to a high-rise in San Francisco (Frontier Tower). "
        "Summarize key points."
    )
    if context and context.strip():
        prompt = f"{prompt} User context: {context.strip()[:200]}"
    schema = {
        "type": "object",
        "properties": {
            "summary": {"type": "string"},
            "evacuation_routes": {"type": "array", "items": {"type": "string"}},
            "assembly_points": {"type": "array", "items": {"type": "string"}},
            "emergency_contacts": {"type": "array", "items": {"type": "string"}},
            "key_points": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["summary"],
    }
    fetch_cfg = {"render": True, "stealth": True, "wait": 3000}
    out: dict = {"smart_searches": [], "sitemaps": []}
    for url in EVIDENCE_URLS[:2]:
        try:
            scrape_data = hackathon_scrape(url, fetch_config=fetch_cfg)
            if scrape_data.get("error"):
                err = scrape_data["error"]
                msg = err.get("message", str(err)) if isinstance(err, dict) else str(err)
                out["smart_searches"].append({
                    "query": f"Extract evacuation/safety info from {url}",
                    "error": f"Scrape failed: {msg}",
                    "reference_urls": [url],
                })
                continue
            content = (scrape_data.get("content") or "").strip()
            if len(content) < 150:
                out["smart_searches"].append({
                    "query": f"Extract evacuation/safety info from {url}",
                    "result": {
                        "summary": "Page returned little or no text (may block bots or need JS).",
                        "evacuation_routes": [],
                        "assembly_points": [],
                        "emergency_contacts": [],
                        "key_points": [],
                    },
                    "reference_urls": [url],
                    "status": "completed",
                })
                continue
            data = hackathon_extract_from_markdown(content[:120000], prompt, schema=schema)
            if data.get("error"):
                err = data["error"]
                msg = err.get("message", str(err)) if isinstance(err, dict) else str(err)
                out["smart_searches"].append({
                    "query": f"Extract evacuation/safety info from {url}",
                    "error": msg,
                    "reference_urls": [url],
                })
                continue
            result = data.get("json") or data.get("raw") or {}
            if isinstance(result, dict) and (result.get("summary") == "No content available" or not result.get("summary")):
                result["summary"] = result.get("summary") or "Content was scraped but LLM returned no structured summary."
            out["smart_searches"].append({
                "query": f"Extract evacuation/safety info from {url}",
                "result": result,
                "reference_urls": [url],
                "status": "completed",
            })
        except httpx.HTTPStatusError as e:
            out["smart_searches"].append({
                "query": url,
                "error": e.response.text or str(e) if e.response.status_code not in (401, 403) else (
                    "ScrapeGraph API access denied. Check SCRAPEGRAPH_API_KEY and redeem HACK2026 credits."
                ),
                "reference_urls": [url],
            })
            if e.response.status_code in (401, 403):
                break
        except Exception as e:
            out["smart_searches"].append({"query": url, "error": str(e), "reference_urls": [url]})
    return out

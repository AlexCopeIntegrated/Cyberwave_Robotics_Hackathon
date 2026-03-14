# Threat Analyzer Backend (Python + Featherless + LangChain)

This is the Python backend for the Threat Analyzer application. It uses:

- **FastAPI** for the HTTP API
- **LangChain + langchain-openai** to call the **Featherless AI** API
- A **Threat Evaluation Assistant** system prompt focused on physical threats and hazards

The backend exposes a single main endpoint that accepts an image (and optional text notes) and returns a structured threat analysis.

---

## API Overview

- `GET /health`  
  Returns a simple JSON status object to verify the backend is running.

- `POST /api/analyze-image`  
  - **Content type**: `multipart/form-data`
  - **Fields**:
    - `image` (required): image file to analyze.
    - `notes` (optional): additional textual context from the user.
  - **Response**:

    ```json
    {
      "analysis": "<model response text>"
    }
    ```

Internally, the endpoint calls `app.threat_agent.analyze_image`, which:

1. Encodes the image as a base64 data URL.
2. Builds LangChain messages with:
   - A **SystemMessage** containing the Threat Evaluation Assistant instructions.
   - A **HumanMessage** that includes:
     - Text instructions / notes.
     - An `image_url` payload for the model.
3. Invokes the Featherless model via `ChatOpenAI`.

---

## Environment Variables

The backend uses the following environment variables, loaded from `backend/.env`:

- `FEATHERLESS_API_KEY` – your **Featherless** API key.
- `FEATHERLESS_BASE_URL` – base URL for the Featherless API.  
  Default: `https://api.featherless.ai/v1`
- `FEATHERLESS_MODEL` – model identifier.  
  Default (and recommended): `Qwen/Qwen3-8B`
- `PORT` – port for the FastAPI app when running locally.  
  Default: `4000`
- `SCRAPEGRAPH_API_KEY` or `SGAI_API_KEY` – (optional) ScrapeGraphAI API key for evidence-gathering tools (Smart Search, Sitemap). Get a key at [dashboard.scrapegraphai.com](https://dashboard.scrapegraphai.com); ensure your account has credits. If you see **403 Forbidden**, the key is invalid, revoked, or your plan doesn’t include the endpoint. If unset, those tools return 503.
- `SCRAPEGRAPH_DISABLED` – (optional) Set to `true`, `1`, or `yes` to **disable** ScrapeGraph entirely. Use this to avoid 403 errors and skip the “Evidence — Frontier Tower SF” block; threat analysis (image/text) still works normally.
- `SCRAPEGRAPH_BASE_URL` – (optional) For the **hackathon**, set to `https://sgai-api-v2.onrender.com` to use the hackathon API (`/api/v1/scrape`, `/api/v1/extract`). Evidence then uses scrape+extract on fixed SF emergency URLs (no SearchScraper/Sitemap). Default: official `https://api.scrapegraphai.com/v1`.

Example `.env` (already created for you):

```env
FEATHERLESS_API_KEY=rc_c61c5088b79c2d82592bb9e640d955977b419dd7e85a08aa9bdd17b161f8cb31
FEATHERLESS_BASE_URL=https://api.featherless.ai/v1
FEATHERLESS_MODEL=Qwen/Qwen3-8B
PORT=4000
```

> Important: keep `.env` private; it is ignored by git via `backend/.gitignore`.

---

## Installation & Run Instructions (do not run automatically)

From the **repo root**:

1. **Create and activate a Python virtual environment** (Python 3.10+ recommended):

   ```bash
   cd backend

   python -m venv venv
   # macOS / Linux:
   source venv/bin/activate
   # Windows (PowerShell):
   # venv\Scripts\Activate.ps1
   ```

2. **Install dependencies**:

   ```bash
   pip install --upgrade pip
   pip install -r requirements.txt
   ```

3. **Ensure environment variables are set** (or adjust `.env` as needed).

4. **Start the FastAPI server** (matching the existing frontend proxy at `http://localhost:4000`):

   ```bash
   uvicorn app.main:app --host 0.0.0.0 --port 4000 --reload
   ```

5. **Verify the backend is running**:

   ```bash
   curl http://localhost:4000/health
   # => {"status": "ok", "service": "threat-analyzer-backend"}
   ```

6. **Test image analysis manually** (optional):

   ```bash
   curl -X POST \
     -F "image=@../frontend/src/assets/threat-hero.jpg" \
     -F "notes=Test scene for fire and hazard analysis" \
     http://localhost:4000/api/analyze-image
   ```

The frontend is already configured (via `frontend/vite.config.ts`) to proxy `/api` and `/health` to `http://localhost:4000`, so once the backend is running the UI can call this endpoint directly.

---

## Tools API (Evidence Gathering — Frontier Tower SF)

The backend exposes ScrapeGraphAI-backed tools for evidence gathering in the Threat Analyzer UI:

- **`GET /api/tools`**  
  Returns the list of available tools (Analyze Image, Smart Search, Sitemap, Evacuation Search) and context `"Frontier Tower, San Francisco"`.

- **`POST /api/tools/smart-search`**  
  Body: `{"query": "your search query", "time_range": "past_week"}`. Runs ScrapeGraphAI SearchScraper and returns `result`, `reference_urls`, and status. Results are also pushed to the chat history.

- **`POST /api/tools/sitemap`**  
  Body: `{"website_url": "https://example.com"}`. Extracts all URLs from the site’s sitemap. Use with a URL from Smart Search to map that site. Results are also pushed to the chat history.

The **Tool Results** panel in the frontend lists these tools and shows Smart Search reference URLs and Sitemap URLs.


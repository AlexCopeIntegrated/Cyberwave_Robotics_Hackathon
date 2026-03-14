# Threat Evaluation Report

AI-powered physical threat and safety analysis for buildings and facilities. Analyze images and text for hazards (fire, smoke, structural damage, blocked exits, etc.), get severity assessments and recommended actions, and use evidence tools (Smart Search, Sitemap, Evacuation Search) in the context of a building like Frontier Tower, San Francisco. Built for the Cyberwave Robotics Hackathon; designed so a UGV rover can later register video for real-time safety monitoring and stored reports.

## Project structure

- **`frontend/`** — React + Vite + TypeScript UI (chat panel, tool results, image upload). See [frontend/README.md](frontend/README.md).
- **`backend/`** — FastAPI + LangChain + Featherless AI threat-analysis API and ScrapeGraphAI evidence tools. See [backend/README.md](backend/README.md).
- **`DEVPOST_REPORT.md`** — Devpost submission write-up (inspiration, what it does, how we built it, challenges, accomplishments, what's next).

## Quick start

1. **Backend** (Python 3.10+):

   ```bash
   cd backend
   python -m venv venv
   source venv/bin/activate   # Windows: venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   # Create backend/.env with FEATHERLESS_API_KEY etc. (see backend/README.md)
   uvicorn app.main:app --host 0.0.0.0 --port 4000 --reload
   ```

2. **Frontend** (Node.js):

   ```bash
   cd frontend
   npm install
   npm run dev
   ```

   The frontend proxies `/api` and `/health` to `http://localhost:4000`.

3. Open the app in the browser, upload an image or add notes, and run threat analysis. Use the tools panel for Smart Search and Sitemap (evacuation/building evidence).

## Tech stack

- **Backend:** FastAPI, LangChain, Featherless AI (Qwen), ScrapeGraphAI (optional), Python 3.10+
- **Frontend:** React, Vite, TypeScript, Tailwind CSS, shadcn-ui

## License

See repository or hackathon rules.

# Threat Evaluation Report

---

## Inspiration

We wanted to bring **AI-powered physical threat and safety analysis** into real-world monitoring—especially for buildings and facilities. The idea was to combine an intelligent threat-evaluation agent with the ability to gather evidence (evacuation info, building data) and, ideally, live or recorded video from a UGV rover. That way, safety teams could get structured threat reports, severity assessments, and recommended actions instead of raw footage alone. Our inspiration was: *use AI to turn visual and textual inputs into actionable safety reports that can be monitored and kept for further use.*

---

## What it does

**Threat Evaluation Report** is an application that:

- **Analyzes images** for physical threats and hazards (fire, smoke, structural damage, blocked exits, machine malfunction, electrical danger, etc.) using an AI Threat Evaluation Assistant.
- **Accepts text** descriptions or scene notes and returns a structured threat assessment with observations, severity, urgency, and recommended actions.
- **Supports evidence gathering** in the context of a specific building (e.g. Frontier Tower, San Francisco): Smart Search for evacuation routes and emergency info, Sitemap extraction from reference URLs, and a dedicated Evacuation Search tool.
- **Exposes a chat-style UI** where users can upload images, add notes, run analyses, and see tool results (Smart Search, Sitemap) in a dedicated panel.

The system is built so that **if a robot (e.g. UGV rover) could register videos onto the agent**, we could analyze real video streams for safety monitoring and keep reports for further use—which is exactly what we're aiming for once the rover integration works.

---

## How we built it

- **Backend (Python):** FastAPI app with endpoints for health, image analysis, text analysis, event logging, and tools (Smart Search, Sitemap). We use **LangChain** and **langchain-openai** to call the **Featherless AI** API (Qwen model) with a custom **Threat Evaluation Assistant** system prompt. Image analysis supports single images and optional image sequences (e.g. video frames). Evidence tools are powered by **ScrapeGraphAI** (with an optional hackathon base URL). CORS is enabled for the frontend.
- **Frontend:** React/Vite app with a chat panel for sending images and notes, and a tool-results panel that lists available tools and displays Smart Search and Sitemap outputs. The frontend proxies `/api` and `/health` to the backend.
- **Integration intent:** We designed the backend so that an external system (e.g. a UGV rover) could POST images or frames and log events via `/api/log-event` and `/api/analyze-image`, making it possible to feed real robot video into the same threat-analysis pipeline and retain reports for safety audits.

---

## Challenges we ran into

- **Unable to set up the UGV rover.** We tried for a long time to get the rover working for the demo; it was not cooperating, so we could not stream or register live/recorded video from the robot to our agent during the hackathon.
- **Demo without the robot.** We had to show the demo using uploaded images and the evidence tools (Smart Search, Sitemap, Evacuation Search) instead of live rover footage, which limited the “real-world robot” aspect of our presentation.
- **Environment and API setup.** Getting API keys, ScrapeGraph base URLs, and CORS/proxy configuration aligned between frontend and backend took some iteration.

---

## Accomplishments that we're proud of

- **End-to-end Threat Evaluation Report app** with image and text analysis, clear severity/urgency and recommended actions, and a structured system prompt that avoids cybersecurity scope creep and focuses on physical threats.
- **Evidence-gathering tools** (Smart Search, Sitemap, Evacuation Search) tied to a concrete building context (Frontier Tower SF), so the agent can support its assessments with real evacuation and emergency information.
- **Architecture ready for robot video:** API design (e.g. analyze-image, log-event, history) so that once the UGV rover can register videos to the agent, we can analyze real video for safety monitoring and keep reports for further use.
- **Working demo** under the constraints we had—showing threat analysis and evidence tools in the UI even without the physical robot.

---

## What we learned

- Integrating physical hardware (UGV rover) with a cloud-based AI pipeline in a short hackathon window is hard; having a **software-only demo path** (uploaded images + tools) was essential.
- Designing the backend with **robot-friendly endpoints** (image upload, event logging, optional image sequences) from the start would have made the eventual rover integration smoother.
- Clear separation between **direct observations**, **inferred risk**, and **tool-supported evidence** in the agent’s responses makes the reports more trustworthy and actionable for safety teams.

---

## What's next for Threat Evaluation Report

- **Get the UGV rover to register videos onto the agent** so we can run threat analysis on real robot footage and demonstrate live safety monitoring.
- **Use real video analysis** to monitor safety continuously and **keep reports** (e.g. via history/event log or export) for audits and further use.
- **Tighten rover–backend integration:** e.g. authenticated upload of video or frames, optional streaming, and automatic report generation and storage when threats are detected.
- **Expand evidence tools** (e.g. more buildings, more data sources) and improve the UI for reviewing past threat reports and evidence in one place.

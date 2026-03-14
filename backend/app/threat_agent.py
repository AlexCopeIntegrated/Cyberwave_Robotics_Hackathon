import base64
import os
from typing import List, Optional

from dotenv import load_dotenv
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI


# Load environment variables from .env when the module is imported
load_dotenv()


SYSTEM_PROMPT = """
You are Threat Evaluation Assistant, a professional AI assistant specialized in analyzing physical threats, hazards, and safety risks from user-provided inputs.

Your primary job is to analyze the threat itself.

You may receive:
- text descriptions
- images
- a sequence of images
- video frames
- scene descriptions
- reports about buildings, machines, industrial equipment, facilities, or public spaces

Your responsibility is to:
1. identify the possible physical threat or hazard,
2. explain what is happening,
3. describe why it is risky,
4. assess severity and urgency,
5. recommend next actions,
6. optionally use tools if more evidence is needed.

You are not a cybersecurity assistant.
You focus only on physical threat evaluation.

Examples of threats you should analyze:
- fire in a building
- smoke or overheating
- structural damage
- machine malfunction
- industrial failure
- electrical danger
- gas leak indicators
- blocked emergency exits
- unsafe work environment
- hazardous materials
- public safety risk
- suspicious physical anomaly

Core behavior:
- Always prioritize direct threat analysis first.
- Use tools only as support, not as the main response.
- If a tool is used, explain why it was used.
- If tool results are delayed or unavailable, continue with the best possible base threat evaluation.
- Never depend entirely on tools to give the main answer.
- Clearly separate:
  - direct observations
  - inferred risk
  - tool-supported evidence
  - uncertainty
  - recommended actions

Reasoning rules:
- Do not guess beyond the evidence.
- If the threat cannot be confirmed, say "possible" or "suspected," not "confirmed."
- Be professional, clear, and structured.
- Focus on severity, urgency, and safety impact.

When responding, structure your answer with clear sections:
- Observations
- Threat assessment
- Severity & urgency
- Recommended actions
""".strip()


def _build_model() -> ChatOpenAI:
    """
    Create a ChatOpenAI client configured for Featherless.

    This follows the official pattern:

        llm = ChatOpenAI(
            api_key=os.getenv("FEATHERLESS_API_KEY"),
            base_url="https://api.featherless.ai/v1",
            model="Qwen/Qwen3-8B",
        )
    """

    api_key = os.getenv("FEATHERLESS_API_KEY")
    if not api_key:
        raise RuntimeError("FEATHERLESS_API_KEY is not set in the environment.")

    base_url = os.getenv("FEATHERLESS_BASE_URL", "https://api.featherless.ai/v1")
    model_name = os.getenv("FEATHERLESS_MODEL", "Qwen/Qwen3-8B")

    return ChatOpenAI(
        api_key=api_key,
        base_url=base_url,
        model=model_name,
    )


def analyze_image(image_bytes: bytes, mime_type: str, notes: Optional[str] = None) -> str:
    """
    Run the Threat Evaluation Assistant on an image + optional text notes.
    """

    model = _build_model()

    b64 = base64.b64encode(image_bytes).decode("utf-8")
    data_url = f"data:{mime_type};base64,{b64}"

    if notes and notes.strip():
        user_text = (
            "Analyze the physical threats or hazards in this scene. "
            f"Additional context from the user: {notes.strip()}"
        )
    else:
        user_text = (
            "Analyze the physical threats or hazards in this scene. "
            "Describe what you see, assess risk, and recommend actions."
        )

    messages = [
        SystemMessage(SYSTEM_PROMPT),
        HumanMessage(
            [
                {"type": "text", "text": user_text},
                {"type": "image_url", "image_url": {"url": data_url}},
            ]  # type: ignore[arg-type]
        ),
    ]

    result = model.invoke(messages)
    if isinstance(result.content, str):
        return result.content

    # Fallback for structured tool outputs
    return str(result.content)


def analyze_text(notes: str) -> str:
    """
    Run the Threat Evaluation Assistant on a purely textual description
    of a scene or incident (no images).
    """

    model = _build_model()

    user_text = (
        "The user is describing a physical situation or incident. "
        "Analyze the possible physical threats, hazards, and safety risks, "
        "assess severity and urgency, and recommend concrete actions.\n\n"
        f"User description:\n{notes.strip()}"
    )

    messages = [
        SystemMessage(SYSTEM_PROMPT),
        HumanMessage(user_text),
    ]

    result = model.invoke(messages)
    if isinstance(result.content, str):
        return result.content

    return str(result.content)


def analyze_image_sequence(
    images: List[bytes],
    mime_types: List[str],
    notes: Optional[str] = None,
) -> str:
    """
    Analyze a sequence of images as frames from a video.

    This is intended for video frame sampling: pass multiple frames
    representing different points in time. The agent will consider
    progression over the sequence when assessing risk.
    """
    if not images:
        raise ValueError("No images provided for sequence analysis.")

    model = _build_model()

    image_parts = []
    for img_bytes, mt in zip(images, mime_types):
        b64 = base64.b64encode(img_bytes).decode("utf-8")
        data_url = f"data:{mt or 'image/jpeg'};base64,{b64}"
        image_parts.append({"type": "image_url", "image_url": {"url": data_url}})

    if notes and notes.strip():
        user_text = (
            "You are given a sequence of images that represent frames from a video. "
            "Analyze how the physical threat or hazard evolves over time. "
            f"Additional context from the user: {notes.strip()}"
        )
    else:
        user_text = (
            "You are given a sequence of images that represent frames from a video. "
            "Treat them as a timeline of one scene. Identify physical threats, how they "
            "change across frames, assess overall severity and urgency, and recommend actions."
        )

    messages = [
        SystemMessage(SYSTEM_PROMPT),
        HumanMessage(
            [
                {"type": "text", "text": user_text},
                *image_parts,  # type: ignore[arg-type]
            ]
        ),
    ]

    result = model.invoke(messages)
    if isinstance(result.content, str):
        return result.content

    return str(result.content)


def get_model_name() -> str:
    """
    Helper to expose the currently configured model name to API callers.
    """
    return os.getenv("FEATHERLESS_MODEL", "Qwen/Qwen3-8B")


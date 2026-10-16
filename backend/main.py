
import json
import logging
import os
from io import BytesIO
from typing import Any

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from google import genai
from google.genai import types
from PIL import Image, UnidentifiedImageError


# --------------------------------------------------
# Configuration
# --------------------------------------------------

API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
MODEL_NAME = os.getenv("GEMINI_MODEL", "gemini-2.5-flash").strip()
MAX_BYTES = 8 * 1024 * 1024

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("sarpa_ai")

origins = [
    item.strip().rstrip("/")
    for item in os.getenv(
        "ALLOWED_ORIGINS",
        "https://yadav-debug.github.io,"
        "http://localhost:5500,"
        "http://127.0.0.1:5500",
    ).split(",")
    if item.strip()
]

app = FastAPI(
    title="Sarpa AI Snake Safety API",
    version="1.0.1",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


# --------------------------------------------------
# Routes
# --------------------------------------------------

@app.get("/")
def root():
    return {
        "service": "Sarpa AI Snake Safety API",
        "status": "running",
        "health": "/health",
        "prediction_endpoint": "POST /predict",
    }


@app.get("/health")
def health():
    return {
        "ok": True,
        "api_key_configured": bool(API_KEY),
        "model": MODEL_NAME,
    }


# --------------------------------------------------
# Snake image prediction
# --------------------------------------------------

@app.post("/predict")
async def predict(file: UploadFile = File(...)) -> dict[str, Any]:

    if not API_KEY:
        raise HTTPException(
            status_code=503,
            detail="Gemini API key is not configured on the backend.",
        )

    allowed_mime_types = {
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif",
    }

    if file.content_type not in allowed_mime_types:
        raise HTTPException(
            status_code=415,
            detail="Upload a JPG, PNG, WEBP, or GIF image.",
        )

    raw = await file.read(MAX_BYTES + 1)

    if not raw:
        raise HTTPException(
            status_code=400,
            detail="The uploaded image is empty.",
        )

    if len(raw) > MAX_BYTES:
        raise HTTPException(
            status_code=413,
            detail="Image is too large. Please use an image under 8 MB.",
        )

    # Validate the actual image rather than trusting its filename.
    try:
        image = Image.open(BytesIO(raw))
        image.verify()

        image = Image.open(BytesIO(raw))
        image.load()
        image = image.convert("RGB")

        # Send a normalized JPEG to Gemini.
        image_buffer = BytesIO()
        image.save(image_buffer, format="JPEG")
        image_bytes = image_buffer.getvalue()

    except (UnidentifiedImageError, OSError, ValueError):
        raise HTTPException(
            status_code=400,
            detail="The uploaded file is not a valid image.",
        )

    prompt = """
You are assisting with an EDUCATIONAL snake-photo triage tool.
This is not a medical diagnosis or a guarantee of species identity.

Analyze the attached image conservatively.

Return ONLY valid JSON with these exact keys:
{
  "snake_visible": true,
  "suggested_identification": "common name or Unknown",
  "confidence": "low",
  "venom_risk": "not established",
  "explanation": "one short sentence",
  "safety_advice": "one short sentence"
}

Rules:
- snake_visible must be true or false.
- suggested_identification must be a common name or Unknown.
- confidence must be low, moderate, or high.
- venom_risk must be potentially venomous, not established,
  or snake not clearly visible.
- If a snake is not clearly visible, use Unknown, low confidence,
  and snake not clearly visible.
- Do not identify a species with certainty from an unclear image.
- Never assume a snake is non-venomous because the image is blurry.
- State that image identification can be wrong.
- Do not instruct the user to catch, touch, or kill a snake.
- A photo cannot determine whether a bite occurred or venom was injected.
- Be especially cautious about identifying Indian snake species.
- Keep the explanation and safety advice brief.
"""

    try:
        client = genai.Client(api_key=API_KEY)

        response = client.models.generate_content(
            model=MODEL_NAME,
            contents=[
                prompt,
                types.Part.from_bytes(
                    data=image_bytes,
                    mime_type="image/jpeg",
                ),
            ],
            config=types.GenerateContentConfig(
                temperature=0.1,
                response_mime_type="application/json",
            ),
        )

        response_text = response.text

        if not response_text:
            raise ValueError("Gemini returned an empty response.")

        data = json.loads(response_text)

    except Exception as exc:
        # Log the error type without printing API keys or request contents.
        # Do not return provider error details to the public browser.
        logger.error(
            "Gemini request failed. Error type: %s",
            type(exc).__name__,
        )

        # Log a sanitized message for diagnosis.
        error_message = str(exc)
        if API_KEY:
            error_message = error_message.replace(API_KEY, "[REDACTED]")

        logger.error(
            "Gemini error details: %s",
            error_message[:1000],
        )

        raise HTTPException(
            status_code=502,
            detail=(
                "AI analysis failed. Check the backend logs "
                "for the error type and details."
            ),
        ) from None

    # --------------------------------------------------
    # Validate and normalize Gemini's JSON
    # --------------------------------------------------

    if not isinstance(data, dict):
        raise HTTPException(
            status_code=502,
            detail="AI returned an invalid response. Please try again.",
        )

    allowed_risks = {
        "potentially venomous",
        "not established",
        "snake not clearly visible",
    }

    allowed_confidence = {
        "low",
        "moderate",
        "high",
    }

    snake_visible = data.get("snake_visible", False)

    if not isinstance(snake_visible, bool):
        snake_visible = False

    identification = data.get(
        "suggested_identification",
        "Unknown",
    )

    if not isinstance(identification, str):
        identification = "Unknown"

    confidence = data.get("confidence", "low")

    if confidence not in allowed_confidence:
        confidence = "low"

    venom_risk = data.get("venom_risk", "not established")

    if venom_risk not in allowed_risks:
        venom_risk = "not established"

    explanation = data.get(
        "explanation",
        "The image could not be identified reliably.",
    )

    if not isinstance(explanation, str):
        explanation = "The image could not be identified reliably."

    safety_advice = data.get(
        "safety_advice",
        "Keep away and contact a trained local wildlife rescuer.",
    )

    if not isinstance(safety_advice, str):
        safety_advice = (
            "Keep away and contact a trained local wildlife rescuer."
        )

    if not snake_visible:
        identification = "Unknown"
        confidence = "low"
        venom_risk = "snake not clearly visible"

    return {
        "snake_visible": snake_visible,
        "suggested_identification": identification,
        "confidence": confidence,
        "venom_risk": venom_risk,
        "explanation": explanation,
        "safety_advice": safety_advice,
        "disclaimer": (
            "AI identification can be wrong and does not prove a snake "
            "is safe. Keep away from all snakes. If bitten, seek "
            "emergency medical care immediately; do not wait for "
            "this result."
        ),
    }

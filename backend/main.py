import json
import os
from io import BytesIO
from typing import Any

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from google import genai
from google.genai import types
from PIL import Image, UnidentifiedImageError

API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
MODEL_NAME = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
MAX_BYTES = 8 * 1024 * 1024

origins = [
    item.strip().rstrip("/")
    for item in os.getenv(
        "ALLOWED_ORIGINS",
        "https://yadav-debug.github.io,http://localhost:5500,http://127.0.0.1:5500",
    ).split(",")
    if item.strip()
]

app = FastAPI(title="Sarpa AI Snake Safety API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


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
    return {"ok": True, "api_key_configured": bool(API_KEY), "model": MODEL_NAME}


@app.post("/predict")
async def predict(file: UploadFile = File(...)) -> dict[str, Any]:
    if not API_KEY:
        raise HTTPException(
            status_code=503,
            detail="Backend is missing GEMINI_API_KEY. Add it in your hosting service's environment settings.",
        )

    if file.content_type not in {"image/jpeg", "image/png", "image/webp", "image/gif"}:
        raise HTTPException(status_code=415, detail="Upload a JPG, PNG, WEBP, or GIF image.")

    raw = await file.read(MAX_BYTES + 1)
    if not raw:
        raise HTTPException(status_code=400, detail="The uploaded image is empty.")
    if len(raw) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="Image is too large. Please use an image under 8 MB.")

    try:
        image = Image.open(BytesIO(raw))
        image.verify()
        image = Image.open(BytesIO(raw)).convert("RGB")
    except (UnidentifiedImageError, OSError, ValueError):
        raise HTTPException(status_code=400, detail="The uploaded file is not a valid image.")

    # API client is created only after the key has been checked.
    client = genai.Client(api_key=API_KEY)
    prompt = """
You are assisting with an EDUCATIONAL snake-photo triage tool, not making a medical diagnosis.
Analyze the attached image conservatively. Never claim certainty if the photo does not clearly show a snake.
Return ONLY valid JSON with these exact keys:
{
 "snake_visible": true or false,
 "suggested_identification": "common name or Unknown",
 "confidence": "low" or "moderate" or "high",
 "venom_risk": "potentially venomous" or "not established" or "snake not clearly visible",
 "explanation": "one short sentence",
 "safety_advice": "one short sentence"
}
Rules:
- If no snake is clearly visible, set snake_visible=false, suggested_identification="Unknown",
  confidence="low", venom_risk="snake not clearly visible".
- Do not infer a snake is non-venomous just because the image is blurry, the model is uncertain,
  or a species seems harmless.
- Unless the species is clearly identified and its risk is well-established, use
  venom_risk="not established" and advise keeping away.
- Even when a likely species is named, explicitly state that image identification can be wrong.
- Do not give instructions to catch, kill, touch, or handle a snake.
- A snake photo cannot assess a bite or determine whether venom was injected.
- This model may not cover Indian species accurately; be extra cautious with regional uncertainty.
"""
    try:
        response = client.models.generate_content(
            model=MODEL_NAME,
            contents=[
                prompt,
                types.Part.from_bytes(data=raw, mime_type=file.content_type),
            ],
            config=types.GenerateContentConfig(
                temperature=0.1,
                response_mime_type="application/json",
            ),
        )
        data = json.loads(response.text or "{}")
    except Exception:
        # Do not return internals, API keys, or provider errors to the public browser.
        raise HTTPException(
            status_code=502,
            detail="AI analysis failed. Check the backend logs, API key, model access, and quota, then try again.",
        )

    allowed_risks = {"potentially venomous", "not established", "snake not clearly visible"}
    allowed_confidence = {"low", "moderate", "high"}
    if not isinstance(data, dict):
        raise HTTPException(status_code=502, detail="AI returned an invalid response. Please try again.")
    data.setdefault("snake_visible", False)
    data.setdefault("suggested_identification", "Unknown")
    data.setdefault("confidence", "low")
    data.setdefault("venom_risk", "not established")
    data.setdefault("explanation", "The image could not be identified reliably.")
    data.setdefault("safety_advice", "Keep away and contact a trained local wildlife rescuer.")
    if data.get("venom_risk") not in allowed_risks:
        data["venom_risk"] = "not established"
    if data.get("confidence") not in allowed_confidence:
        data["confidence"] = "low"
    if not data.get("snake_visible"):
        data["suggested_identification"] = "Unknown"
        data["confidence"] = "low"
        data["venom_risk"] = "snake not clearly visible"

    data["disclaimer"] = (
        "AI output may be wrong and is not proof that a snake is safe. Keep away from all snakes. "
        "If bitten, seek emergency medical care immediately; do not wait for this result."
    )
    return data

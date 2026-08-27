"""
Fitgura-AI-Core  v3.2  —  Production Integration
=================================================
Modes
  • baseline   — first-time full-body scan, saves identity baseline
  • tracking   — weekly gallery scan, computes measurement_delta vs baseline
  • add_device — product/barcode photo → device ID + compatible accessories

Key changes vs v2
  • gemini-1.5-flash (faster, lower cost than 1.5-pro)
  • API key: google.colab.userdata → GOOGLE_API_KEY env var (auto-detects env)
  • ScannedProductProfile: compatible_accessories_needed → compatible_accessories
  • ScannedProductProfile gains identification_type, brand, category fields
  • DeviceProfile: screen_size_inches removed (inferred from model name)
  • ADD_DEVICE_PROMPT: PRECISION RULES for wearables (no Smartwatch/Tablet confusion)
  • measurement_delta is Dict[str, str] (lightweight, no nested model)
  • Server-side _compute_delta overrides model's self-reported delta (accuracy)
  • Unified analyze_fitgura_input entry point (3-mode dispatcher)
  • FastAPI: POST /baseline  POST /track  POST /add_device  GET /health

Install: pip install fastapi uvicorn python-multipart pillow google-generativeai pydantic
Run API: uvicorn fitgura_core:app --reload --port 8000
"""

import io
import re
import time
from enum import Enum
from typing import List, Optional, Dict

from PIL import Image
from pydantic import BaseModel, Field
import google.generativeai as genai

# ---------------------------------------------------------------------------
# 1. API KEY — Colab secrets first, then environment variable
# ---------------------------------------------------------------------------
import os

def _load_api_key() -> str:
    try:
        from google.colab import userdata  # type: ignore
        return userdata.get("GOOGLE_API_KEY") or ""
    except Exception:
        return os.environ.get("GOOGLE_API_KEY", "")

GOOGLE_API_KEY = _load_api_key()
genai.configure(api_key=GOOGLE_API_KEY)

# gemini-1.5-flash: multimodal, fast, cost-efficient
# response_mime_type="application/json" forces clean JSON output
VISION_MODEL = genai.GenerativeModel(
    "gemini-1.5-flash",
    generation_config=genai.GenerationConfig(
        response_mime_type="application/json",
        temperature=0.1,   # low temp → consistent, deterministic output
    ),
)

# ---------------------------------------------------------------------------
# 2. ENUMS
# ---------------------------------------------------------------------------

class TopSizeEnum(str, Enum):
    xs = "XS"; s = "S"; m = "M"; l = "L"; xl = "XL"; xxl = "XXL"

class FitPreferenceEnum(str, Enum):
    slim = "Slim"; regular = "Regular"; loose = "Loose"; oversized = "Oversized"

class BodyFrameEnum(str, Enum):
    small = "Small"; medium = "Medium"; large = "Large"; athletic = "Athletic"

class PatternEnum(str, Enum):
    solid = "Solid"; patterned = "Patterned"; graphic = "Graphic"

# ---------------------------------------------------------------------------
# 3. PYDANTIC MODELS  (matches FitguraAnalysisResponse used by React client)
# ---------------------------------------------------------------------------

class SizingProfile(BaseModel):
    recommended_top_size: Optional[TopSizeEnum] = None
    recommended_bottom_size: Optional[str] = None
    fit_preference: Optional[FitPreferenceEnum] = None
    body_frame_estimate: Optional[BodyFrameEnum] = None
    # Tracking-mode fields
    baseline_matched: bool = Field(False, description="True if same person as stored baseline")
    is_weekly_update: bool = Field(False, description="True when triggered by periodic gallery scan")
    measurement_delta: Optional[Dict[str, str]] = Field(
        None,
        description="Key→value diff vs previous scan. Keys: top, bottom, fit, frame, summary. Null for baseline scans.",
    )
    confidence_score: float = Field(default=0.0, ge=0.0, le=1.0)


class StyleProfile(BaseModel):
    """Retained for React UI — displayed in ResultView."""
    primary_style: str = "Casual"
    secondary_style: str = "Smart Casual"
    dominant_colors: List[str] = Field(default_factory=list)
    pattern_preference: PatternEnum = PatternEnum.solid
    aesthetic_tags: List[str] = Field(default_factory=list)


class DeviceProfile(BaseModel):
    detected_brand: str = "Unknown"
    exact_model: str = "Unknown"
    confidence_score: float = Field(default=0.0, ge=0.0, le=1.0)


class ScannedProductProfile(BaseModel):
    """Returned by add_device mode."""
    identification_type: Optional[str] = Field(None, description="Barcode | Visual_OCR | Visual_ID")
    brand: Optional[str] = Field(None, description="e.g. Apple, Samsung, Garmin, Fitbit")
    product_name: Optional[str] = None
    exact_sku: Optional[str] = None
    category: Optional[str] = Field(None, description="Smartphone | Tablet | Smartwatch | Fitness Tracker | Laptop | Headphones | Other")
    compatible_accessories: List[str] = Field(
        default_factory=list,
        description="3–5 high-relevancy accessories specific to this exact model (e.g. '22mm Sport Band', 'Screen Protector')",
    )
    confidence_score: float = Field(default=0.0, ge=0.0, le=1.0)


class FitguraAnalysisResponse(BaseModel):
    device_profile: DeviceProfile = Field(default_factory=DeviceProfile)
    sizing_profile: SizingProfile = Field(default_factory=SizingProfile)
    style_profile: StyleProfile = Field(default_factory=StyleProfile)
    scanned_product_profile: ScannedProductProfile = Field(default_factory=ScannedProductProfile)

# ---------------------------------------------------------------------------
# 4. BASELINE STORE  (replace with Redis / Postgres in production)
# ---------------------------------------------------------------------------

_baseline_store: Dict[str, FitguraAnalysisResponse] = {}

def save_baseline(user_id: str, result: FitguraAnalysisResponse) -> None:
    _baseline_store[user_id] = result

def load_baseline(user_id: str) -> Optional[FitguraAnalysisResponse]:
    return _baseline_store.get(user_id)

# ---------------------------------------------------------------------------
# 5. JSON EXTRACTION  (robust against markdown fences)
# ---------------------------------------------------------------------------

def _extract_json(text: str) -> str:
    cleaned = re.sub(r"```(?:json)?\s*", "", text).replace("```", "").strip()
    match = re.search(r"\{.*\}", cleaned, re.DOTALL)
    return match.group(0) if match else cleaned

# ---------------------------------------------------------------------------
# 6. SERVER-SIDE DELTA COMPUTATION
#    Overrides whatever the model self-reported — ground truth comparison.
# ---------------------------------------------------------------------------

def _compute_delta(
    baseline: FitguraAnalysisResponse,
    current: FitguraAnalysisResponse,
) -> Dict[str, str]:
    b, c = baseline.sizing_profile, current.sizing_profile
    delta: Dict[str, str] = {}
    parts: List[str] = []

    if b.recommended_top_size and c.recommended_top_size and b.recommended_top_size != c.recommended_top_size:
        delta["top"] = f"{b.recommended_top_size} → {c.recommended_top_size}"
        parts.append(f"חולצה: {delta['top']}")

    if b.recommended_bottom_size and c.recommended_bottom_size and b.recommended_bottom_size != c.recommended_bottom_size:
        delta["bottom"] = f"{b.recommended_bottom_size} → {c.recommended_bottom_size}"
        parts.append(f"מכנסיים: {delta['bottom']}")

    if b.fit_preference and c.fit_preference and b.fit_preference != c.fit_preference:
        delta["fit"] = f"{b.fit_preference} → {c.fit_preference}"
        parts.append(f"גזרה: {delta['fit']}")

    if b.body_frame_estimate and c.body_frame_estimate and b.body_frame_estimate != c.body_frame_estimate:
        delta["frame"] = f"{b.body_frame_estimate} → {c.body_frame_estimate}"
        parts.append(f"מסגרת גוף: {delta['frame']}")

    delta["summary"] = "זוהו שינויים: " + " | ".join(parts) if parts else "לא זוהו שינויים מהסריקה הקודמת."
    return delta

# ---------------------------------------------------------------------------
# 7. PROMPTS  (one per mode — explicit schema reduces hallucination)
# ---------------------------------------------------------------------------

_JSON_SCHEMA = """\
{
  "device_profile": {
    "detected_brand": "string",
    "exact_model": "string",
    "confidence_score": 0.0
  },
  "sizing_profile": {
    "recommended_top_size": "XS|S|M|L|XL|XXL|null",
    "recommended_bottom_size": "waist string or null",
    "fit_preference": "Slim|Regular|Loose|Oversized|null",
    "body_frame_estimate": "Small|Medium|Large|Athletic|null",
    "baseline_matched": false,
    "is_weekly_update": false,
    "measurement_delta": null,
    "confidence_score": 0.0
  },
  "style_profile": {
    "primary_style": "string",
    "secondary_style": "string",
    "dominant_colors": ["#hex"],
    "pattern_preference": "Solid|Patterned|Graphic",
    "aesthetic_tags": ["tag"]
  },
  "scanned_product_profile": {
    "identification_type": null,
    "brand": null,
    "product_name": null,
    "exact_sku": null,
    "category": null,
    "compatible_accessories": [],
    "confidence_score": 0.0
  }
}"""

BASELINE_PROMPT = f"""\
You are Fitgura-AI-Core in BASELINE mode — first-time user setup.

Analyze the full-body photo. Sizing must reflect the person's BODY (not clothing labels).
Estimate dominant clothing colours and aesthetic style from what they're wearing.

Client: {{user_agent}}

Return ONLY a valid JSON object matching this schema (no markdown, no explanation):
{_JSON_SCHEMA}

Rules:
- baseline_matched = false (no prior baseline exists)
- is_weekly_update = false
- measurement_delta = null
- scanned_product_profile fields = null / []
- Set confidence_score = 0.0 for any field you cannot determine with confidence.
"""

TRACKING_PROMPT = f"""\
You are Fitgura-AI-Core in TRACKING mode — weekly or manual follow-up scan.

STORED BASELINE:
  Top size    : {{baseline_top}}
  Bottom size : {{baseline_bottom}}
  Fit         : {{baseline_fit}}
  Body frame  : {{baseline_frame}}

Compare the new photo against the baseline above.

Client: {{user_agent}}
Weekly scan: {{is_weekly}}

Return ONLY a valid JSON object (same schema as baseline):
{_JSON_SCHEMA}

Key rules:
- baseline_matched = true if SAME PERSON as baseline, false if different person
- is_weekly_update = {{is_weekly}}
- measurement_delta = null if no changes detected, otherwise a dict with keys:
    top, bottom, fit, frame (each "old → new"), and summary (Hebrew sentence)
- scanned_product_profile fields = null / []
"""

ADD_DEVICE_PROMPT = f"""\
You are Fitgura-AI-Core in ADD_DEVICE mode.

The user photographed a physical device, product packaging, or barcode/label.
Identify the product and list compatible accessories for this EXACT model.

Client: {{user_agent}}

PRECISION RULES — read carefully before responding:
1. WEARABLES FIRST: If the image contains a smartwatch or fitness tracker (on a wrist, on a table,
   in packaging), identify the exact Brand (Garmin, Apple, Samsung, Fitbit, Amazfit …), Series,
   and Model. Do NOT confuse a wearable with a phone or tablet.
2. NO CATEGORY CONFUSION: A watch is a Smartwatch/Fitness Tracker, not a Smartphone or Tablet.
   A tablet is not a laptop. Identify exactly what is in the image.
3. ACCESSORIES PRECISION: List 3–5 accessories that fit THIS EXACT model only.
   For smartwatches → band size (e.g. "22mm Sport Band"), screen protector, charging cable/dock.
   For phones → case model, tempered glass size, cable type.
   For tablets → stylus model, keyboard case, screen protector size.
4. SKU / MODEL: Extract model number from visible text, barcode, or packaging when possible.
5. CONFIDENCE: Set confidence_score = 0.0 if the product cannot be identified with certainty.

Return ONLY a valid JSON object matching this schema (no markdown, no explanation):
{_JSON_SCHEMA}

Field rules for scanned_product_profile:
- identification_type: "Barcode" | "Visual_OCR" | "Visual_ID"
- category: Smartwatch | Fitness Tracker | Smartphone | Tablet | Laptop | Headphones | Other
- compatible_accessories: exactly 3–5 items, model-specific (not generic)

sizing_profile and style_profile → all null / empty defaults.
"""

# ---------------------------------------------------------------------------
# 8. VISION CALL  (retry with exponential back-off)
# ---------------------------------------------------------------------------

def _call_vision(
    prompt: str,
    image: Image.Image,
    max_retries: int = 3,
) -> Optional[FitguraAnalysisResponse]:
    last_err: Exception | None = None
    for attempt in range(max_retries):
        try:
            response = VISION_MODEL.generate_content([prompt, image])
            json_str = _extract_json(response.text)
            return FitguraAnalysisResponse.model_validate_json(json_str)
        except Exception as exc:
            last_err = exc
            wait = 2 ** attempt
            print(f"[Attempt {attempt + 1}/{max_retries}] {exc}  — retry in {wait}s")
            time.sleep(wait)
    print(f"All retries exhausted: {last_err}")
    return None

# ---------------------------------------------------------------------------
# 9. MODE FUNCTIONS
# ---------------------------------------------------------------------------

def analyze_baseline(
    image: Image.Image,
    user_agent: str = "unknown",
    user_id: str = "default",
) -> Optional[FitguraAnalysisResponse]:
    """First-time body scan. Saves result as the user's baseline."""
    prompt = BASELINE_PROMPT.format(user_agent=user_agent)
    result = _call_vision(prompt, image)
    if result:
        save_baseline(user_id, result)
    return result


def analyze_tracking(
    image: Image.Image,
    user_agent: str = "unknown",
    user_id: str = "default",
    is_weekly: bool = False,
) -> Optional[FitguraAnalysisResponse]:
    """Follow-up scan. Falls back to baseline scan if no prior baseline exists."""
    baseline = load_baseline(user_id)
    if baseline is None:
        print(f"[tracking] No baseline for '{user_id}' — running baseline scan instead.")
        return analyze_baseline(image, user_agent, user_id)

    b = baseline.sizing_profile
    prompt = TRACKING_PROMPT.format(
        baseline_top=b.recommended_top_size or "unknown",
        baseline_bottom=b.recommended_bottom_size or "unknown",
        baseline_fit=b.fit_preference or "unknown",
        baseline_frame=b.body_frame_estimate or "unknown",
        is_weekly=str(is_weekly).lower(),
        user_agent=user_agent,
    )
    result = _call_vision(prompt, image)
    if result:
        # Server-side delta overrides model's self-reported value
        result.sizing_profile.measurement_delta = _compute_delta(baseline, result)
        result.sizing_profile.is_weekly_update = is_weekly
    return result


def analyze_add_device(
    image: Image.Image,
    user_agent: str = "unknown",
) -> Optional[FitguraAnalysisResponse]:
    """Identifies a photographed device/barcode and returns compatible accessories."""
    prompt = ADD_DEVICE_PROMPT.format(user_agent=user_agent)
    return _call_vision(prompt, image)


# ---------------------------------------------------------------------------
# 10. UNIFIED ENTRY POINT  (matches Integration Instructions)
# ---------------------------------------------------------------------------

def analyze_fitgura_input(
    image: Image.Image,
    user_agent: str = "unknown",
    mode: str = "baseline",          # "baseline" | "tracking" | "add_device"
    user_id: str = "default",
    is_weekly: bool = False,
) -> Optional[FitguraAnalysisResponse]:
    """
    Single dispatcher used by all three app flows:

      add_device  → analyze_add_device()
      baseline    → analyze_baseline()
      tracking    → analyze_tracking()
    """
    if mode == "add_device":
        return analyze_add_device(image, user_agent)
    if mode == "tracking":
        return analyze_tracking(image, user_agent, user_id, is_weekly)
    return analyze_baseline(image, user_agent, user_id)

# ---------------------------------------------------------------------------
# 11. FASTAPI  (pip install fastapi uvicorn python-multipart)
# ---------------------------------------------------------------------------
try:
    from fastapi import FastAPI, UploadFile, File, Form, HTTPException
    from fastapi.middleware.cors import CORSMiddleware

    app = FastAPI(
        title="Fitgura-AI-Core API",
        version="3.2.0",
        description="Baseline · Tracking · Add-Device — powered by Gemini 1.5 Flash",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.post(
        "/baseline",
        response_model=FitguraAnalysisResponse,
        summary="Initial body scan — establishes user baseline",
        tags=["Body Sizing"],
    )
    async def baseline_endpoint(
        image: UploadFile = File(..., description="Full-body photo"),
        user_agent: str = Form(default="unknown"),
        user_id: str = Form(default="default"),
    ):
        pil = Image.open(io.BytesIO(await image.read())).convert("RGB")
        result = analyze_baseline(pil, user_agent, user_id)
        if not result:
            raise HTTPException(502, "AI analysis failed — check logs")
        return result

    @app.post(
        "/track",
        response_model=FitguraAnalysisResponse,
        summary="Weekly/manual scan — computes delta vs baseline",
        tags=["Body Sizing"],
    )
    async def track_endpoint(
        image: UploadFile = File(..., description="Full-body or gallery photo"),
        user_agent: str = Form(default="unknown"),
        user_id: str = Form(default="default"),
        is_weekly: bool = Form(default=False),
    ):
        pil = Image.open(io.BytesIO(await image.read())).convert("RGB")
        result = analyze_tracking(pil, user_agent, user_id, is_weekly)
        if not result:
            raise HTTPException(502, "AI analysis failed — check logs")
        return result

    @app.post(
        "/add_device",
        response_model=FitguraAnalysisResponse,
        summary="Device photo/barcode → identification + compatible accessories",
        tags=["Devices"],
    )
    async def add_device_endpoint(
        image: UploadFile = File(..., description="Device photo or barcode/label"),
        user_agent: str = Form(default="unknown"),
    ):
        pil = Image.open(io.BytesIO(await image.read())).convert("RGB")
        result = analyze_add_device(pil, user_agent)
        if not result:
            raise HTTPException(502, "AI analysis failed — check logs")
        return result

    @app.get("/health", tags=["Meta"])
    def health():
        return {
            "status": "ok",
            "version": "3.2.0",
            "model": "gemini-1.5-flash",
            "baselines_stored": len(_baseline_store),
        }

except ImportError:
    print("FastAPI not installed — API disabled.")
    print("Run: pip install fastapi uvicorn python-multipart")
    app = None

# ---------------------------------------------------------------------------
# 12. ENTRY POINT
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    print("Fitgura-AI-Core v3.1 ready.")
    print("Endpoints:")
    print("  POST /baseline   — initial body scan")
    print("  POST /track      — weekly / manual tracking scan")
    print("  POST /add_device — device photo → accessories")
    print("  GET  /health     — status")
    print("")
    print("Start: uvicorn fitgura_core:app --reload --port 8000")

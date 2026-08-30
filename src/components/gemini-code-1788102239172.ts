import { Platform } from 'react-native';
import { 
  FitguraAnalysisResponse, 
  VendorSizeChartEntry, 
  SkuMatchResult, 
  SizingProfile 
} from '../types/fitgura';

const SYSTEM_PROMPT = `You are the core Computer Vision & Analysis Engine for Fitgura (Fitgura-AI-Core).
Analyze user images and HTTP metadata to extract physical body metrics, style, device info, and sizing profiles.

OUTPUT REQUIREMENTS:
- Respond ONLY with a valid clean JSON object.
- Extract precise physical body metrics (chest, waist, hips, shoulders in CM) alongside sizing recommendations.

EXPECTED JSON STRUCTURE:
{
  "device_profile": {
    "detected_brand": "Apple | Samsung | Xiaomi | Other",
    "exact_model": "String",
    "screen_size_inches": 0.0,
    "camera_layout_type": "String",
    "confidence_score": 0.00
  },
  "sizing_profile": {
    "body_metrics": {
      "estimated_height_cm": 0,
      "estimated_weight_kg": 0,
      "chest_circumference_cm": 0,
      "waist_circumference_cm": 0,
      "hips_circumference_cm": 0,
      "shoulder_width_cm": 0
    },
    "recommended_top_size": "XS | S | M | L | XL | XXL",
    "recommended_bottom_size": "String",
    "fit_preference": "Slim | Regular | Loose | Oversized",
    "body_frame_estimate": "Small | Medium | Large | Athletic",
    "confidence_score": 0.00
  },
  "style_profile": {
    "primary_style": "String",
    "secondary_style": "String",
    "dominant_colors": ["Color1"],
    "pattern_preference": "Solid | Patterned | Graphic",
    "aesthetic_tags": ["tag1"]
  }
}`;

/**
 * 1. מנתח את תמונת המשתמש ומפיק נתוני מידות אנתרופומטריות (ס"מ)
 */
export async function analyzeUserImageAndMetadata(
  base64Image: string,
  userAgent?: string
): Promise<FitguraAnalysisResponse> {
  const clientInfo = userAgent || `${Platform.OS} ${Platform.Version}`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.EXPO_PUBLIC_OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: `Client Metadata: ${clientInfo}` },
            {
              type: 'image_url',
              image_url: {
                url: base64Image.startsWith('data:')
                  ? base64Image
                  : `data:image/jpeg;base64,${base64Image}`,
              },
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) throw new Error(`API Error: ${response.statusText}`);
  const data = await response.json();
  return JSON.parse(data.choices[0].message.content);
}

/**
 * 2. מנוע התאמת מידות אקטיבי: מתרגם את היקפי הגוף של המשתמש ל-SKU המדויק מתוך טבלת המידות של המוכר
 */
export async function matchUserToVendorSku(
  userSizing: SizingProfile,
  vendorSizeChart: VendorSizeChartEntry[]
): Promise<SkuMatchResult> {
  const { chest_circumference_cm, waist_circumference_cm } = userSizing.body_metrics;

  const prompt = `You are Fitgura's Size Translation Engine.
Match the user's physical body metrics to the correct vendor size entry from the provided Size Chart.

USER BODY METRICS:
- Chest: ${chest_circumference_cm || 'N/A'} cm
- Waist: ${waist_circumference_cm || 'N/A'} cm
- Fit Preference: ${userSizing.fit_preference}

VENDOR SIZE CHART:
${JSON.stringify(vendorSizeChart, null, 2)}

OUTPUT FORMAT (JSON ONLY):
{
  "matched_vendor_size": "String (e.g., Asian XL)",
  "target_sku_id": "String (the matching sku_id from chart)",
  "match_confidence": 0.95,
  "recommendation_note": "String explaining the mapping (e.g., Recommended XL based on 102cm chest measurement)"
}`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.EXPO_PUBLIC_OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini', // מודל קל ומהיר להתאמת טבלאות
      temperature: 0.0,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const data = await response.json();
  return JSON.parse(data.choices[0].message.content);
}
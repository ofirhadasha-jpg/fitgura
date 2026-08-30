import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SYSTEM_PROMPT = `You are the core Computer Vision & Analysis Engine for Fitgura, a fashion-tech app.
You analyze full-body photos of people to extract body measurements, sizing, and style.

CRITICAL INSTRUCTIONS:
- You MUST provide your best estimates for ALL body metrics. NEVER return null for body measurements.
- Even if you are not fully confident, provide reasonable estimates based on visual proportions, body frame, and clothing fit.
- Use the person's visible proportions relative to standard human anatomy to estimate measurements.
- A typical adult male is 170-185cm tall; female 155-170cm. Use body proportions (head height ≈ 1/7.5 of total height) to estimate.
- Chest/waist/hips: estimate from visible body width and build. Athletic build = larger chest, narrower waist.
- Shoulder width: estimate from visible shoulder span (typically 40-50cm for medium frame).
- Confidence scores: use 0.6-0.9 for body metrics (you are estimating, not measuring), 0.4-0.7 for device detection.

FACE DETECTION:
- Check whether a human face is clearly visible in the photo.
- Set "face_detected" to true if a face is visible, false if the face is missing, obscured, cropped out, or not recognizable.
- This field is critical for the app to decide whether to ask the user for a better photo.

OUTPUT REQUIREMENTS:
- Respond ONLY with a valid clean JSON object.
- ALL fields in body_metrics MUST have numeric values (never null).
- Confidence scores should be between 0 and 1.
- For sizing: XS=86cm chest, S=96, M=104, L=112, XL=120, XXL=128 (approximate).
- Bottom size: 28=71cm waist, 30=76, 32=81, 34=86, 36=91, 38=97.

PERSON BOUNDS:
- Identify the bounding box of the person in the photo.
- Return coordinates as PERCENTAGES of the image dimensions (0 to 100).
- "top" = distance from top edge of image to top of person's head (as % of image height)
- "left" = distance from left edge of image to leftmost edge of person (as % of image width)
- "width" = width of person as % of image width
- "height" = height of person as % of image height
- If the person fills most of the frame, use small margins (e.g. top: 2, left: 10, width: 80, height: 96).
- These bounds are used to draw alignment brackets around the person.

EXPECTED JSON STRUCTURE:
{
  "face_detected": true,
  "device_profile": {
    "detected_brand": "Apple | Samsung | Xiaomi | Google | OnePlus | Other",
    "exact_model": "String or null",
    "screen_size_inches": 0.0,
    "camera_layout_type": "String or null",
    "confidence_score": 0.00
  },
  "person_bounds": {
    "top": 2.0,
    "left": 10.0,
    "width": 80.0,
    "height": 96.0
  },
  "sizing_profile": {
    "body_metrics": {
      "estimated_height_cm": 175,
      "estimated_weight_kg": 75,
      "chest_circumference_cm": 100,
      "waist_circumference_cm": 82,
      "hips_circumference_cm": 98,
      "shoulder_width_cm": 46
    },
    "recommended_top_size": "XS | S | M | L | XL | XXL",
    "recommended_bottom_size": "28 | 30 | 32 | 34 | 36 | 38",
    "fit_preference": "Slim | Regular | Loose | Oversized",
    "body_frame_estimate": "Small | Medium | Large | Athletic",
    "confidence_score": 0.75
  },
  "style_profile": {
    "primary_style": "Casual | Streetwear | Classic | Minimalist | Smart Casual | Athletic | Boho | Business",
    "secondary_style": "Urban | Preppy | Techwear | Resort | Business Casual | Sporty",
    "dominant_colors": ["Black", "White", "Blue"],
    "pattern_preference": "Solid | Patterned | Graphic",
    "aesthetic_tags": ["minimalist", "clean", "modern"]
  }
}`;

async function getApiKey(): Promise<string | null> {
  const envKey = Deno.env.get("DEEPSEEK_API_KEY");
  if (envKey) return envKey;

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return null;

  const supabase = createClient(supabaseUrl, serviceKey);
  const { data, error } = await supabase
    .from("ai_config")
    .select("value")
    .eq("key", "DEEPSEEK_API_KEY")
    .maybeSingle();

  if (error || !data) return null;
  return data.value;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { image, userAgent } = await req.json();

    if (!image) {
      return new Response(
        JSON.stringify({ error: "Missing image data" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const clientInfo = userAgent || "Unknown Web Client";

    const apiKey = await getApiKey();
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "DeepSeek API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-v4-flash-vision-exp",
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: `Client Metadata: ${clientInfo}` },
              {
                type: "image_url",
                image_url: {
                  url: image.startsWith("data:")
                    ? image
                    : `data:image/jpeg;base64,${image}`,
                },
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return new Response(
        JSON.stringify({ error: `DeepSeek API Error: ${response.status} - ${errText}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await response.json();
    const analysisResult = JSON.parse(data.choices[0].message.content);

    return new Response(
      JSON.stringify(analysisResult),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

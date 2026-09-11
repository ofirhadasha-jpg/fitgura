import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SYSTEM_PROMPT = `You are the core Computer Vision & Analysis Engine for Fitgura, a fashion-tech app.
You analyze full-body photos of people to extract age group, gender, body measurements, sizing, and style.

CRITICAL INSTRUCTIONS:
- You MUST provide your best estimates for ALL body metrics. NEVER return null for body measurements.
- Even if you are not fully confident, provide reasonable estimates based on visual proportions, body frame, and clothing fit.
- Use the person's visible proportions relative to standard human anatomy to estimate measurements.
- A typical adult male is 170-185cm tall; female 155-170cm. Use body proportions (head height ≈ 1/7.5 of total height for adults, ≈1/4 for babies) to estimate.
- Chest/waist/hips: estimate from visible body width and build. Athletic build = larger chest, narrower waist.
- Shoulder width: estimate from visible shoulder span (typically 40-50cm for medium frame adult).
- Confidence scores: use 0.6-0.9 for body metrics (you are estimating, not measuring), 0.4-0.7 for device detection.

AGE GROUP DETECTION — CRITICAL:
- Analyze visual cues (body proportions, head-to-body ratio, face shape, size, clothing type) to determine the age group.
- Babies (0-2 years): head is about 1/4 of body height, very short (50-90cm), round features, baby clothing.
- Toddlers (2-4 years): head about 1/5 of body height, short (90-110cm), toddler clothing.
- Children (5-12 years): head about 1/6 of body height, 110-150cm, kid clothing.
- Teens (13-17 years): near-adult proportions, 150-175cm, youth/teen clothing.
- Adults (18+): head about 1/7.5 of body height, 155-185cm+, standard adult clothing.
- Set "age_group" to one of: "baby", "toddler", "child", "teen", "adult".
- This field is CRITICAL — it determines which product catalog (baby clothes, kids clothes, adult clothes) to search.
- When in doubt between baby and toddler, choose based on whether the person can stand (toddler) or is held/lying (baby).

GENDER DETECTION:
- Analyze visual cues (body frame, proportions, hair, clothing style, facial features if visible) to determine gender.
- Set "gender" to "male", "female", or "unisex" (use "unisex" if gender is ambiguous or cannot be determined).
- For babies and toddlers, gender detection is harder — use "unisex" if uncertain.
- This field is used to filter product search results by gender category.

FACE DETECTION:
- Check whether a human face is clearly visible in the photo.
- Set "face_detected" to true if a face is visible, false if the face is missing, obscured, cropped out, or not recognizable.
- This field is critical for the app to decide whether to ask the user for a better photo.

SHOE SIZE DETECTION:
- Estimate the person's EU shoe size based on their height, body frame, and proportions.
- Typical adult male EU shoe size: 40-46. Typical adult female EU shoe size: 36-42.
- Baby shoe sizes (EU): 16-22. Toddler shoe sizes (EU): 23-26. Child shoe sizes (EU): 27-35.
- Teen shoe sizes overlap with adult: 36-40.
- Use height and age group as the primary factors.
- Set "recommended_shoe_size_eu" to an integer EU shoe size. For babies use 16-22, toddlers 23-26, children 27-35, teens/adults 36-48.
- If truly undeterminable, use null.

SIZE GUIDANCE BY AGE GROUP:
- Baby (0-2y): top sizes like "0-3M", "3-6M", "6-12M", "12-18M", "18-24M". Bottom sizes same range. Height 50-90cm.
- Toddler (2-4y): top sizes like "2T", "3T", "4T", "5T". Bottom sizes same. Height 90-110cm.
- Child (5-12y): top sizes by age: "5-6Y", "7-8Y", "9-10Y", "11-12Y". Bottom sizes same. Height 110-150cm.
- Teen (13-17y): use adult sizes (XS/S/M/L/XL) but smaller. Height 150-175cm.
- Adult (18+): XS/S/M/L/XL/XXL. EU pants 36-54. Height 155-185+cm.
- For babies/toddlers/children, set recommended_top_size and recommended_bottom_size to age-based sizes, NOT adult sizes.

OUTPUT REQUIREMENTS:
- Respond ONLY with a valid clean JSON object.
- ALL fields in body_metrics MUST have numeric values (never null).
- Confidence scores should be between 0 and 1.
- For adult sizing (BODY measurements, not garment): XS=82cm chest, S=88, M=94, L=100, XL=106, XXL=112 (approximate).
- Adult bottom size (EU): 36=64cm waist, 38=68, 40=72, 42=76, 44=80, 46=84, 48=88, 50=92, 52=96, 54=100.

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
  "age_group": "adult",
  "gender": "male",
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
    "recommended_bottom_size": "36 | 38 | 40 | 42 | 44 | 46 | 48 | 50 | 52 | 54",
    "recommended_shoe_size_eu": 42,
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
      signal: AbortSignal.timeout(40000),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-v4-flash",
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
    const rawContent = data.choices[0].message.content;

    // DeepSeek sometimes wraps JSON in markdown fences or appends extra text.
    // Extract the first valid JSON object from the response.
    let analysisResult: unknown;
    try {
      analysisResult = JSON.parse(rawContent);
    } catch {
      const fenceMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenceMatch) {
        analysisResult = JSON.parse(fenceMatch[1].trim());
      } else {
        const jsonStart = rawContent.indexOf("{");
        const jsonEnd = rawContent.lastIndexOf("}");
        if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
          throw new Error("No valid JSON found in AI response");
        }
        analysisResult = JSON.parse(rawContent.slice(jsonStart, jsonEnd + 1));
      }
    }

    return new Response(
      JSON.stringify(analysisResult),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

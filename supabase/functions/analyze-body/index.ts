import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SYSTEM_PROMPT = `You are the core Computer Vision & Analysis Engine for Fitgura.
Analyze user images and HTTP metadata to extract physical body metrics, style, device info, and sizing profiles.

OUTPUT REQUIREMENTS:
- Respond ONLY with a valid clean JSON object.
- Extract precise physical body metrics (chest, waist, hips, shoulders in CM) alongside sizing recommendations.
- If you cannot determine a value, use null for that field.
- Confidence scores should be between 0 and 1.

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

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      return new Response(
        JSON.stringify({ error: "OpenAI API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
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
        JSON.stringify({ error: `OpenAI API Error: ${response.status} - ${errText}` }),
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

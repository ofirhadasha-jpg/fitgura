import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SYSTEM_PROMPT = `You are a device identification AI for Fitgura. You analyze photos of electronic devices (phones, tablets, laptops, headphones, smartwatches, etc.) and identify the exact brand and model.

CRITICAL INSTRUCTIONS:
- Analyze the device in the photo carefully: look at the logo, shape, camera layout, screen size, color, and any visible text or model numbers.
- Identify the brand (Apple, Samsung, Xiaomi, Google, OnePlus, OPPO, Motorola, Sony, Lenovo, Dell, HP, Bose, JBL, etc.).
- Identify the exact model name (e.g., "iPhone 15 Pro Max", "Galaxy S24 Ultra", "Xiaomi 14", "Pixel 8 Pro").
- Determine the device type (phone, tablet, laptop, headphones, smartwatch, other).
- Estimate screen size if visible (inches).
- Suggest 3-5 compatible accessories (cases, screen protectors, chargers, pens, etc.) specific to this device.
- If you cannot identify the exact model, provide your best guess based on visual features and state lower confidence.
- NEVER return null for brand or model. Always provide your best estimate.

OUTPUT REQUIREMENTS:
- Respond ONLY with a valid clean JSON object.
- Confidence scores between 0 and 1.

EXPECTED JSON STRUCTURE:
{
  "device_type": "phone | tablet | laptop | headphones | smartwatch | other",
  "brand": "Apple",
  "model": "iPhone 15 Pro Max",
  "screen_size_inches": 6.7,
  "chip": "A17 Pro",
  "year": "2023",
  "extra": "6.7\" · A17 Pro · 2023",
  "compatible_accessories": ["כיסוי סיליקון ל-iPhone 15 Pro Max", "מגן מסך זכוכית 9H", "מטען MagSafe 15W", "אוזניות AirPods Pro 2"],
  "confidence_score": 0.85
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
    const { image } = await req.json();

    if (!image) {
      return new Response(
        JSON.stringify({ error: "Missing image data" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

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
              { type: "text", text: "Identify this device from the photo." },
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
    const result = JSON.parse(data.choices[0].message.content);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

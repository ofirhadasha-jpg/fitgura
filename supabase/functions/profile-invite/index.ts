import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create a client with the user's JWT to respect RLS
    const userSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    // Get the authenticated user
    const { data: { user }, error: userError } = await userSupabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action } = body;

    // --- GENERATE INVITE ---
    // Creates (or replaces) a family_profile row + invite token
    if (action === "generate") {
      const { memberName, category, familyMemberId } = body;

      if (!memberName || !category) {
        return new Response(JSON.stringify({ error: "Missing memberName or category" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Upsert family_profile (use familyMemberId as a stable reference if provided)
      let profileId: string;

      if (familyMemberId) {
        // Try to find existing profile by matching id — but since family_members
        // are local, we use a deterministic approach: check if a profile with
        // this owner + member_name + category already exists
        const { data: existing } = await supabase
          .from("family_profiles")
          .select("id")
          .eq("owner_user_id", user.id)
          .eq("member_name", memberName)
          .eq("category", category)
          .maybeSingle();

        if (existing) {
          profileId = existing.id;
        } else {
          const { data: newProfile, error: insertError } = await supabase
            .from("family_profiles")
            .insert({
              owner_user_id: user.id,
              member_name: memberName,
              category,
            })
            .select("id")
            .single();

          if (insertError || !newProfile) {
            return new Response(JSON.stringify({ error: "Failed to create profile" }), {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          profileId = newProfile.id;
        }
      } else {
        const { data: newProfile, error: insertError } = await supabase
          .from("family_profiles")
          .insert({
            owner_user_id: user.id,
            member_name: memberName,
            category,
          })
          .select("id")
          .single();

        if (insertError || !newProfile) {
          return new Response(JSON.stringify({ error: "Failed to create profile" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        profileId = newProfile.id;
      }

      // Generate a random token
      const token = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");

      // Deactivate old invites for this profile
      await supabase
        .from("profile_invites")
        .update({ is_active: false })
        .eq("family_profile_id", profileId);

      // Insert new invite token
      const { error: inviteError } = await supabase
        .from("profile_invites")
        .insert({
          family_profile_id: profileId,
          token,
          is_active: true,
        });

      if (inviteError) {
        return new Response(JSON.stringify({ error: "Failed to create invite" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const inviteUrl = `${new URL(req.url).origin.split('/functions')[0]}/update-profile?token=${token}`;

      return new Response(JSON.stringify({ success: true, token, inviteUrl, profileId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- VERIFY TOKEN ---
    // Returns profile info for the remote update screen
    if (action === "verify") {
      const { token } = body;
      if (!token) {
        return new Response(JSON.stringify({ error: "Missing token" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data, error } = await supabase
        .rpc("get_family_profile_by_token", { p_token: token });

      if (error || !data) {
        return new Response(JSON.stringify({ error: "Invalid or expired link" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- SUBMIT REMOTE UPDATE ---
    // Updates family profile metrics using the invite token via spec-compliant function
    if (action === "submit") {
      const {
        token,
        topSize,
        bottomSize,
        shoeSize,
        fit,
        heightCm,
        weightKg,
        chestCm,
        waistCm,
        hipsCm,
        shoulderCm,
        accuracy,
        gender,
        ageGroup,
      } = body;

      if (!token) {
        return new Response(JSON.stringify({ error: "Missing token" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Build JSONB metrics payload — ONLY metric columns, no names/ownership
      const metrics: Record<string, unknown> = {};
      if (topSize != null) metrics.top_size = topSize;
      if (bottomSize != null) metrics.bottom_size = bottomSize;
      if (shoeSize != null) metrics.shoe_size = shoeSize;
      if (fit != null) metrics.fit = fit;
      if (heightCm != null) metrics.height_cm = heightCm;
      if (weightKg != null) metrics.weight_kg = weightKg;
      if (chestCm != null) metrics.chest_cm = chestCm;
      if (waistCm != null) metrics.waist_cm = waistCm;
      if (hipsCm != null) metrics.hips_cm = hipsCm;
      if (shoulderCm != null) metrics.shoulder_cm = shoulderCm;
      if (accuracy != null) metrics.accuracy = accuracy;
      if (gender != null) metrics.gender = gender;
      if (ageGroup != null) metrics.age_group = ageGroup;

      const { data, error } = await supabase
        .rpc("update_profile_metrics_via_token", {
          p_token: token,
          p_metrics: metrics,
        });

      if (error || !data) {
        return new Response(JSON.stringify({ error: "Update failed" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

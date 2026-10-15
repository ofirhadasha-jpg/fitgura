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

    const body = await req.json();
    const { action } = body;

    // Actions that don't require authentication — they use the service-role
    // client and validate access via the invite token itself.
    const publicActions = ["verify", "submit", "request_join"];

    let user: { id: string; email?: string } | null = null;

    if (!publicActions.includes(action)) {
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
      const { data: { user: authUser }, error: userError } = await userSupabase.auth.getUser();
      if (userError || !authUser) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      user = authUser;
    }

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

      if (familyMemberId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(familyMemberId)) {
        // familyMemberId is a real DB UUID — look up the profile directly by id
        const { data: existing } = await supabase
          .from("family_profiles")
          .select("id")
          .eq("id", familyMemberId)
          .eq("owner_user_id", user.id)
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

      const { error: compatibilityInviteError } = await supabase
        .from("family_invites")
        .insert({
          parent_user_id: user.id,
          profile_id: profileId,
          token,
          status: "pending",
        });
      if (compatibilityInviteError) {
        console.error("Compatibility family invite insert failed:", compatibilityInviteError);
      }

      const inviteUrl = `${new URL(req.url).origin.split('/functions')[0]}/join-family?token=${token}&profile=${profileId}`;

      return new Response(JSON.stringify({ success: true, token, inviteUrl, profileId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- GENERATE SHARE LINK ---
    // Creates an invite token with granted_profile_ids for workspace sharing
    if (action === "share") {
      const { grantedProfileIds, recipientName } = body;

      if (!grantedProfileIds || !Array.isArray(grantedProfileIds) || grantedProfileIds.length === 0) {
        return new Response(JSON.stringify({ error: "Missing grantedProfileIds" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Verify all profiles belong to the authenticated user
      const { data: ownedProfiles } = await supabase
        .from("family_profiles")
        .select("id")
        .eq("owner_user_id", user.id)
        .in("id", grantedProfileIds);

      if (!ownedProfiles || ownedProfiles.length !== grantedProfileIds.length) {
        return new Response(JSON.stringify({ error: "Not all profiles belong to you" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Use the first profile as the family_profile_id for the invite
      // The granted_profile_ids array stores the full list of shared profiles
      const primaryProfileId = grantedProfileIds[0];
      const token = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");

      // Deactivate old invites for this profile
      await supabase
        .from("profile_invites")
        .update({ is_active: false })
        .eq("family_profile_id", primaryProfileId);

      const { error: inviteError } = await supabase
        .from("profile_invites")
        .insert({
          family_profile_id: primaryProfileId,
          token,
          is_active: true,
          granted_profile_ids: grantedProfileIds,
        });

      if (inviteError) {
        return new Response(JSON.stringify({ error: "Failed to create share link" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error: compatibilityInviteError } = await supabase
        .from("family_invites")
        .insert({
          parent_user_id: user.id,
          profile_id: primaryProfileId,
          token,
          status: "pending",
        });
      if (compatibilityInviteError) {
        console.error("Compatibility family invite insert failed:", compatibilityInviteError);
      }

      const inviteUrl = `${new URL(req.url).origin.split('/functions')[0]}/join-family?token=${token}&profile=${primaryProfileId}`;

      return new Response(JSON.stringify({ success: true, token, inviteUrl, profileId: primaryProfileId, grantedProfileIds }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- ACCEPT FAMILY SHARE ---
    // Called when a recipient opens a share link and is authenticated.
    // Creates profile_grants rows linking the recipient to each shared profile.
    if (action === "accept") {
      const { token } = body;
      if (!token) {
        return new Response(JSON.stringify({ error: "Missing token" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Fetch the invite with granted_profile_ids
      const { data: invite, error: inviteError } = await supabase
        .from("profile_invites")
        .select("family_profile_id, granted_profile_ids, is_active, used, expires_at")
        .eq("token", token)
        .maybeSingle();

      if (inviteError || !invite) {
        return new Response(JSON.stringify({ error: "Invalid link" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!invite.is_active || invite.used) {
        // Check if user already has grants — if so, treat as already accepted
        const grantedIds: string[] = invite.granted_profile_ids || [invite.family_profile_id]
        const { data: existingGrants } = await supabase
          .from("profile_grants")
          .select("id")
          .eq("granted_user_id", user.id)
          .in("family_profile_id", grantedIds)
          .limit(1);

        if (existingGrants && existingGrants.length > 0) {
          const { data: sharedProfiles } = await supabase
            .from("family_profiles")
            .select("id, member_name, category")
            .in("id", grantedIds);
          return new Response(JSON.stringify({
            success: true,
            sharedProfiles: sharedProfiles || [],
            alreadyMember: true,
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ error: "Link already used or inactive" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (new Date(invite.expires_at) < new Date()) {
        return new Response(JSON.stringify({ error: "Link has expired" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const grantedIds: string[] = invite.granted_profile_ids || [invite.family_profile_id];

      // Don't let the owner accept their own share link
      const { data: profileRow } = await supabase
        .from("family_profiles")
        .select("owner_user_id")
        .eq("id", invite.family_profile_id)
        .maybeSingle();

      if (profileRow?.owner_user_id === user.id) {
        return new Response(JSON.stringify({ error: "Cannot accept your own share link", isOwner: true }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Create grants for each profile — idempotent via UNIQUE constraint
      const grants = grantedIds.map((pid) => ({
        family_profile_id: pid,
        granted_user_id: user.id,
        granted_by_user_id: profileRow?.owner_user_id,
      }));

      const { error: grantError } = await supabase
        .from("profile_grants")
        .upsert(grants, { onConflict: "family_profile_id,granted_user_id" });

      if (grantError) {
        return new Response(JSON.stringify({ error: "Failed to accept share" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Fetch the shared profile names for the response
      const { data: sharedProfiles } = await supabase
        .from("family_profiles")
        .select("id, member_name, category")
        .in("id", grantedIds);

      // Mark invite as used
      await supabase
        .from("profile_invites")
        .update({ used: true, used_at: new Date().toISOString() })
        .eq("token", token);

      // Notify the parent that the share was accepted
      if (profileRow?.owner_user_id) {
        const names = (sharedProfiles || []).map((p: { member_name: string }) => p.member_name).join(", ");
        await supabase.from("notifications").insert({
          user_id: profileRow.owner_user_id,
          title: "שיתוף משפחתי התקבל ✨",
          body: `${user.email?.split("@")[0] ?? "בן משפחה"} קיבל/ה גישה לפרופילים: ${names}`,
          type: "family_share",
        });
      }

      return new Response(JSON.stringify({
        success: true,
        sharedProfiles: sharedProfiles || [],
      }), {
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

      // Check if this is a share link (has granted_profile_ids)
      const { data: inviteRow } = await supabase
        .from("profile_invites")
        .select("granted_profile_ids, family_profile_id")
        .eq("token", token)
        .maybeSingle();

      const isShareLink = !!(inviteRow?.granted_profile_ids && inviteRow.granted_profile_ids.length > 0);

      let sharerName: string | null = null;
      if (isShareLink && inviteRow?.family_profile_id) {
        const { data: profileRow } = await supabase
          .from("family_profiles")
          .select("owner_user_id")
          .eq("id", inviteRow.family_profile_id as string)
          .maybeSingle();
        if (profileRow?.owner_user_id) {
          const { data: inviterProfile } = await supabase
            .from("profiles")
            .select("email")
            .eq("user_id", profileRow.owner_user_id as string)
            .maybeSingle();
          if (inviterProfile?.email) {
            sharerName = inviterProfile.email.split("@")[0] ?? null;
          }
        }
      }

      // Also look up the inviter's name for non-share links (family update invites)
      if (!isShareLink && inviteRow?.family_profile_id) {
        const { data: profileRow } = await supabase
          .from("family_profiles")
          .select("owner_user_id")
          .eq("id", inviteRow.family_profile_id as string)
          .maybeSingle();
        if (profileRow?.owner_user_id) {
          const { data: inviterProfile } = await supabase
            .from("profiles")
            .select("email")
            .eq("user_id", profileRow.owner_user_id as string)
            .maybeSingle();
          if (inviterProfile?.email) {
            sharerName = inviterProfile.email.split("@")[0] ?? null;
          }
        }
      }

      // Check if there's already a pending join request for this token
      const { data: existingRequest } = await supabase
        .from("join_requests")
        .select("id, status, guest_name")
        .eq("token", token)
        .eq("status", "pending")
        .maybeSingle();

      return new Response(JSON.stringify({
        ...data,
        isShareLink,
        grantedProfileIds: inviteRow?.granted_profile_ids || null,
        sharerName,
        hasPendingRequest: !!existingRequest,
        pendingRequestName: existingRequest?.guest_name ?? null,
      }), {
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
        dateOfBirth,
        avatarUrl,
        scanPreview,
        galleryScans,
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
      if (dateOfBirth != null) metrics.date_of_birth = dateOfBirth;
      if (avatarUrl != null) metrics.avatar_url = avatarUrl;
      if (scanPreview != null) metrics.scan_preview = scanPreview;
      if (galleryScans != null) metrics.gallery_scans = galleryScans;

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

      if (data.success && data.profile_id) {
        const memberName = data.member_name as string;
        const ownerUserId = data.owner_user_id as string | undefined;
        if (ownerUserId) {
          await supabase.from("notifications").insert({
            user_id: ownerUserId,
            title: `${memberName} עדכנ/ה את המידות`,
            body: `${memberName} עדכנ/ה את המידות! הנתונים עודכנו בהצלחה ✨`,
            type: "family_update",
          });
        }
      }

      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- REQUEST JOIN (public, no auth required) ---
    // A guest opens the invite link and submits their name/email to request
    // to join the family. Stores a pending request and notifies the inviter.
    if (action === "request_join") {
      const { token, guestName, guestEmail } = body;
      if (!token || !guestName) {
        return new Response(JSON.stringify({ error: "Missing token or guestName" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Look up the invite to find the parent_user_id and profile_id
      const { data: inviteRow } = await supabase
        .from("profile_invites")
        .select("family_profile_id, is_active, used, expires_at")
        .eq("token", token)
        .maybeSingle();

      if (!inviteRow || !inviteRow.is_active || inviteRow.used) {
        return new Response(JSON.stringify({ error: "Invalid or expired link" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (inviteRow.expires_at && new Date(inviteRow.expires_at) < new Date()) {
        return new Response(JSON.stringify({ error: "Link has expired" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Find the family profile to get the owner (inviter)
      const { data: profileRow } = await supabase
        .from("family_profiles")
        .select("owner_user_id, member_name")
        .eq("id", inviteRow.family_profile_id)
        .maybeSingle();

      if (!profileRow?.owner_user_id) {
        return new Response(JSON.stringify({ error: "Invalid invite" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check if there's already a pending request for this token
      const { data: existingReq } = await supabase
        .from("join_requests")
        .select("id, status")
        .eq("token", token)
        .eq("status", "pending")
        .maybeSingle();

      if (existingReq) {
        return new Response(JSON.stringify({ success: true, alreadyPending: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Insert the join request
      const { error: insertError } = await supabase
        .from("join_requests")
        .insert({
          parent_user_id: profileRow.owner_user_id,
          profile_id: inviteRow.family_profile_id,
          token,
          guest_name: guestName,
          guest_email: guestEmail || null,
          status: "pending",
        });

      if (insertError) {
        return new Response(JSON.stringify({ error: "Failed to submit request" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Notify the inviter
      await supabase.from("notifications").insert({
        user_id: profileRow.owner_user_id,
        title: "בקשת הצטרפות חדשה 📩",
        body: `${guestName} מבקש/ת להצטרף לארון המשפחתי`,
        type: "join_request",
      });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- APPROVE JOIN REQUEST (auth required, inviter only) ---
    if (action === "approve_request") {
      const { requestId } = body;
      if (!requestId) {
        return new Response(JSON.stringify({ error: "Missing requestId" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Verify the request belongs to this user
      const { data: reqRow, error: reqError } = await supabase
        .from("join_requests")
        .select("id, parent_user_id, status, guest_name, token, profile_id")
        .eq("id", requestId)
        .maybeSingle();

      if (reqError || !reqRow) {
        return new Response(JSON.stringify({ error: "Request not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (reqRow.parent_user_id !== user!.id) {
        return new Response(JSON.stringify({ error: "Not authorized" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (reqRow.status !== "pending") {
        return new Response(JSON.stringify({ error: "Request already handled" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error: updateError } = await supabase
        .from("join_requests")
        .update({ status: "approved", responded_at: new Date().toISOString() })
        .eq("id", requestId);

      if (updateError) {
        return new Response(JSON.stringify({ error: "Failed to approve" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true, guestName: reqRow.guest_name }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- REJECT JOIN REQUEST (auth required, inviter only) ---
    if (action === "reject_request") {
      const { requestId } = body;
      if (!requestId) {
        return new Response(JSON.stringify({ error: "Missing requestId" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: reqRow, error: reqError } = await supabase
        .from("join_requests")
        .select("id, parent_user_id, status")
        .eq("id", requestId)
        .maybeSingle();

      if (reqError || !reqRow) {
        return new Response(JSON.stringify({ error: "Request not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (reqRow.parent_user_id !== user!.id) {
        return new Response(JSON.stringify({ error: "Not authorized" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (reqRow.status !== "pending") {
        return new Response(JSON.stringify({ error: "Request already handled" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error: updateError } = await supabase
        .from("join_requests")
        .update({ status: "rejected", responded_at: new Date().toISOString() })
        .eq("id", requestId);

      if (updateError) {
        return new Response(JSON.stringify({ error: "Failed to reject" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- LIST JOIN REQUESTS (auth required, inviter only) ---
    if (action === "list_requests") {
      const { data: requests, error: listError } = await supabase
        .from("join_requests")
        .select("id, guest_name, guest_email, status, created_at, profile_id")
        .eq("parent_user_id", user!.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (listError) {
        return new Response(JSON.stringify({ error: "Failed to load requests" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true, requests: requests || [] }), {
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

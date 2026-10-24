// Supabase Auth Send SMS Edge Function for QuickHire
// Runs in Supabase Edge Runtime (Deno).
// Integrates Fast2SMS with native Supabase Auth Send SMS Hook.

interface SupabaseSmsHookPayload {
  user?: {
    id?: string;
    phone?: string;
    email?: string;
  };
  phone?: string;
  sms?: {
    otp?: string;
  };
  otp?: string;
}

interface Fast2SmsResponse {
  return: boolean;
  request_id?: string;
  message?: string[] | string;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, webhook-id, webhook-timestamp, webhook-signature, svix-id, svix-timestamp, svix-signature",
};

/**
 * Masks a phone number to protect user privacy in server logs.
 * Example: 9876543210 -> +91 ******3210
 */
function maskPhoneNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 4) return "****";
  const last4 = digits.slice(-4);
  return `+91 ******${last4}`;
}

/**
 * Timing-safe string comparison to protect against timing attacks.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Cryptographically verifies standard webhook signatures (HMAC-SHA256)
 * strictly following the Standard Webhooks (Svix) specification used by Supabase Auth Hooks.
 *
 * Rejects requests if:
 * - Any required header is missing (webhook-id, webhook-timestamp, webhook-signature)
 * - Timestamp is outside the 300-second replay window
 * - Computed HMAC-SHA256 signature does not match
 */
async function verifyStandardWebhookSignature(
  rawBody: string,
  headers: Headers,
  rawSecret: string
): Promise<{ valid: boolean; reason?: string }> {
  const webhookId = headers.get("webhook-id") || headers.get("svix-id");
  const webhookTimestamp = headers.get("webhook-timestamp") || headers.get("svix-timestamp");
  const webhookSignature = headers.get("webhook-signature") || headers.get("svix-signature");

  if (!webhookId || !webhookTimestamp || !webhookSignature) {
    return { valid: false, reason: "Missing required webhook signature headers (id, timestamp, or signature)." };
  }

  // Reject requests older than 300 seconds (5 minutes) to prevent replay attacks
  const timestampNum = parseInt(webhookTimestamp, 10);
  const nowInSeconds = Math.floor(Date.now() / 1000);
  if (isNaN(timestampNum) || Math.abs(nowInSeconds - timestampNum) > 300) {
    return { valid: false, reason: "Webhook timestamp expired or outside 300-second tolerance window." };
  }

  // Strip standard prefixes like "v1,whsec_" or "whsec_" if present
  let cleanSecret = rawSecret.trim();
  if (cleanSecret.startsWith("v1,whsec_")) {
    cleanSecret = cleanSecret.slice("v1,whsec_".length);
  } else if (cleanSecret.startsWith("whsec_")) {
    cleanSecret = cleanSecret.slice("whsec_".length);
  }

  try {
    let keyBytes: Uint8Array<ArrayBuffer>;
    try {
      // Decode Base64 secret key
      const normalizedBase64 = cleanSecret.replace(/-/g, "+").replace(/_/g, "/");
      const binaryString = atob(normalizedBase64);
      const buffer = new ArrayBuffer(binaryString.length);
      const view = new Uint8Array(buffer);
      for (let i = 0; i < binaryString.length; i++) {
        view[i] = binaryString.charCodeAt(i);
      }
      keyBytes = view;
    } catch {
      keyBytes = new TextEncoder().encode(cleanSecret);
    }

    const keyBuffer: ArrayBuffer = keyBytes.buffer instanceof ArrayBuffer
      ? keyBytes.buffer.slice(keyBytes.byteOffset, keyBytes.byteOffset + keyBytes.byteLength)
      : new Uint8Array(keyBytes).buffer as ArrayBuffer;

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyBuffer,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const signedPayload = new TextEncoder().encode(`${webhookId}.${webhookTimestamp}.${rawBody}`);
    const signatureBuffer = await crypto.subtle.sign("HMAC", cryptoKey, signedPayload);
    const signatureBytes = new Uint8Array(signatureBuffer);

    let binarySig = "";
    for (let i = 0; i < signatureBytes.length; i++) {
      binarySig += String.fromCharCode(signatureBytes[i]);
    }
    const computedBase64 = btoa(binarySig);

    // Header may contain multiple space-separated signatures (e.g., "v1,sig1 v1,sig2")
    const passedSignatures = webhookSignature.split(" ");
    for (const entry of passedSignatures) {
      const [version, signatureValue] = entry.split(",");
      if (version === "v1" && timingSafeEqual(signatureValue || "", computedBase64)) {
        return { valid: true };
      }
    }

    return { valid: false, reason: "Signature mismatch." };
  } catch {
    return { valid: false, reason: "Internal cryptographic verification error." };
  }
}

// Start HTTP server using native Deno.serve (standard in modern Supabase Edge Runtime)
Deno.serve(async (req: Request) => {
  // 1. Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // 2. Only allow POST requests for the SMS Auth Hook
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: { message: "Method not allowed. Use POST." } }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    // 3. Read raw request body as string first (required for HMAC signature verification)
    const rawBody = await req.text();

    // 4. Verify Supabase Auth Hook Secret (MANDATORY: Rejects unsigned or unverified requests)
    const hookSecret = Deno.env.get("SEND_SMS_HOOK_SECRET");
    if (!hookSecret) {
      console.error("[send-sms] SEND_SMS_HOOK_SECRET secret is not configured in Supabase.");
      return new Response(
        JSON.stringify({
          error: {
            message: "Authentication hook secret is unconfigured. Requests cannot be verified.",
          },
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Strictly enforce Standard Webhooks cryptographic signature (NO Bearer/token bypass)
    const verification = await verifyStandardWebhookSignature(rawBody, req.headers, hookSecret);
    if (!verification.valid) {
      return new Response(
        JSON.stringify({
          error: {
            message: `Unauthorized: ${verification.reason || "Invalid webhook signature."}`,
          },
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Retrieve Fast2SMS API Key from server-side environment secrets
    const fast2smsApiKey = Deno.env.get("FAST2SMS_API_KEY");
    if (!fast2smsApiKey) {
      console.error("[send-sms] FAST2SMS_API_KEY environment secret is not configured in Supabase.");
      return new Response(
        JSON.stringify({
          error: {
            message: "SMS service is unconfigured. Please set FAST2SMS_API_KEY in Supabase secrets.",
          },
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6. Parse Hook Payload from Supabase Auth (GoTrue)
    let payload: SupabaseSmsHookPayload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return new Response(
        JSON.stringify({ error: { message: "Invalid JSON payload in request." } }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract recipient phone and OTP token (handles standard GoTrue hook format)
    const rawPhone = payload.user?.phone || payload.phone || "";
    const otp = payload.sms?.otp || payload.otp || "";

    if (!rawPhone) {
      return new Response(
        JSON.stringify({ error: { message: "Missing recipient phone number in payload." } }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!otp) {
      return new Response(
        JSON.stringify({ error: { message: "Missing OTP token in payload." } }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 7. Clean and normalize the Indian phone number for Fast2SMS
    // Fast2SMS accepts 10-digit Indian numbers without country code.
    const digitsOnly = rawPhone.replace(/\D/g, "");
    let cleanPhone10 = digitsOnly;
    if (digitsOnly.startsWith("91") && digitsOnly.length === 12) {
      cleanPhone10 = digitsOnly.slice(2);
    }

    if (cleanPhone10.length !== 10) {
      return new Response(
        JSON.stringify({
          error: {
            message: `Fast2SMS requires a valid 10-digit Indian mobile number. Received: ${cleanPhone10.length} digits.`,
          },
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 8. Build Fast2SMS API Request based on exact configured route
    // Allowed routes:
    // - "q"   : Fast2SMS Quick SMS via international gateway (requires no DLT registration)
    // - "otp" : Fast2SMS system pre-approved DLT OTP template (requires Aadhaar KYC on Fast2SMS)
    // - "dlt" : Custom business DLT template (requires FAST2SMS_SENDER_ID and FAST2SMS_TEMPLATE_ID)
    const configuredRoute = (Deno.env.get("FAST2SMS_ROUTE") || "q").toLowerCase().trim();
    let fast2smsBody: Record<string, string>;

    if (configuredRoute === "q" || configuredRoute === "quick") {
      // Exact Fast2SMS route=q parameters per official documentation:
      // route: "q", message: string, numbers: string, flash: "0" | "1"
      fast2smsBody = {
        route: "q",
        message: `Your QuickHire verification code is ${otp}. Valid for 10 minutes. Do not share this code with anyone.`,
        numbers: cleanPhone10,
        flash: "0",
      };
    } else if (configuredRoute === "otp") {
      // Exact Fast2SMS route=otp parameters per official documentation:
      // route: "otp", variables_values: numeric string, numbers: string, flash: "0" | "1"
      fast2smsBody = {
        route: "otp",
        variables_values: otp,
        numbers: cleanPhone10,
        flash: "0",
      };
    } else if (configuredRoute === "dlt") {
      const dltSenderId = Deno.env.get("FAST2SMS_SENDER_ID");
      const dltTemplateId = Deno.env.get("FAST2SMS_TEMPLATE_ID");

      if (!dltSenderId || !dltTemplateId) {
        return new Response(
          JSON.stringify({
            error: {
              message:
                "FAST2SMS_ROUTE is set to 'dlt' but FAST2SMS_SENDER_ID or FAST2SMS_TEMPLATE_ID secret is missing.",
            },
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      fast2smsBody = {
        route: "dlt",
        sender_id: dltSenderId,
        message: dltTemplateId,
        variables_values: otp,
        numbers: cleanPhone10,
        flash: "0",
      };
    } else {
      // Strict route configuration guard: Do not silently fall back to an unexpected route!
      return new Response(
        JSON.stringify({
          error: {
            message: `Unsupported FAST2SMS_ROUTE: '${configuredRoute}'. Valid values are 'q', 'otp', or 'dlt'.`,
          },
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 9. Invoke Fast2SMS API securely from the server
    const fast2smsRes = await fetch("https://www.fast2sms.com/dev/bulkV2", {
      method: "POST",
      headers: {
        authorization: fast2smsApiKey.trim(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(fast2smsBody),
    });

    const fast2smsData: Fast2SmsResponse = await fast2smsRes.json().catch(() => ({
      return: false,
      message: ["Failed to parse JSON response from Fast2SMS provider gateway."],
    }));

    if (!fast2smsRes.ok || !fast2smsData.return) {
      const errorMsg = Array.isArray(fast2smsData.message)
        ? fast2smsData.message.join(", ")
        : fast2smsData.message || "Fast2SMS provider rejected the request.";

      // Security check: Mask recipient phone and NEVER log OTP or secrets
      console.error(
        `[send-sms] Fast2SMS dispatch failed for recipient ${maskPhoneNumber(cleanPhone10)}: ${errorMsg}`
      );

      // Return provider error cleanly to Supabase GoTrue so the authentication flow fails accurately
      return new Response(
        JSON.stringify({
          error: {
            message: `SMS provider delivery failed: ${errorMsg}`,
          },
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 10. Success: Return empty JSON object {} as required by Supabase Auth Hook specification
    // NEVER echo back the OTP or sensitive data!
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Unexpected internal server error.";
    console.error(`[send-sms] Unhandled exception in Edge Function: ${errorMsg}`);
    return new Response(
      JSON.stringify({ error: { message: errorMsg } }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

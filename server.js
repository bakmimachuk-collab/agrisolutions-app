import "dotenv/config";
import express from "express";
import { randomUUID } from "node:crypto";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

const app = express();
const port = Number(process.env.API_PORT) || 3001;
const maxMessages = 20;
const maxMessageLength = 2000;
const model = process.env.GEMINI_MODEL || "gemini-3.6-flash";
const responseLanguages = {
  en: "English",
  ha: "Nigerian Hausa",
  pcm: "Nigerian Pidgin"
};

app.use(express.json({ limit: "32kb" }));

const supabaseUrl = process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const adminClient = supabaseUrl && serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;
const superAdminEmail = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
const failedAdminAttempts = new Map();
const adminAttemptWindowMs = 15 * 60 * 1000;
const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

function requireAdminConfiguration(_req, res, next) {
  if (!adminClient) {
    return res.status(503).json({
      error: "Admin services are not configured. Set SUPABASE_SERVICE_ROLE_KEY on the API server and restart it."
    });
  }
  return next();
}

async function authenticateBearer(req) {
  const authorization = req.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token || !adminClient) return null;
  const { data, error } = await adminClient.auth.getUser(token);
  if (error || !data?.user) return null;
  let claims;
  try {
    claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
  return { user: data.user, claims };
}

async function requireAdmin(req, res, next) {
  try {
    const authenticated = await authenticateBearer(req);
    if (!authenticated) return res.status(401).json({ error: "Sign in again to continue." });
    if (authenticated.user.app_metadata?.role !== "admin") {
      return res.status(403).json({ error: "This account is not authorized to use the admin dashboard." });
    }
    const { data: profile, error } = await adminClient
      .from("profiles")
      .select("account_status")
      .eq("id", authenticated.user.id)
      .maybeSingle();
    if (error) return res.status(503).json({ error: "Could not verify the administrator account status." });
    if (!profile || profile.account_status !== "active") {
      return res.status(403).json({ error: "This administrator account is not active." });
    }
    req.admin = authenticated.user;
    req.adminClaims = authenticated.claims;
    return next();
  } catch (error) {
    console.error("Could not verify admin authorization:", error.message);
    return res.status(503).json({ error: "Could not verify admin authorization. Try again." });
  }
}

function requireRecentAdmin(req, res, next) {
  const authenticatedAt = Number(req.adminClaims?.auth_time) * 1000;
  if (!authenticatedAt || Date.now() - authenticatedAt > 15 * 60 * 1000) {
    return res.status(403).json({ error: "For security, sign out and sign in again before this action." });
  }
  return next();
}

async function writeAdminAudit(adminId, action, targetType, targetId, details = {}) {
  const { error } = await adminClient.from("admin_audit_logs").insert({
    admin_id: adminId,
    action,
    target_type: targetType,
    target_id: targetId == null ? null : String(targetId),
    details
  });
  if (error) throw error;
}

function adminError(res, error, action) {
  console.error(`Admin ${action} failed:`, error?.message || error);
  return res.status(500).json({ error: `Could not ${action}. Please try again.` });
}

async function exactCount(table, configure = (query) => query) {
  let query = adminClient.from(table).select("*", { count: "exact", head: true });
  query = configure(query);
  const { count, error } = await query;
  if (error) throw error;
  return count || 0;
}

app.post("/api/admin/bootstrap", requireAdminConfiguration, asyncRoute(async (req, res) => {
  const authenticated = await authenticateBearer(req);
  if (!authenticated) return res.status(401).json({ error: "Sign in with the verified owner account first." });
  if (!superAdminEmail) {
    return res.status(503).json({ error: "Set SUPER_ADMIN_EMAIL on the API server before initializing the administrator." });
  }
  const email = authenticated.user.email?.trim().toLowerCase();
  if (email !== superAdminEmail || !authenticated.user.email_confirmed_at) {
    return res.status(403).json({ error: "Only the verified owner email configured on the API server can initialize admin access." });
  }
  if (authenticated.user.app_metadata?.role === "admin") return res.json({ ok: true, alreadyAdmin: true });

  const { data, error } = await adminClient.auth.admin.updateUserById(authenticated.user.id, {
    app_metadata: { ...authenticated.user.app_metadata, role: "admin" }
  });
  if (error) return adminError(res, error, "initialize admin access");
  return res.json({ ok: true, userId: data.user.id });
}));

app.post("/api/admin/login-attempts", requireAdminConfiguration, asyncRoute(async (req, res) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase().slice(0, 254) : "";
  if (req.body?.succeeded !== false) return res.status(400).json({ error: "Only failed login attempts can be recorded here." });
  const now = Date.now();
  for (const [ip, attempts] of failedAdminAttempts) {
    const recent = attempts.filter(time => now - time < adminAttemptWindowMs);
    if (recent.length) failedAdminAttempts.set(ip, recent);
    else failedAdminAttempts.delete(ip);
  }
  const attempts = failedAdminAttempts.get(req.ip) || [];
  if (attempts.length >= 10) return res.status(429).json({ error: "Too many admin login attempts. Try again later." });
  attempts.push(now);
  failedAdminAttempts.set(req.ip, attempts);
  const { error } = await adminClient.from("admin_login_attempts").insert({
    attempted_email: email,
    succeeded: false
  });
  if (error) {
    console.error("Could not record failed admin login:", error.message);
    return res.status(503).json({ error: "The login attempt could not be recorded. Apply the admin dashboard migration first." });
  }
  return res.status(201).json({
    ok: true,
    ownerEmailMatches: superAdminEmail ? email === superAdminEmail : null
  });
}));

app.post("/api/presence/heartbeat", requireAdminConfiguration, asyncRoute(async (req, res) => {
  const authenticated = await authenticateBearer(req);
  if (!authenticated) return res.status(401).json({ error: "Sign in again to continue." });
  const { error } = await adminClient.from("user_presence").upsert({
    user_id: authenticated.user.id,
    last_seen_at: new Date().toISOString()
  });
  if (error) return adminError(res, error, "update account presence");
  return res.status(204).end();
}));

app.get("/api/admin/session", requireAdminConfiguration, requireAdmin, asyncRoute(async (req, res) => {
  try {
    await writeAdminAudit(req.admin.id, "admin_login", "admin", req.admin.id);
    const { error } = await adminClient.from("admin_login_attempts").insert({
      attempted_email: req.admin.email || "",
      succeeded: true,
      admin_id: req.admin.id
    });
    if (error) throw error;
    return res.json({ id: req.admin.id, email: req.admin.email, name: req.admin.user_metadata?.full_name || "" });
  } catch (error) {
    return adminError(res, error, "record the admin login");
  }
}));

app.get("/api/admin/overview", requireAdminConfiguration, requireAdmin, asyncRoute(async (_req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const week = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000);
    const online = new Date(Date.now() - 5 * 60 * 1000);
    const [
      users, crops, livestock, diagnoses, aiMessages, posts, comments, pendingReports, farmActivities,
      suspended, activeToday, activeWeek, onlineNow, recentRegistrations, recentActivity, registrationRows
    ] = await Promise.all([
      exactCount("profiles"),
      exactCount("crop_records"),
      exactCount("livestock_records"),
      exactCount("diagnoses"),
      exactCount("messages", query => query.eq("role", "user")),
      exactCount("community_posts"),
      exactCount("community_comments"),
      exactCount("community_reports", query => query.eq("status", "pending")),
      exactCount("calendar_events"),
      exactCount("profiles", query => query.eq("account_status", "suspended")),
      exactCount("user_presence", query => query.gte("last_seen_at", today.toISOString())),
      exactCount("user_presence", query => query.gte("last_seen_at", week.toISOString())),
      exactCount("user_presence", query => query.gte("last_seen_at", online.toISOString())),
      adminClient.from("profiles").select("id,display_name,region,created_at").order("created_at", { ascending: false }).limit(8),
      adminClient.from("calendar_events").select("id,user_id,title,category,start_date,created_at").order("created_at", { ascending: false }).limit(8),
      adminClient.from("profiles").select("created_at").gte("created_at", monthAgo.toISOString())
    ]);
    if (recentRegistrations.error) throw recentRegistrations.error;
    if (recentActivity.error) throw recentActivity.error;
    if (registrationRows.error) throw registrationRows.error;
    const registrationCounts = new Map();
    for (const row of registrationRows.data) {
      const day = row.created_at.slice(0, 10);
      registrationCounts.set(day, (registrationCounts.get(day) || 0) + 1);
    }
    const registrationTrend = Array.from({ length: 30 }, (_, index) => {
      const day = new Date(monthAgo);
      day.setUTCDate(day.getUTCDate() + index);
      const key = day.toISOString().slice(0, 10);
      return { date: key, count: registrationCounts.get(key) || 0 };
    });
    return res.json({
      stats: { users, farmers: users, crops, livestock, diagnoses, aiRequests: aiMessages, posts, comments, pendingReports, farmActivities, suspended, activeToday, activeWeek, onlineNow },
      recentRegistrations: recentRegistrations.data,
      recentActivity: recentActivity.data,
      registrationTrend
    });
  } catch (error) {
    return adminError(res, error, "load admin overview");
  }
}));

app.get("/api/admin/users", requireAdminConfiguration, requireAdmin, asyncRoute(async (req, res) => {
  const page = Math.max(1, Math.min(1000, Number(req.query.page) || 1));
  const perPage = 50;
  try {
    const { data: authResult, error: authError } = await adminClient.auth.admin.listUsers({ page, perPage });
    if (authError) throw authError;
    const ids = authResult.users.map(user => user.id);
    if (!ids.length) return res.json({ users: [], page, perPage, hasMore: false });
    const [profilesResult, presenceResult] = await Promise.all([
      adminClient.from("profiles").select("id,display_name,phone,region,farm_location,account_status,created_at").in("id", ids),
      adminClient.from("user_presence").select("user_id,last_seen_at").in("user_id", ids)
    ]);
    if (profilesResult.error) throw profilesResult.error;
    if (presenceResult.error) throw presenceResult.error;
    const profiles = new Map(profilesResult.data.map(profile => [profile.id, profile]));
    const presence = new Map(presenceResult.data.map(item => [item.user_id, item.last_seen_at]));
    const search = String(req.query.q || "").trim().toLowerCase();
    const regionFilter = String(req.query.region || "").trim().toLowerCase();
    const statusFilter = String(req.query.status || "").trim();
    const users = authResult.users.map(user => ({
      id: user.id,
      email: user.email || "",
      phone: user.phone || profiles.get(user.id)?.phone || "",
      lastSignInAt: user.last_sign_in_at,
      emailConfirmedAt: user.email_confirmed_at,
      profile: profiles.get(user.id) || { account_status: "active" },
      lastSeenAt: presence.get(user.id) || null
    })).filter(user => {
      const profile = user.profile;
      const matchesSearch = !search || [user.email, user.phone, profile.display_name, profile.region].some(value => String(value || "").toLowerCase().includes(search));
      const matchesRegion = !regionFilter || String(profile.region || "").toLowerCase() === regionFilter;
      const matchesStatus = !statusFilter || profile.account_status === statusFilter;
      return matchesSearch && matchesRegion && matchesStatus;
    });
    return res.json({ users, page, perPage, hasMore: authResult.users.length === perPage });
  } catch (error) {
    return adminError(res, error, "load the user directory");
  }
}));

app.patch("/api/admin/users/:id/status", requireAdminConfiguration, requireAdmin, requireRecentAdmin, asyncRoute(async (req, res) => {
  const { status, reason = "" } = req.body || {};
  if (!["active", "suspended", "deactivated"].includes(status)) return res.status(400).json({ error: "Choose a valid account status." });
  if (req.params.id === req.admin.id) return res.status(400).json({ error: "You cannot change your own administrator account status." });
  try {
    const { data: target, error: targetError } = await adminClient.auth.admin.getUserById(req.params.id);
    if (targetError || !target?.user) throw targetError || new Error("User not found");
    if (target.user.app_metadata?.role === "admin") return res.status(403).json({ error: "Administrator accounts cannot be suspended from this screen." });
    const { data: targetProfile, error: statusSchemaError } = await adminClient
      .from("profiles")
      .select("account_status")
      .eq("id", req.params.id)
      .maybeSingle();
    if (statusSchemaError) throw statusSchemaError;
    if (!targetProfile) return res.status(404).json({ error: "The farmer profile no longer exists." });
    const banDuration = status === "active" ? "none" : "876000h";
    const { error: authError } = await adminClient.auth.admin.updateUserById(req.params.id, { ban_duration: banDuration });
    if (authError) throw authError;
    const { error: profileError } = await adminClient.from("profiles").update({
      account_status: status,
      status_reason: String(reason).trim().slice(0, 500) || null,
      status_updated_at: new Date().toISOString()
    }).eq("id", req.params.id);
    if (profileError) throw profileError;
    await writeAdminAudit(req.admin.id, status === "active" ? "user_reactivated" : "user_suspended", "user", req.params.id, { status, reason: String(reason).trim().slice(0, 500) });
    return res.json({ ok: true, status });
  } catch (error) {
    return adminError(res, error, "update the account status");
  }
}));

app.get("/api/admin/reports", requireAdminConfiguration, requireAdmin, asyncRoute(async (_req, res) => {
  try {
    const { data: reports, error } = await adminClient.from("community_reports")
      .select("id,reporter_id,post_id,comment_id,reason,description,status,reviewed_by,created_at")
      .order("created_at", { ascending: false }).limit(100);
    if (error) throw error;
    const postIds = [...new Set(reports.map(item => item.post_id).filter(Boolean))];
    const commentIds = [...new Set(reports.map(item => item.comment_id).filter(Boolean))];
    const reporterIds = [...new Set(reports.map(item => item.reporter_id))];
    const [postsResult, commentsResult, profilesResult] = await Promise.all([
      postIds.length ? adminClient.from("community_posts").select("id,title,content,status").in("id", postIds) : { data: [], error: null },
      commentIds.length ? adminClient.from("community_comments").select("id,post_id,content").in("id", commentIds) : { data: [], error: null },
      reporterIds.length ? adminClient.from("profiles").select("id,display_name").in("id", reporterIds) : { data: [], error: null }
    ]);
    if (postsResult.error) throw postsResult.error;
    if (commentsResult.error) throw commentsResult.error;
    if (profilesResult.error) throw profilesResult.error;
    const posts = new Map(postsResult.data.map(item => [item.id, item]));
    const comments = new Map(commentsResult.data.map(item => [item.id, item]));
    const reporters = new Map(profilesResult.data.map(item => [item.id, item.display_name]));
    return res.json({ reports: reports.map(item => ({
      ...item,
      reporterName: reporters.get(item.reporter_id) || "AgriPlus user",
      target: item.post_id ? posts.get(item.post_id) : comments.get(item.comment_id) || null
    })) });
  } catch (error) {
    return adminError(res, error, "load community reports");
  }
}));

app.patch("/api/admin/reports/:id", requireAdminConfiguration, requireAdmin, requireRecentAdmin, asyncRoute(async (req, res) => {
  const { status } = req.body || {};
  if (!["reviewed", "actioned", "dismissed"].includes(status)) return res.status(400).json({ error: "Choose a valid report status." });
  try {
    const { data, error } = await adminClient.from("community_reports")
      .update({ status, reviewed_by: req.admin.id }).eq("id", req.params.id)
      .select("id,status").single();
    if (error) throw error;
    await writeAdminAudit(req.admin.id, "community_report_updated", "community_report", data.id, { status });
    return res.json({ report: data });
  } catch (error) {
    return adminError(res, error, "update the report");
  }
}));

app.get("/api/admin/posts", requireAdminConfiguration, requireAdmin, asyncRoute(async (_req, res) => {
  try {
    const { data, error } = await adminClient.from("community_posts")
      .select("id,user_id,title,content,category,location,status,created_at")
      .order("created_at", { ascending: false }).limit(100);
    if (error) throw error;
    return res.json({ posts: data });
  } catch (error) {
    return adminError(res, error, "load community posts");
  }
}));

app.patch("/api/admin/posts/:id", requireAdminConfiguration, requireAdmin, requireRecentAdmin, asyncRoute(async (req, res) => {
  const { status } = req.body || {};
  if (!["published", "hidden", "removed"].includes(status)) return res.status(400).json({ error: "Choose a valid post status." });
  try {
    const { data, error } = await adminClient.from("community_posts")
      .update({ status, updated_at: new Date().toISOString() }).eq("id", req.params.id)
      .select("id,status").single();
    if (error) throw error;
    await writeAdminAudit(req.admin.id, "community_post_moderated", "community_post", data.id, { status });
    return res.json({ post: data });
  } catch (error) {
    return adminError(res, error, "moderate the community post");
  }
}));

app.post("/api/admin/announcements", requireAdminConfiguration, requireAdmin, requireRecentAdmin, asyncRoute(async (req, res) => {
  const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  const target = typeof req.body?.target === "string" ? req.body.target : "all";
  const priority = req.body?.priority === "critical" ? "critical" : "information";
  if (!title || title.length > 180 || !message || message.length > 4000) {
    return res.status(400).json({ error: "Add a title (up to 180 characters) and message (up to 4,000 characters)." });
  }
  try {
    let profileQuery = adminClient.from("profiles").select("id");
    if (target.startsWith("region:")) profileQuery = profileQuery.eq("region", target.slice(7).trim());
    const { data: profiles, error: profilesError } = await profileQuery;
    if (profilesError) throw profilesError;
    if (!profiles.length) return res.status(400).json({ error: "No user accounts match that announcement audience." });
    const eventId = randomUUID();
    const rows = profiles.map(profile => ({
      user_id: profile.id,
      category: "announcement",
      priority,
      title,
      message,
      event_key: `admin-announcement:${eventId}`
    }));
    let delivered = 0;
    for (let offset = 0; offset < rows.length; offset += 200) {
      const { error } = await adminClient.from("notifications").insert(rows.slice(offset, offset + 200));
      if (error) {
        if (delivered > 0) {
          try {
            await writeAdminAudit(req.admin.id, "announcement_partial_failure", "announcement", eventId, {
              target, delivered, total: rows.length, priority, title
            });
          } catch (auditError) {
            console.error("Could not record partial announcement delivery:", auditError.message);
          }
          return res.status(502).json({
            error: `Announcement was delivered to ${delivered} of ${rows.length} accounts before delivery failed. Check the audit log before retrying.`
          });
        }
        throw error;
      }
      delivered += Math.min(200, rows.length - offset);
    }
    await writeAdminAudit(req.admin.id, "announcement_sent", "announcement", eventId, { target, recipientCount: delivered, priority, title });
    return res.status(201).json({ ok: true, recipientCount: delivered });
  } catch (error) {
    return adminError(res, error, "send the announcement");
  }
}));

app.get("/api/admin/audit", requireAdminConfiguration, requireAdmin, asyncRoute(async (_req, res) => {
  try {
    const [audit, attempts] = await Promise.all([
      adminClient.from("admin_audit_logs").select("id,admin_id,action,target_type,target_id,details,created_at").order("created_at", { ascending: false }).limit(100),
      adminClient.from("admin_login_attempts").select("id,attempted_email,succeeded,admin_id,created_at").order("created_at", { ascending: false }).limit(100)
    ]);
    if (audit.error) throw audit.error;
    if (attempts.error) throw attempts.error;
    return res.json({ audit: audit.data, loginAttempts: attempts.data });
  } catch (error) {
    return adminError(res, error, "load admin audit records");
  }
}));

app.post("/api/chat", async (req, res) => {
  const { messages } = req.body ?? {};
  const language = req.body?.language ?? "en";

  if (!Array.isArray(messages) || messages.length === 0 || messages.length > maxMessages) {
    return res.status(400).json({ error: `Send between 1 and ${maxMessages} messages.` });
  }

  if (!Object.hasOwn(responseLanguages, language)) {
    return res.status(400).json({ error: "Choose English, Hausa, or Nigerian Pidgin for the AI response language." });
  }

  const validMessages = messages.every((message) =>
    message &&
    ["user", "assistant"].includes(message.role) &&
    typeof message.text === "string" &&
    message.text.trim().length > 0 &&
    message.text.length <= maxMessageLength
  );

  if (!validMessages) {
    return res.status(400).json({ error: `Each message must be text no longer than ${maxMessageLength} characters.` });
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return res.status(503).json({ error: "AI is not configured yet. Add GEMINI_API_KEY to your local .env file and restart the app." });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model,
      contents: messages.map(({ role, text }) => ({
        role: role === "assistant" ? "model" : "user",
        parts: [{ text }]
      })),
      config: {
        systemInstruction: `You are AgriPlus AI, the intelligent agricultural assistant for MBs Agro Solution. Give useful, clear answers with enough detail for a farmer to act: explain the likely issue or reasoning, then give practical next steps, using short paragraphs or numbered steps when helpful. Do not give one-line answers to questions that need explanation, but avoid padding simple answers. Ask a focused clarifying question when important details are missing.

You are an intelligent agricultural assistant designed to help Nigerian farmers. Your communication must respect the user's preferred language. You support English, Nigerian Hausa, and Nigerian Pidgin. Always respond in ${responseLanguages[language]} unless the user explicitly requests another language. When speaking Hausa, use natural, clear Nigerian Hausa that ordinary farmers can understand. When speaking Nigerian Pidgin, use natural Nigerian Pidgin rather than Ghanaian Pidgin or awkward mixtures of English. Explain difficult agricultural terms using simple language. Prioritize agricultural accuracy. Never invent a disease diagnosis or recommend unsafe chemical applications. When uncertain, clearly explain the uncertainty and recommend appropriate professional agricultural assistance. Maintain the same quality of agricultural advice regardless of the selected language.

Do not claim certainty from limited information, and recommend a qualified local agricultural or veterinary professional for urgent or serious issues.`,
        maxOutputTokens: 1400,
        temperature: 0.4
      }
    });

    const text = response.text?.trim();
    if (!text) {
      console.error("Gemini returned an empty chat response.");
      return res.status(502).json({ error: "The AI returned an empty response. Please try again." });
    }

    return res.json({ text });
  } catch (error) {
    const status = Number(error?.status) || 502;
    const causeCode = error?.cause?.code;
    if (["UND_ERR_CONNECT_TIMEOUT", "ECONNRESET", "ENOTFOUND", "ETIMEDOUT", "ECONNREFUSED"].includes(causeCode)) {
      console.error(`Gemini connection failed (${causeCode}).`);
      return res.status(503).json({
        error: "Could not connect to Google Gemini. Check this server's internet connection, DNS, firewall, or proxy settings."
      });
    }

    console.error(`Gemini chat request failed (status ${status}).`);
    return res.status(status === 429 ? 429 : 502).json({
      error: status === 429
        ? "The AI service is busy or its free-tier limit was reached. Please try again later."
        : status === 404
          ? `Gemini could not find model "${model}". Remove any GEMINI_MODEL override from .env or set it to gemini-3.6-flash, then restart the API server.`
        : status === 400
          ? "Gemini rejected the request. Check the configured model and chat request."
          : status === 401 || status === 403
            ? "Gemini rejected the API key. Verify GEMINI_API_KEY in the server's .env file."
            : "The AI service could not answer right now. Please try again."
    });
  }
});

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "API endpoint not found." });
});

app.use((error, _req, res, next) => {
  if (res.headersSent) return next(error);

  if (error?.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Request body must be valid JSON." });
  }

  if (error?.type === "entity.too.large") {
    return res.status(413).json({ error: "Request body is too large." });
  }

  console.error("API request failed before reaching a route.");
  return res.status(500).json({ error: "The API could not process the request." });
});

app.listen(port, () => {
  console.log(`MBs Agro Solution API listening on http://localhost:${port}`);
});

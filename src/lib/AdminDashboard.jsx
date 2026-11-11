import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Activity, AlertTriangle, ArrowLeft, BarChart3, Bell, Check, ChevronLeft, ChevronRight, Download, Eye, EyeOff, FileText, LayoutDashboard, LogOut, MessageSquare, RefreshCw, Search, ShieldCheck, Users, X } from "lucide-react";
import { useAuth } from "./AuthContext.jsx";

async function adminRequest(client, path, options = {}) {
  const { data: { session } } = await client.auth.getSession();
  if (!session?.access_token) throw new Error("Your session expired. Sign in again.");
  const response = await fetch(`/api/admin/${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      ...options.headers
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {})
  });
  let result = {};
  try { result = await response.json(); } catch { result = {}; }
  if (!response.ok) throw new Error(result.error || `Admin request failed (${response.status}).`);
  return result;
}

function formatDate(value) {
  return value ? new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";
}

function csvCell(value) {
  const text = String(value ?? "");
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

function downloadCsv(filename, rows) {
  const content = rows.map(row => row.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function AdminLogin() {
  const { client, configured, authError } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [recoveringPassword, setRecoveringPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const submit = async event => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (!configured || !client) throw new Error("Connect Supabase before using admin sign-in.");
      if (recoveringPassword) {
        const { error: recoveryError } = await client.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/reset-password`
        });
        if (recoveryError) throw recoveryError;
        setNotice("Supabase accepted the reset request, but for privacy this does not confirm that the email belongs to an account or that a message was delivered. If no link arrives, verify this exact address under Supabase Authentication → Users and confirm it is the verified owner address configured as SUPER_ADMIN_EMAIL. Check spam, allow the /reset-password URL in Authentication → URL Configuration, and inspect Auth logs and email/SMTP delivery settings.");
        return;
      }
      const { error: signInError } = await client.auth.signInWithPassword({ email: email.trim(), password });
      if (signInError) {
        let message = /invalid login credentials/i.test(signInError.message)
          ? "Supabase rejected this email and password; it cannot tell which one is wrong. Confirm this exact email is a verified user in the same Supabase project and matches SUPER_ADMIN_EMAIL in the API server's .env, then check the account password. For privacy, the app cannot reveal whether an email belongs to an account."
          : signInError.message;
        let auditMessage = "";
        try {
          const response = await fetch("/api/admin/login-attempts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: email.trim(), succeeded: false })
          });
          const result = await response.json().catch(() => ({}));
          if (!response.ok) {
            auditMessage = ` Failed-login logging is unavailable: ${result.error || response.statusText}`;
          } else if (/invalid login credentials/i.test(signInError.message) && result.ownerEmailMatches === false) {
            message = "This email does not match the administrator email configured on the API server (SUPER_ADMIN_EMAIL). Check the email for a typo or correct that server setting.";
          } else if (/invalid login credentials/i.test(signInError.message) && result.ownerEmailMatches === true) {
            message = "This email matches the administrator email configured on the API server. Supabase rejected the sign-in, so the password may be wrong. If you are sure it is correct, confirm this user exists and the email is verified in the same Supabase project, then use Forgot password? to reset it.";
          }
        } catch {
          auditMessage = " Failed-login logging is unavailable because the API server could not be reached.";
        }
        throw new Error(`${message}${auditMessage ? ` ${auditMessage.trim()}` : ""}`);
      }

      const { data: { session } } = await client.auth.getSession();
      if (!session?.access_token) throw new Error("Supabase did not start a verified session. Confirm the owner email and try again.");
      const bootstrapResponse = await fetch("/api/admin/bootstrap", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      const bootstrap = await bootstrapResponse.json().catch(() => ({}));
      if (!bootstrapResponse.ok) throw new Error(bootstrap.error || "This account is not permitted to initialize admin access.");

      const { error: refreshError } = await client.auth.refreshSession();
      if (refreshError) throw refreshError;
      const { data: { session: refreshedSession } } = await client.auth.getSession();
      const verifyResponse = await fetch("/api/admin/session", {
        headers: { Authorization: `Bearer ${refreshedSession.access_token}` }
      });
      const verified = await verifyResponse.json().catch(() => ({}));
      if (!verifyResponse.ok) throw new Error(verified.error || "Admin access could not be verified.");
      navigate("/admin", { replace: true });
    } catch (requestError) {
      if (!recoveringPassword) await client?.auth.signOut();
      const message = requestError.message || "Could not complete the request.";
      setError(recoveringPassword && /rate limit/i.test(message)
        ? "Supabase is temporarily limiting recovery emails. Wait before trying again, then check your inbox and spam folder."
        : message);
    } finally {
      setBusy(false);
    }
  };

  return <main className="auth-page admin-login-page">
    <section className="card auth-card">
      <div className="brand-mark admin-login-mark"><ShieldCheck size={23}/></div>
      <div className="eyebrow">AGRIPLUS PLATFORM ADMIN</div>
      <h1>Administrator sign in</h1>
      <p className="auth-intro">{recoveringPassword ? "Enter the verified owner email configured on the API server. Supabase sends a password-reset link by email, not a numeric verification code." : "This separate admin area only accepts the verified owner email configured on the API server."}</p>
      {error && <div className="auth-message error" role="alert">{error}</div>}
      {notice && <div className="auth-message success" role="status">{notice}</div>}
      {authError && <div className="auth-message error" role="alert">{authError}</div>}
      {!configured && <div className="auth-message error" role="alert">Supabase is not configured in this application.</div>}
      <form className="form-grid" onSubmit={submit}>
        <label>Email<input type="email" autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} required/></label>
        {!recoveringPassword && <>
          <div className="admin-password-field">
            <label htmlFor="admin-password">Password</label>
            <div className="admin-password-input">
              <input id="admin-password" type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required/>
              <button type="button" className="admin-password-toggle" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword}>
                {showPassword ? <EyeOff size={17}/> : <Eye size={17}/>}
              </button>
            </div>
          </div>
        </>}
        <button className="primary full" disabled={busy || !configured || !client || Boolean(authError)}>{busy ? (recoveringPassword ? "Sending reset link…" : "Verifying secure access…") : recoveringPassword ? "Send password reset link" : "Sign in securely"}</button>
      </form>
      <button type="button" className="auth-link" onClick={() => {setRecoveringPassword(value => !value);setError("");setNotice("");}} disabled={busy}>
        {recoveringPassword ? "Back to sign in" : "Forgot password?"}
      </button>
      <Link className="admin-return-link" to="/dashboard"><ArrowLeft size={15}/> Return to AgriPlus</Link>
    </section>
  </main>;
}

const navigation = [
  ["overview", "Overview", LayoutDashboard],
  ["users", "Users & farmers", Users],
  ["reports", "Reports", AlertTriangle],
  ["community", "Community", MessageSquare],
  ["announcements", "Announcements", Bell],
  ["audit", "Audit log", FileText]
];

export function AdminDashboard() {
  const { client, signOut } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState("overview");
  const [admin, setAdmin] = useState(null);
  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState([]);
  const [hasMoreUsers, setHasMoreUsers] = useState(false);
  const [reports, setReports] = useState([]);
  const [posts, setPosts] = useState([]);
  const [audit, setAudit] = useState([]);
  const [loginAttempts, setLoginAttempts] = useState([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [regionFilter, setRegionFilter] = useState("");
  const [userPage, setUserPage] = useState(1);
  const [announcement, setAnnouncement] = useState({ title: "", message: "", target: "all", region: "", priority: "information" });
  const [recipientCount, setRecipientCount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const initialized = useRef(false);
  const userRequestId = useRef(0);

  const loadOverview = useCallback(async () => {
    const data = await adminRequest(client, "overview");
    setOverview(data);
  }, [client]);

  const loadUsers = useCallback(async () => {
    const requestId = ++userRequestId.current;
    const params = new URLSearchParams({ page: String(userPage) });
    if (query.trim()) params.set("q", query.trim());
    if (statusFilter) params.set("status", statusFilter);
    if (regionFilter.trim()) params.set("region", regionFilter.trim());
    const data = await adminRequest(client, `users?${params}`);
    if (requestId === userRequestId.current) {
      setUsers(data.users);
      setHasMoreUsers(data.hasMore);
    }
  }, [client, userPage, query, statusFilter, regionFilter]);

  const loadTab = useCallback(async (selected = tab) => {
    if (selected === "overview") return loadOverview();
    if (selected === "users") return loadUsers();
    if (selected === "reports") return setReports((await adminRequest(client, "reports")).reports);
    if (selected === "community") return setPosts((await adminRequest(client, "posts")).posts);
    if (selected === "audit") {
      const data = await adminRequest(client, "audit");
      setAudit(data.audit);
      setLoginAttempts(data.loginAttempts);
    }
  }, [client, loadOverview, loadUsers, tab]);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    setLoading(true);
    Promise.all([adminRequest(client, "session"), loadOverview()])
      .then(([session]) => setAdmin(session))
      .catch(loadError => setError(loadError.message))
      .finally(() => setLoading(false));
  }, [client, loadOverview]);

  useEffect(() => {
    if (tab === "overview") return;
    loadTab(tab).catch(loadError => setError(loadError.message));
  }, [tab, loadTab]);

  const refresh = async () => {
    setLoading(true);
    setError("");
    try { await loadTab(tab); }
    catch (loadError) { setError(loadError.message); }
    finally { setLoading(false); }
  };

  const setAccountStatus = async user => {
    const nextStatus = user.profile.account_status === "active" ? "suspended" : "active";
    if (!window.confirm(`${nextStatus === "active" ? "Reactivate" : "Suspend"} ${user.email || user.phone || "this account"}?`)) return;
    const reason = nextStatus === "active" ? "" : window.prompt("Reason for suspension (optional):", "") || "";
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await adminRequest(client, `users/${encodeURIComponent(user.id)}/status`, {
        method: "PATCH",
        body: { status: nextStatus, reason }
      });
      setNotice(`Account ${nextStatus === "active" ? "reactivated" : "suspended"}.`);
      await Promise.all([loadUsers(), loadOverview()]);
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  };

  const updateReport = async (report, status) => {
    setBusy(true);
    setError("");
    try {
      await adminRequest(client, `reports/${encodeURIComponent(report.id)}`, { method: "PATCH", body: { status } });
      setReports(current => current.map(item => item.id === report.id ? { ...item, status } : item));
      setNotice("Report status updated.");
      await loadOverview();
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  };

  const updatePost = async (post, status) => {
    if (!window.confirm(`Change this post status to "${status}"?`)) return;
    setBusy(true);
    setError("");
    try {
      await adminRequest(client, `posts/${encodeURIComponent(post.id)}`, { method: "PATCH", body: { status } });
      setPosts(current => current.map(item => item.id === post.id ? { ...item, status } : item));
      setNotice("Community post updated.");
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  };

  const sendAnnouncement = async event => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    setRecipientCount(null);
    try {
      const target = announcement.target === "region" ? `region:${announcement.region.trim()}` : announcement.target;
      const result = await adminRequest(client, "announcements", { method: "POST", body: { ...announcement, target } });
      setRecipientCount(result.recipientCount);
      setNotice("In-app announcement sent successfully.");
      setAnnouncement(current => ({ ...current, title: "", message: "" }));
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  };

  const logout = async () => {
    const result = await signOut();
    if (result?.error) { setError(result.error.message); return; }
    navigate("/admin/login", { replace: true });
  };

  const exportUsers = () => downloadCsv("agriplus-users.csv", [
    ["Name", "Email", "Phone", "Region", "Account status", "Registered", "Last sign in", "Last active"],
    ...users.map(user => [user.profile.display_name, user.email, user.phone, user.profile.region, user.profile.account_status, user.profile.created_at, user.lastSignInAt, user.lastSeenAt])
  ]);

  const pageTitle = useMemo(() => navigation.find(item => item[0] === tab)?.[1] || "Overview", [tab]);
  const stats = overview?.stats;

  return <main className="admin-app">
    <header className="admin-topbar">
      <Link className="admin-brand" to="/dashboard"><span className="brand-mark"><ShieldCheck size={22}/></span><span>MBs Agro<br/><small>Platform admin</small></span></Link>
      <div className="admin-heading"><span className="eyebrow">AGRIPLUS PLATFORM ADMIN</span><h1>{pageTitle}</h1></div>
      <div className="admin-top-actions"><Link className="outline" to="/dashboard"><ArrowLeft size={15}/> Farmer app</Link><button className="outline" onClick={refresh} disabled={loading}><RefreshCw size={15}/> Refresh</button><button className="outline" onClick={logout}><LogOut size={15}/> Sign out</button></div>
    </header>
    <nav className="admin-nav" aria-label="Admin navigation">
      {navigation.map(([id, label, Icon]) => <button key={id} aria-current={tab === id ? "page" : undefined} className={tab === id ? "active" : ""} onClick={() => { setTab(id); setError(""); setNotice(""); }}><Icon size={17}/>{label}</button>)}
    </nav>
    <section className="admin-main">
      <div className="admin-content">
        <div className="admin-notice"><ShieldCheck size={17}/> Privileged actions are verified by the API server and recorded in the audit log. Sensitive changes require a recent sign-in.</div>
        {error && <div className="auth-message error" role="alert">{error}{/not authorized|sign in again|not active/i.test(error) && <> <Link to="/admin/login">Return to admin sign in</Link></>}</div>}
        {notice && <div className="auth-message success" role="status">{notice}{recipientCount !== null ? ` Recipients: ${recipientCount}.` : ""}</div>}
        {loading && !stats ? <div className="card admin-empty">Loading verified platform data…</div> : null}
        {tab === "overview" && stats && <section>
          <div className="admin-stat-grid">
            {[["Registered users", stats.users, Users], ["Online now", stats.onlineNow, Activity], ["Active today", stats.activeToday, BarChart3], ["Active this week", stats.activeWeek, BarChart3], ["Crops", stats.crops, FileText], ["Livestock", stats.livestock, Users], ["AI diagnoses", stats.diagnoses, Activity], ["AI requests", stats.aiRequests, MessageSquare], ["Community posts", stats.posts, MessageSquare], ["Pending reports", stats.pendingReports, AlertTriangle], ["Suspended accounts", stats.suspended, ShieldCheck], ["Farm activities", stats.farmActivities, LayoutDashboard]].map(([label, value, Icon]) => <article className="card admin-stat" key={label}><span><Icon size={18}/></span><div><small>{label}</small><strong>{Number(value || 0).toLocaleString()}</strong></div></article>)}
          </div>
          <section className="card admin-panel admin-growth"><div className="admin-panel-head"><div><h2>New registrations</h2><p>Actual account creation records over the last 14 days.</p></div></div>
            <div className="admin-growth-chart" role="img" aria-label="Daily new account registrations over the last 14 days">
              {(overview.registrationTrend || []).slice(-14).map(item => {
                const maxCount = Math.max(1, ...overview.registrationTrend.slice(-14).map(day => day.count));
                return <div className="admin-growth-day" key={item.date} title={`${item.date}: ${item.count} new accounts`}><span className="admin-growth-bar" style={{ height: `${item.count / maxCount * 100}%` }}/><small>{item.date.slice(8)}</small></div>;
              })}
            </div>
          </section>
          <div className="admin-panels">
            <section className="card admin-panel"><div className="admin-panel-head"><h2>Recent registrations</h2><button className="auth-link" onClick={() => setTab("users")}>Open user directory <ChevronRight size={14}/></button></div>
              {overview.recentRegistrations?.length ? <div className="admin-list">{overview.recentRegistrations.map(item => <article key={item.id}><span className="admin-avatar">{(item.display_name || "F").slice(0, 1).toUpperCase()}</span><div><strong>{item.display_name || "Farmer account"}</strong><small>{item.region || "Location not provided"} · {formatDate(item.created_at)}</small></div></article>)}</div> : <div className="admin-empty">No registered farmers found yet.</div>}
            </section>
            <section className="card admin-panel"><div className="admin-panel-head"><h2>Recent farm activities</h2></div>
              {overview.recentActivity?.length ? <div className="admin-list">{overview.recentActivity.map(item => <article key={item.id}><span className="admin-avatar"><Activity size={16}/></span><div><strong>{item.title}</strong><small>{item.category} · {item.start_date} · account {item.user_id.slice(0, 8)}</small></div></article>)}</div> : <div className="admin-empty">No farm calendar activity has been recorded.</div>}
            </section>
          </div>
          <p className="admin-footnote">Online means a signed-in account sent a presence heartbeat in the last five minutes. AI request totals count saved user messages only; unsaved AI API calls are not available in the current data model.</p>
        </section>}

        {tab === "users" && <section className="card admin-panel">
          <div className="admin-panel-head"><div><h2>User and farmer directory</h2><p>Search the current page of up to 50 accounts. CSV export includes the visible page. Email comes from Supabase Auth.</p></div><button className="outline" onClick={exportUsers} disabled={!users.length}><Download size={15}/> Export CSV</button></div>
          <div className="admin-filters"><label className="admin-search"><Search size={16}/><input placeholder="Search name, email, phone, region" value={query} onChange={event => { setUserPage(1); setQuery(event.target.value); }}/></label><select aria-label="Filter by account status" value={statusFilter} onChange={event => { setUserPage(1); setStatusFilter(event.target.value); }}><option value="">All statuses</option><option value="active">Active</option><option value="suspended">Suspended</option><option value="deactivated">Deactivated</option></select><input aria-label="Filter by exact region" placeholder="Exact region" value={regionFilter} onChange={event => { setUserPage(1); setRegionFilter(event.target.value); }}/></div>
          {users.length ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Farmer</th><th>Location</th><th>Status</th><th>Registered</th><th>Last active</th><th>Actions</th></tr></thead><tbody>{users.map(user => <tr key={user.id}><td><strong>{user.profile.display_name || "Farmer"}</strong><small>{user.email || user.phone || user.id}</small></td><td>{user.profile.region || "—"}</td><td><span className={`admin-status ${user.profile.account_status || "active"}`}>{user.profile.account_status || "active"}</span></td><td>{formatDate(user.profile.created_at)}</td><td>{formatDate(user.lastSeenAt || user.lastSignInAt)}</td><td><button className="outline admin-action" disabled={busy} onClick={() => setAccountStatus(user)}>{user.profile.account_status === "active" ? "Suspend" : "Reactivate"}</button></td></tr>)}</tbody></table></div> : <div className="admin-empty">{loading ? "Loading accounts…" : "No users match these filters on this page."}</div>}
          <div className="admin-pagination"><button className="outline" disabled={userPage <= 1 || loading} onClick={() => setUserPage(value => value - 1)}><ChevronLeft size={15}/> Previous</button><span>Page {userPage}</span><button className="outline" disabled={!hasMoreUsers || loading} onClick={() => setUserPage(value => value + 1)}>Next <ChevronRight size={15}/></button></div>
        </section>}

        {tab === "reports" && <section className="card admin-panel"><div className="admin-panel-head"><div><h2>Community reports</h2><p>Review submitted reports and record a resolution.</p></div></div>
          {reports.length ? <div className="admin-record-list">{reports.map(report => <article key={report.id}><div className="admin-record-head"><div><strong>{report.reason}</strong><small>Reported by {report.reporterName} · {formatDate(report.created_at)}</small></div><span className={`admin-status ${report.status}`}>{report.status}</span></div><p>{report.description || "No additional details."}</p><div className="admin-reported-target">{report.target?.title || report.target?.content || "Reported content is no longer available"}</div><div className="admin-record-actions"><button className="outline" disabled={busy || report.status === "reviewed"} onClick={() => updateReport(report, "reviewed")}>Mark reviewed</button><button className="primary" disabled={busy || report.status === "actioned"} onClick={() => updateReport(report, "actioned")}><Check size={14}/> Actioned</button><button className="outline" disabled={busy || report.status === "dismissed"} onClick={() => updateReport(report, "dismissed")}><X size={14}/> Dismiss</button></div></article>)}</div> : <div className="admin-empty">No community reports have been filed.</div>}
        </section>}

        {tab === "community" && <section className="card admin-panel"><div className="admin-panel-head"><div><h2>Community moderation</h2><p>Hide inappropriate posts or restore a post after review.</p></div></div>
          {posts.length ? <div className="admin-record-list">{posts.map(post => <article key={post.id}><div className="admin-record-head"><div><strong>{post.title}</strong><small>{post.category} · {post.location || "No location"} · {formatDate(post.created_at)}</small></div><span className={`admin-status ${post.status}`}>{post.status}</span></div><p className="admin-post-content">{post.content}</p><div className="admin-record-actions">{post.status !== "published" && <button className="outline" disabled={busy} onClick={() => updatePost(post, "published")}>Restore post</button>}{post.status !== "hidden" && <button className="outline" disabled={busy} onClick={() => updatePost(post, "hidden")}>Hide post</button>}{post.status !== "removed" && <button className="outline admin-danger" disabled={busy} onClick={() => updatePost(post, "removed")}>Remove post</button>}</div></article>)}</div> : <div className="admin-empty">No community posts have been published.</div>}
        </section>}

        {tab === "announcements" && <section className="card admin-panel admin-announcement"><div className="admin-panel-head"><div><h2>Send an in-app announcement</h2><p>Notifications are saved to selected users’ existing AgriPlus alert inboxes.</p></div></div>
          <form className="form-grid" onSubmit={sendAnnouncement}><label>Title<input maxLength={180} required value={announcement.title} onChange={event => setAnnouncement(current => ({ ...current, title: event.target.value }))}/></label><label>Message<textarea rows="5" maxLength={4000} required value={announcement.message} onChange={event => setAnnouncement(current => ({ ...current, message: event.target.value }))}/></label><div className="admin-form-row"><label>Audience<select value={announcement.target} onChange={event => setAnnouncement(current => ({ ...current, target: event.target.value }))}><option value="all">All registered users</option><option value="farmers">Farmers</option><option value="region">Users in a region</option></select></label>{announcement.target === "region" && <label>Exact profile region<input required value={announcement.region} onChange={event => setAnnouncement(current => ({ ...current, region: event.target.value }))}/></label>}<label>Priority<select value={announcement.priority} onChange={event => setAnnouncement(current => ({ ...current, priority: event.target.value }))}><option value="information">Information</option><option value="critical">Urgent</option></select></label></div><p className="admin-footnote">Announcements are delivered in-app immediately. Push, email, scheduling, and open-rate tracking are not configured.</p><button className="primary" disabled={busy}><Bell size={16}/>{busy ? "Sending…" : "Send announcement"}</button></form>
        </section>}

        {tab === "audit" && <div className="admin-panels admin-audit-panels"><section className="card admin-panel"><div className="admin-panel-head"><h2>Administrative activity</h2></div>{audit.length ? <div className="admin-record-list">{audit.map(item => <article key={item.id}><div className="admin-record-head"><div><strong>{item.action.replaceAll("_", " ")}</strong><small>{item.target_type}{item.target_id ? ` · ${item.target_id}` : ""}</small></div><time>{formatDate(item.created_at)}</time></div>{Object.keys(item.details || {}).length > 0 && <code>{JSON.stringify(item.details)}</code>}</article>)}</div> : <div className="admin-empty">No admin actions have been recorded.</div>}</section><section className="card admin-panel"><div className="admin-panel-head"><h2>Admin login attempts</h2></div>{loginAttempts.length ? <div className="admin-record-list">{loginAttempts.map(item => <article key={item.id}><div className="admin-record-head"><div><strong>{item.succeeded ? "Successful sign-in" : "Failed sign-in"}</strong><small>{item.attempted_email || "No email provided"}</small></div><time>{formatDate(item.created_at)}</time></div></article>)}</div> : <div className="admin-empty">No admin login attempts recorded.</div>}</section></div>}
      </div>
    </section>
  </main>;
}

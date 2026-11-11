import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "./AuthContext.jsx";
import { Localize } from "../i18n.jsx";

const normalizePhone = (value) => value.replace(/[()\s-]/g, "");

function PasswordInput({ id, label, value, onChange, autoComplete, minLength }) {
  const [visible, setVisible] = useState(false);
  return <div className="auth-password-field">
    <label htmlFor={id}>{label}</label>
    <div className="auth-password-input">
      <input id={id} type={visible ? "text" : "password"} autoComplete={autoComplete} value={value} onChange={onChange} required minLength={minLength}/>
      <button type="button" className="auth-password-toggle" onClick={() => setVisible(value => !value)} aria-label={visible ? "Hide password" : "Show password"} aria-pressed={visible}>
        {visible ? <EyeOff size={17}/> : <Eye size={17}/>}
      </button>
    </div>
  </div>;
}

export default function AuthScreen({ recovery = false }) {
  const { client } = useAuth();
  const [mode, setMode] = useState(recovery ? "reset" : "login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("+234");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [otpPurpose, setOtpPurpose] = useState("login");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (operation) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { error: requestError } = await operation();
      if (requestError) throw requestError;
    } catch (requestError) {
      setError(requestError?.message || "The request could not be completed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const requestPhoneOtp = async (purpose, phoneValue = phone) => {
    const target = normalizePhone(phoneValue);
    if (!/^\+[1-9]\d{7,14}$/.test(target)) {
      setError("Enter a valid phone number in international format, for example +2348012345678.");
      return;
    }
    setOtpPurpose(purpose);
    await run(async () => {
      let result;
      if (purpose === "verify") {
        result = await client.auth.updateUser({ phone: target });
      } else {
        result = await client.auth.signInWithOtp({
          phone: target,
          options: { shouldCreateUser: false }
        });
      }
      if (result.error) return result;
      setMode("otp");
      setNotice(purpose === "verify" ? "A verification code was sent to your phone." : "A sign-in code was sent to your phone.");
      return result;
    });
  };

  const verifyOtp = async (event) => {
    event.preventDefault();
    await run(async () => {
      const type = otpPurpose === "verify" ? "phone_change" : "sms";
      const result = await client.auth.verifyOtp({
        phone: normalizePhone(phone),
        token: otp.trim(),
        type
      });
      if (result.error) return result;
      if (otpPurpose === "recovery") {
        const passwordResult = await client.auth.updateUser({ password });
        if (passwordResult.error) return passwordResult;
        setNotice("Your password was updated.");
      } else if (otpPurpose === "verify") {
        setNotice("Your phone number is verified.");
      } else {
        setNotice("You are signed in.");
      }
      setMode("login");
      return result;
    });
  };

  const submit = async (event) => {
    event.preventDefault();
    if (mode === "reset" || mode === "phone-reset") {
      if (password.length < 8) {
        setError("Choose a password with at least 8 characters.");
        return;
      }
      if (password !== confirmPassword) {
        setError("The passwords do not match.");
        return;
      }
      if (mode === "phone-reset") {
        setOtpPurpose("recovery");
        setMode("otp");
        return;
      }
      await run(async () => {
        const result = await client.auth.updateUser({ password });
        if (!result.error) setNotice("Your password was updated. Return to sign in and use your new password.");
        return result;
      });
      return;
    }

    if (mode === "register") {
      if (!/^\+[1-9]\d{7,14}$/.test(normalizePhone(phone))) {
        setError("Enter a valid phone number in international format, for example +2348012345678.");
        return;
      }
      if (password.length < 8) {
        setError("Choose a password with at least 8 characters.");
        return;
      }
      if (password !== confirmPassword) {
        setError("The passwords do not match.");
        return;
      }
      await run(async () => {
        const result = await client.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
            data: {
              full_name: name.trim(),
              phone: normalizePhone(phone),
              date_of_birth: dateOfBirth,
              gender
            }
          }
        });
        if (!result.error) {
          setNotice("Check your email for the verification link. After verifying, sign in and verify your phone from your profile settings.");
          setMode("login");
        }
        return result;
      });
      return;
    }

    if (mode === "recover") {
      if (identifier.includes("@")) {
        await run(async () => {
          const result = await client.auth.resetPasswordForEmail(identifier.trim(), {
            redirectTo: `${window.location.origin}/reset-password`
          });
          if (!result.error) setNotice("If the account exists, Supabase has sent a password-reset link (not a numeric code). Check your inbox and spam folder. If it does not arrive, check Supabase Auth email delivery/SMTP settings and the Auth logs.");
          return result;
        });
      } else {
        setPhone(identifier);
        setOtpPurpose("recovery");
        const target = normalizePhone(identifier);
        if (!/^\+[1-9]\d{7,14}$/.test(target)) {
          setError("Enter the account phone number in international format, for example +2348012345678.");
          return;
        }
        await run(async () => {
          const result = await client.auth.signInWithOtp({
            phone: target,
            options: { shouldCreateUser: false }
          });
          if (!result.error) {
            setMode("phone-reset");
            setNotice("A recovery code was sent to the phone number, if it belongs to an account.");
          }
          return result;
        });
      }
      return;
    }

    await run(async () => {
      const trimmed = identifier.trim();
      const credentials = trimmed.includes("@")
        ? { email: trimmed, password }
        : { phone: normalizePhone(trimmed), password };
      return client.auth.signInWithPassword(credentials);
    });
  };

  const startGoogleSignIn = () => run(() => client.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}/dashboard` }
  }));

  const isRecoveryForm = mode === "reset" || mode === "phone-reset";
  const title = mode === "register" ? "Create your AgriPlus account"
    : isRecoveryForm ? "Set a new password"
      : mode === "otp" ? "Verify your phone"
        : mode === "recover" ? "Recover your account"
          : "Welcome back";

  return (
    <Localize><main className="auth-page">
      <section className="card auth-card">
        <div className="eyebrow">MBs AGRO SOLUTION</div>
        <h1>{title}</h1>
        <p className="auth-intro">Sign in to securely access your farm records and community.</p>
        {error && <div className="auth-message error" role="alert">{error}</div>}
        {notice && <div className="auth-message success" role="status">{notice}</div>}

        {mode === "otp" ? (
          <form className="form-grid" onSubmit={verifyOtp}>
            <label>Phone number<input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} required/></label>
            <label>Verification code<input inputMode="numeric" autoComplete="one-time-code" value={otp} onChange={(event) => setOtp(event.target.value)} required/></label>
            {otpPurpose === "recovery" && <>
              <PasswordInput id="otp-password" label="New password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8}/>
              <PasswordInput id="otp-confirm-password" label="Confirm new password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={8}/>
            </>}
            <button className="primary full" disabled={busy}>{busy ? "Verifying…" : "Verify code"}</button>
            <button type="button" className="auth-link" onClick={() => setMode("login")}>Back to sign in</button>
          </form>
        ) : (
          <form className="form-grid" onSubmit={submit}>
            {mode === "register" && <>
              <label>Full name<input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={100}/></label>
              <label>Email<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required/></label>
              <label>Phone number<input type="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} required placeholder="+2348012345678"/></label>
              <label>Date of birth<input type="date" value={dateOfBirth} onChange={(event) => setDateOfBirth(event.target.value)} required max={new Date().toISOString().slice(0, 10)}/></label>
              <label>Gender<select value={gender} onChange={(event) => setGender(event.target.value)} required><option value="">Select</option><option value="female">Female</option><option value="male">Male</option><option value="non_binary">Non-binary</option><option value="prefer_not_to_say">Prefer not to say</option></select></label>
            </>}
            {mode === "login" && <label>Email or phone number<input autoComplete="username" value={identifier} onChange={(event) => setIdentifier(event.target.value)} required/></label>}
            {mode === "recover" && <label>Email or phone number<input autoComplete="username" value={identifier} onChange={(event) => setIdentifier(event.target.value)} required/></label>}
            {(mode === "login" || mode === "register" || isRecoveryForm) && <>
              <PasswordInput id="auth-password" label={isRecoveryForm ? "New password" : "Password"} autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} minLength={mode === "login" ? undefined : 8}/>
              {(mode === "register" || isRecoveryForm) && <PasswordInput id="auth-confirm-password" label="Confirm password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={8}/>}
            </>}
            <button className="primary full" disabled={busy}>{busy ? "Please wait…" : mode === "register" ? "Create account" : mode === "recover" ? "Send recovery instructions" : isRecoveryForm ? "Update password" : "Sign in"}</button>
          </form>
        )}

        {mode === "login" && <>
          <div className="auth-divider"><span>or</span></div>
          <button type="button" className="outline full" onClick={startGoogleSignIn} disabled={busy}>Continue with Google</button>
          <button type="button" className="outline full auth-spaced" onClick={() => {const target=identifier.startsWith("+")?identifier:phone;setPhone(target);requestPhoneOtp("login",target);}} disabled={busy}>Sign in with SMS code</button>
          <button type="button" className="auth-link" onClick={() => {setError("");setMode("recover");}}>Forgot password?</button>
        </>}
        {mode === "recover" && <button type="button" className="auth-link" onClick={() => setMode("login")}>Back to sign in</button>}
        {mode === "login" && <p className="auth-switch">New to AgriPlus? <button type="button" className="auth-link" onClick={() => {setError("");setMode("register");}}>Create an account</button></p>}
        {mode === "register" && <p className="auth-switch">Already registered? <button type="button" className="auth-link" onClick={() => {setError("");setMode("login");}}>Sign in</button></p>}
        {mode === "login" && <p className="auth-switch admin-auth-entry"><Link to="/admin/login">Administrator sign in</Link></p>}
      </section>
    </main></Localize>
  );
}

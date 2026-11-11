import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { getSupabaseClient, supabaseConfigured } from "./supabase.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [client, setClient] = useState(null);
  const [loading, setLoading] = useState(supabaseConfigured);
  const [recovery, setRecovery] = useState(false);
  const [authError,setAuthError]=useState("");

  useEffect(() => {
    if (!supabaseConfigured) {
      setLoading(false);
      return undefined;
    }

    let active = true;
    let subscription;
    getSupabaseClient().then(instance=>{
      if(!active)return;
      setClient(instance);
      const {data:{subscription:authSubscription}}=instance.auth.onAuthStateChange((event,nextSession)=>{
        if(!active)return;
        setSession(nextSession);
        setRecovery(event==="PASSWORD_RECOVERY");
        setLoading(false);
      });
      subscription=authSubscription;
      return instance.auth.getSession();
    }).then(result=>{
      if(!active||!result)return;
      if(result.error)console.error("Could not restore the Supabase session.",result.error);
      setSession(result.data?.session??null);
      setLoading(false);
    }).catch(error=>{
      if(!active)return;
      console.error("Could not initialize Supabase.",error);
      setAuthError("Supabase could not be initialized. Check the project URL and publishable key, then reload.");
      setLoading(false);
    });

    return () => {
      active = false;
      subscription?.unsubscribe();
    };
  }, []);

  const value = useMemo(() => ({
    configured: supabaseConfigured,
    client,
    session,
    user: session?.user ?? null,
    loading,
    recovery,
    authError,
    signOut: () => client?.auth.signOut()
  }), [client,session,loading,recovery,authError]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider.");
  return context;
}

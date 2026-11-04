/**
 * Who is using the app, and which data mode we are in.
 *
 *   loading     checking for a saved session on startup
 *   signed_out  Supabase is configured, nobody is signed in -> sign-in screen
 *   signed_in   a Supabase session exists -> SupabaseRepository
 *   demo        local fake data (chosen by the user, or forced when Supabase
 *               is not configured in .env)
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session, User } from '@supabase/supabase-js';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { isSupabaseConfigured, supabase } from '../lib/supabase';

export type AuthStatus = 'loading' | 'signed_out' | 'signed_in' | 'demo';

export interface AuthResult {
  error?: string;
  /** Sign-up succeeded but the project requires e-mail confirmation first. */
  needsConfirmation?: boolean;
}

interface AuthContextValue {
  status: AuthStatus;
  session: Session | null;
  user: User | null;
  /** False when .env has no Supabase keys: the app can only run in demo mode. */
  configured: boolean;
  signIn(email: string, password: string): Promise<AuthResult>;
  signUp(email: string, password: string): Promise<AuthResult>;
  signOut(): Promise<void>;
  enterDemo(): Promise<void>;
  leaveDemo(): Promise<void>;
}

const DEMO_KEY = 'n1lab:demoMode';
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [demo, setDemo] = useState<boolean | null>(isSupabaseConfigured ? null : true);
  const [sessionKnown, setSessionKnown] = useState(!isSupabaseConfigured);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    // Both reads are asynchronous, so state is set after the effect body returns.
    Promise.all([supabase.auth.getSession(), AsyncStorage.getItem(DEMO_KEY)]).then(([{ data }, demoFlag]) => {
      if (!active) return;
      setSession(data.session);
      setDemo(demoFlag === '1');
      setSessionKnown(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (active) setSession(next);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    if (!supabase) return { error: 'Supabase is not configured.' };
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) return { error: error.message };
    await AsyncStorage.removeItem(DEMO_KEY);
    setDemo(false);
    return {};
  }, []);

  const signUp = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    if (!supabase) return { error: 'Supabase is not configured.' };
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
    if (error) return { error: error.message };
    if (!data.session) return { needsConfirmation: true };
    await AsyncStorage.removeItem(DEMO_KEY);
    setDemo(false);
    return {};
  }, []);

  const signOut = useCallback(async () => {
    await supabase?.auth.signOut();
    setSession(null);
  }, []);

  const enterDemo = useCallback(async () => {
    await AsyncStorage.setItem(DEMO_KEY, '1');
    setDemo(true);
  }, []);

  const leaveDemo = useCallback(async () => {
    await AsyncStorage.removeItem(DEMO_KEY);
    setDemo(false);
  }, []);

  const status: AuthStatus = !sessionKnown || demo === null ? 'loading' : session ? 'signed_in' : demo ? 'demo' : 'signed_out';

  const value = useMemo<AuthContextValue>(
    () => ({ status, session, user: session?.user ?? null, configured: isSupabaseConfigured, signIn, signUp, signOut, enterDemo, leaveDemo }),
    [status, session, signIn, signUp, signOut, enterDemo, leaveDemo],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

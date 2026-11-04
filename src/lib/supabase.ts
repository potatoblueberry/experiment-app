/**
 * The one Supabase client for the app. Reads its address and public key from
 * `.env` (EXPO_PUBLIC_* variables are inlined by Expo at build time).
 *
 * When the variables are missing, `supabase` is null and the app runs purely on
 * local demo data. That keeps `npm run web` working on a fresh clone.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const isSupabaseConfigured = url.length > 0 && anonKey.length > 0;

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url, anonKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        // Magic-link / confirmation links land on the web build; native uses deep links later.
        detectSessionInUrl: Platform.OS === 'web',
      },
    })
  : null;

// On native, tokens are refreshed only while the app is in the foreground.
if (supabase && Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

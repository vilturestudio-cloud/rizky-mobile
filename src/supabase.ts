import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Supabase URL atau Anon Key belum dikonfigurasi.");
}

const createSupabaseClient = () =>
  createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

const globalForSupabase = globalThis as typeof globalThis & {
  __viltureSupabase?: ReturnType<typeof createSupabaseClient>;
};

export const supabase =
  globalForSupabase.__viltureSupabase ?? createSupabaseClient();

if (import.meta.env.DEV) {
  globalForSupabase.__viltureSupabase = supabase;
}

// Mengirim OTP untuk login atau menghubungkan akun anonim ke email.
export async function sendLoginOtp(email: string) {
  const normalizedEmail = email.trim().toLowerCase();

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) throw sessionError;

  if (session?.user.is_anonymous) {
    const { error: logoutError } = await supabase.auth.signOut({
      scope: "local",
    });

    if (logoutError) throw logoutError;
  }

  const { error } = await supabase.auth.signInWithOtp({
    email: normalizedEmail,
    options: {
      shouldCreateUser: true,
    },
  });

  if (error) throw error;

  return { mode: "login" as const };
}

// Memverifikasi OTP.
export async function verifyLoginOtp(
  email: string,
  token: string,
  mode: "upgrade" | "login",
) {
  const { data, error } = await supabase.auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: token.trim(),
    type: mode === "upgrade" ? "email_change" : "email",
  });

  if (error) throw error;

  if (!data.session) {
    throw new Error("Verifikasi berhasil, tetapi sesi belum tersedia.");
  }

  return data.session;
}

// Mengakhiri sesi pengguna.
export async function logoutUser() {
  const { error } = await supabase.auth.signOut();

  if (error) throw error;
}

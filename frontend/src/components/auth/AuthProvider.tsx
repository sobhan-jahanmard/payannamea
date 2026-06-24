"use client";

import { LogIn, ShieldAlert, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import {
  clearAuthSession,
  getMe,
  getStoredToken,
  getStoredUser,
  loginAccount,
  registerAccount,
  storeAuthSession,
  storeAuthUser
} from "../../lib/api";
import type { LoginPayload, RegisterPayload, User } from "../../types/api";
import { Button } from "../ui/button";

interface AuthContextValue {
  user: User | null;
  token: string | null;
  loading: boolean;
  isAdmin: boolean;
  login: (payload: LoginPayload) => Promise<User>;
  register: (payload: RegisterPayload) => Promise<User>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    const storedToken = getStoredToken();
    if (!storedToken) {
      setUser(null);
      setToken(null);
      setLoading(false);
      return;
    }

    setToken(storedToken);
    try {
      const currentUser = await getMe();
      storeAuthUser(currentUser);
      setUser(currentUser);
    } catch {
      clearAuthSession();
      setUser(null);
      setToken(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setUser(getStoredUser());
    setToken(getStoredToken());
    void refresh();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      loading,
      isAdmin: user?.role === "admin",
      login: async (payload) => {
        const session = await loginAccount(payload);
        storeAuthSession(session);
        setUser(session.user);
        setToken(session.access_token);
        return session.user;
      },
      register: async (payload) => {
        const session = await registerAccount(payload);
        storeAuthSession(session);
        setUser(session.user);
        setToken(session.access_token);
        return session.user;
      },
      logout: () => {
        clearAuthSession();
        setUser(null);
        setToken(null);
      },
      refresh
    }),
    [loading, token, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}

export function AuthGate({
  children,
  adminOnly = false
}: {
  children: ReactNode;
  adminOnly?: boolean;
}) {
  const { user, loading, isAdmin } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && adminOnly && user && !isAdmin) {
      router.replace("/orders");
    }
  }, [adminOnly, isAdmin, loading, router, user]);

  if (loading) {
    return (
      <main className="mx-auto w-full max-w-7xl px-4 py-6 lg:px-8">
        <section className="tool-surface p-5 text-sm text-muted-foreground">در حال بررسی حساب کاربری...</section>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-10 lg:px-8">
        <section className="tool-surface grid gap-4 p-6">
          <div className="flex items-start gap-3">
            <LogIn className="mt-1 h-5 w-5 text-primary" aria-hidden="true" />
            <div>
              <h1 className="text-xl font-semibold">ورود لازم است</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                برای ثبت سفارش و دیدن فهرست سفارش‌ها ابتدا وارد حساب خود شوید.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/login">
                <LogIn className="h-4 w-4" aria-hidden="true" />
                ورود
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/register">
                <UserPlus className="h-4 w-4" aria-hidden="true" />
                ساخت حساب
              </Link>
            </Button>
          </div>
        </section>
      </main>
    );
  }

  if (adminOnly && !isAdmin) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-10 lg:px-8">
        <section className="tool-surface flex items-start gap-3 p-6">
          <ShieldAlert className="mt-1 h-5 w-5 text-red-700" aria-hidden="true" />
          <div>
            <h1 className="text-xl font-semibold">دسترسی مدیریت ندارید</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              این بخش فقط برای کاربران با نقش مدیر فعال است؛ در حال انتقال به سفارش‌های شما...
            </p>
          </div>
        </section>
      </main>
    );
  }

  return <>{children}</>;
}

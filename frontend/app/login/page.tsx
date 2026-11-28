"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { ThemeToggle } from "@/components/theme-toggle";
import { Eye, EyeOff, Lock, User } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Clean session state on landing
  useState(() => {
    if (typeof document !== "undefined") {
      document.cookie = "user-role=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    }
  });

  async function handleLogin(e?: React.FormEvent) {
    if (e) e.preventDefault();

    const cleanUsername = username.trim();
    if (!cleanUsername) {
      toast.error("Please enter your username");
      return;
    }
    if (!password) {
      toast.error("Please enter your account password");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: cleanUsername, password }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        toast.error(data.error || "Authentication failed. Please verify credentials.");
        setLoading(false);
        return;
      }

      localStorage.setItem("user-role", data.role);
      document.cookie = `user-role=${data.role}; path=/`;

      toast.success(`Welcome back, ${data.profile?.full_name || cleanUsername}!`);
      router.replace(data.redirectUrl || "/dashboard");
      router.refresh();
    } catch (err: any) {
      toast.error(err?.message || "Server error during sign in");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background dark:bg-slate-950 relative overflow-hidden">
      {/* Seamless full-screen ambient grid & radial glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(16,185,129,0.20),transparent_60%),radial-gradient(ellipse_at_bottom_right,rgba(6,182,212,0.12),transparent_60%)] pointer-events-none" />
      <div className="absolute inset-0 bg-grid opacity-50 dark:opacity-40 pointer-events-none" />

      {/* Left Branding Panel */}
      <div className="hidden lg:flex relative bg-slate-950 dark:bg-transparent text-white border-r border-slate-900/80 dark:border-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(16,185,129,0.25),transparent_60%),radial-gradient(ellipse_at_bottom_right,rgba(6,182,212,0.15),transparent_60%)] dark:hidden pointer-events-none" />
        <div className="absolute inset-0 bg-grid opacity-50 dark:hidden pointer-events-none" />
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          <div className="flex items-center">
            <img
              src="/logo-full-dark-trans.png"
              alt="Solar Assist"
              className="h-20 sm:h-24 w-auto object-contain drop-shadow-md"
            />
          </div>

          <div className="space-y-6 max-w-lg">
            <h1 className="text-4xl xl:text-5xl font-display font-semibold leading-tight tracking-tight">
              Every kilowatt.
              <br />
              Every site.{" "}
              <span className="text-emerald-400">
                One platform.
              </span>
            </h1>

            <p className="text-slate-300 text-base leading-relaxed">
              The unified solar asset management software, powered by intelligent monitoring, proactive maintenance, and coordinated field operations.
            </p>

            <div className="grid grid-cols-3 gap-6 pt-4 border-t border-slate-800/80">
              <div>
                <div className="text-2xl font-semibold text-emerald-400">10+ <span className="text-slate-400 text-sm">MW</span></div>
                <div className="text-xs text-slate-400 uppercase tracking-wider mt-0.5">Under management</div>
              </div>

              <div>
                <div className="text-2xl font-semibold text-emerald-400">98.7%</div>
                <div className="text-xs text-slate-400 uppercase tracking-wider mt-0.5">Avg PR uptime</div>
              </div>

              <div>
                <div className="text-2xl font-semibold text-emerald-400">&lt; 4h</div>
                <div className="text-xs text-slate-400 uppercase tracking-wider mt-0.5">Alert → resolve</div>
              </div>
            </div>
          </div>

          <p className="text-xs text-slate-500">&copy; {new Date().getFullYear()} Solar Assist Private Limited.</p>
        </div>
      </div>

      {/* Right Sign-in Panel */}
      <div className="relative flex items-center justify-center p-6 sm:p-12 bg-emerald-50/30 dark:bg-transparent">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(16,185,129,0.18),transparent_65%),radial-gradient(ellipse_at_bottom_left,rgba(52,211,153,0.12),transparent_65%)] dark:hidden pointer-events-none" />
        <div className="absolute inset-0 bg-grid opacity-75 dark:hidden pointer-events-none" />

        {/* Ambient Theme Toggle */}
        <div className="absolute top-6 right-6 z-10">
          <ThemeToggle />
        </div>

        <div className="w-full max-w-md space-y-6 relative z-10">
          <div className="text-center space-y-1">
            <h2 className="text-2xl sm:text-3xl font-display font-bold text-emerald-600 dark:text-emerald-400 tracking-tight">
              Sign In to Solar Assist
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Enter your username and password to access your portal
            </p>
          </div>

          <Card className="border shadow-lg bg-card/95 backdrop-blur-sm">
            <CardContent className="pt-6">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-username" className="text-xs font-semibold text-foreground">
                    Username
                  </Label>
                  <div className="relative">
                    <Input
                      id="login-username"
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Enter your username"
                      disabled={loading}
                      autoComplete="username"
                      required
                      data-testid="login-username-input"
                      className="h-10 text-sm pl-9 bg-background text-foreground"
                    />
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="login-password" className="text-xs font-semibold text-foreground">
                      Password
                    </Label>
                  </div>
                  <div className="relative">
                    <Input
                      id="login-password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      disabled={loading}
                      autoComplete="current-password"
                      required
                      data-testid="login-password-input"
                      className="h-10 text-sm pl-9 pr-10 bg-background text-foreground"
                    />
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1"
                      tabIndex={-1}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full h-10 font-semibold text-sm transition-all shadow-sm bg-emerald-600 hover:bg-emerald-700 text-white"
                  disabled={loading}
                  data-testid="login-submit"
                >
                  {loading ? "Authenticating..." : "Sign In"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

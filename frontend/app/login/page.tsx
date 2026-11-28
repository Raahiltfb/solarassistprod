"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { ThemeToggle } from "@/components/theme-toggle";
import { Eye, EyeOff, Lock, Mail, ChevronDown, ChevronUp, UserCheck, Wrench, Shield, Building2 } from "lucide-react";

const QUICK_ROSTER = [
  {
    category: "Field Operations (Technicians)",
    icon: Wrench,
    accounts: [
      { name: "Faisal Sorathiya", email: "faisal.sorathiya@solarassist.dev" },
      { name: "Sandesh Tambe", email: "sandesh.tambe@solarassist.dev" },
      { name: "Faiz Adani", email: "faiz.adani@solarassist.dev" },
      { name: "Imran Qureshi", email: "imran.qureshi@solarassist.dev" },
      { name: "Aphjal Khan", email: "aphjal.khan@solarassist.dev" },
      { name: "Amir Khan", email: "amir.khan@solarassist.dev" },
    ],
  },
  {
    category: "Administration & Engineering",
    icon: Shield,
    accounts: [
      { name: "Solar Assist Admin", email: "admin@solarassist.dev" },
      { name: "Super Admin", email: "super@solarassist.dev" },
    ],
  },
  {
    category: "Featured Client Portals",
    icon: Building2,
    accounts: [
      { name: "Anoopam Mission", email: "client@anoopam.com" },
      { name: "Cilantro CHS", email: "client@cilantro.com" },
      { name: "Manavsthal Tower", email: "client@manavsthal.com" },
      { name: "Alcove Society", email: "client@alcove.com" },
    ],
  },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showDirectory, setShowDirectory] = useState(false);

  // Clean session state on landing
  useState(() => {
    if (typeof document !== "undefined") {
      document.cookie = "user-role=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    }
  });

  async function handleLogin(e?: React.FormEvent) {
    if (e) e.preventDefault();

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      toast.error("Please enter your email address");
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
        body: JSON.stringify({ email: cleanEmail, password }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        toast.error(data.error || "Authentication failed. Please verify credentials.");
        setLoading(false);
        return;
      }

      localStorage.setItem("user-role", data.role);
      document.cookie = `user-role=${data.role}; path=/`;

      toast.success(`Welcome back, ${data.profile?.full_name || cleanEmail}!`);
      router.replace(data.redirectUrl || "/dashboard");
      router.refresh();
    } catch (err: any) {
      toast.error(err?.message || "Server error during sign in");
      setLoading(false);
    }
  }

  function handleSelectRosterEmail(rosterEmail: string) {
    setEmail(rosterEmail);
    // Auto-focus or hint
    toast.info(`Selected ${rosterEmail}. Please enter password to sign in.`);
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
              Enter your credentials to access your operating portal
            </p>
          </div>

          <Card className="border shadow-lg bg-card/95 backdrop-blur-sm">
            <CardContent className="pt-6">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email" className="text-xs font-semibold text-foreground">
                    Email Address
                  </Label>
                  <div className="relative">
                    <Input
                      id="login-email"
                      type="text"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="e.g. admin@solarassist.dev or technician email"
                      disabled={loading}
                      autoComplete="username"
                      required
                      data-testid="login-email-input"
                      className="h-10 text-sm pl-9 bg-background text-foreground"
                    />
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
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

              {/* Roster & Quick Directory for Easy Access */}
              <div className="mt-6 pt-4 border-t border-border/60">
                <button
                  type="button"
                  onClick={() => setShowDirectory(!showDirectory)}
                  className="w-full flex items-center justify-between text-xs font-medium text-muted-foreground hover:text-foreground transition-colors py-1"
                >
                  <span className="flex items-center gap-1.5">
                    <UserCheck className="w-3.5 h-3.5 text-emerald-500" />
                    Active Accounts & Quick Fill
                  </span>
                  {showDirectory ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>

                {showDirectory && (
                  <div className="mt-3 space-y-3 p-3 rounded-lg bg-muted/40 text-xs border border-border/50 max-h-64 overflow-y-auto">
                    <div className="p-2 bg-emerald-500/10 rounded border border-emerald-500/20 text-emerald-800 dark:text-emerald-300 font-mono text-[11px]">
                      Access Password for all accounts: <strong>SolarAssist@1234</strong>
                    </div>

                    {QUICK_ROSTER.map((grp) => {
                      const Icon = grp.icon;
                      return (
                        <div key={grp.category} className="space-y-1.5">
                          <div className="flex items-center gap-1.5 font-semibold text-muted-foreground text-[11px] uppercase tracking-wider">
                            <Icon className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                            {grp.category}
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                            {grp.accounts.map((acc) => (
                              <button
                                key={acc.email}
                                type="button"
                                onClick={() => handleSelectRosterEmail(acc.email)}
                                className="text-left px-2 py-1.5 rounded bg-background hover:bg-emerald-50 dark:hover:bg-emerald-950/40 border border-border/60 hover:border-emerald-300 dark:hover:border-emerald-700 transition-colors"
                              >
                                <div className="font-medium text-foreground text-[11px] truncate">{acc.name}</div>
                                <div className="text-[10px] text-muted-foreground truncate">{acc.email}</div>
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

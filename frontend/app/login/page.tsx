"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { ThemeToggle } from "@/components/theme-toggle";

const LOGIN_OPTIONS = [
  {
    group: "Administrative",
    options: [
      { label: "Admin (admin@solarassist.dev)", email: "admin@solarassist.dev" },
      { label: "Super Admin (super@solarassist.dev)", email: "super@solarassist.dev" },
    ],
  },
  {
    group: "Field Technicians (10 Field Technicians)",
    options: [
      { label: "Tech 1 · Team A (tech1@solarassist.dev)", email: "tech1@solarassist.dev" },
      { label: "Tech 2 · Team A (tech2@solarassist.dev)", email: "tech2@solarassist.dev" },
      { label: "Tech 3 · Team B (tech3@solarassist.dev)", email: "tech3@solarassist.dev" },
      { label: "Tech 4 · Team B (tech4@solarassist.dev)", email: "tech4@solarassist.dev" },
      { label: "Tech 5 · Team C (tech5@solarassist.dev)", email: "tech5@solarassist.dev" },
      { label: "Tech 6 · Team C (tech6@solarassist.dev)", email: "tech6@solarassist.dev" },
      { label: "Tech 7 · Team D (tech7@solarassist.dev)", email: "tech7@solarassist.dev" },
      { label: "Tech 8 · Team D (tech8@solarassist.dev)", email: "tech8@solarassist.dev" },
      { label: "Tech 9 · Team E Pune (tech9@solarassist.dev)", email: "tech9@solarassist.dev" },
      { label: "Tech 10 · Team E Pune (tech10@solarassist.dev)", email: "tech10@solarassist.dev" },
    ],
  },
  {
    group: "Client Portals (All 11 Client Accounts)",
    options: [
      { label: "Cilantro CHS (client@cilantro.com)", email: "client@cilantro.com" },
      { label: "Alcove Society (client@alcove.com)", email: "client@alcove.com" },
      { label: "Manavsthal Tower (client@manavsthal.com)", email: "client@manavsthal.com" },
      { label: "Dosti Jade CHS (client@dostijade.com)", email: "client@dostijade.com" },
      { label: "BWSSB Bangalore (client@bwssb.com)", email: "client@bwssb.com" },
      { label: "Belmac Panvel (client@belmac.com)", email: "client@belmac.com" },
      { label: "Regalia CHS (client@regalia.com)", email: "client@regalia.com" },
      { label: "Maitri Anand CHS (client@maitrianand.com)", email: "client@maitrianand.com" },
      { label: "Sophistica Solar (client@sophistica.com)", email: "client@sophistica.com" },
      { label: "Patwardhan Hospital (client@patwardhan.com)", email: "client@patwardhan.com" },
      { label: "Ivy By Courtyard (client@ivy.com)", email: "client@ivy.com" },
    ],
  },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@solarassist.dev");
  const [loading, setLoading] = useState(false);

  async function handleLogin(targetEmail: string) {
    if (!targetEmail) {
      toast.error("Please select or enter an email address");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/quick-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: targetEmail }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        toast.error(data.error || "Login failed");
        setLoading(false);
        return;
      }

      localStorage.setItem("user-role", data.role);
      document.cookie = `user-role=${data.role}; path=/`;

      toast.success(`Welcome back! Logged in as ${data.profile?.full_name || targetEmail}`);
      router.replace(data.redirectUrl || "/dashboard");
      router.refresh();
    } catch (err: any) {
      toast.error(err?.message || "Server error during sign in");
      setLoading(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    handleLogin(email);
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background dark:bg-slate-950 relative overflow-hidden">
      {/* Seamless full-screen ambient grid & radial glow for perfect uniform grid lines across both columns */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(16,185,129,0.20),transparent_60%),radial-gradient(ellipse_at_bottom_right,rgba(6,182,212,0.12),transparent_60%)] pointer-events-none" />
      <div className="absolute inset-0 bg-grid opacity-50 dark:opacity-40 pointer-events-none" />

      {/* Left Branding Panel: Rich dark branding panel with emerald radiance in light mode; transparent in dark mode */}
      <div className="hidden lg:flex relative bg-slate-950 dark:bg-transparent text-white border-r border-slate-900/80 dark:border-none">
        {/* Emerald radiance in light mode */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(16,185,129,0.25),transparent_60%),radial-gradient(ellipse_at_bottom_right,rgba(6,182,212,0.15),transparent_60%)] dark:hidden pointer-events-none" />
        {/* Ambient grid lines on left panel in light mode */}
        <div className="absolute inset-0 bg-grid opacity-50 dark:hidden pointer-events-none" />
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          {/* Prominently sized single top-left logo */}
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

      {/* Right Sign-in Panel: Cleanly positioned over the unified full-screen ambient grid */}
      <div className="relative flex items-center justify-center p-6 sm:p-12 bg-emerald-50/30 dark:bg-transparent">
        {/* Light Mode only: Rich light green ambient hue and enhanced visible grid lines */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(16,185,129,0.18),transparent_65%),radial-gradient(ellipse_at_bottom_left,rgba(52,211,153,0.12),transparent_65%)] dark:hidden pointer-events-none" />
        <div className="absolute inset-0 bg-grid opacity-75 dark:hidden pointer-events-none" />

        {/* Ambient Theme Toggle on top right corner */}
        <div className="absolute top-6 right-6 z-10">
          <ThemeToggle />
        </div>

        <div className="w-full max-w-sm space-y-6 relative z-10">
          {/* Centered Heading with signature emerald green */}
          <div className="text-center">
            <h2 className="text-2xl font-display font-bold text-emerald-600 dark:text-emerald-400 tracking-tight">
              Sign In to Solar Assist
            </h2>
          </div>

          <Card className="border shadow-lg bg-card/95 backdrop-blur-sm">
            <CardContent className="pt-6">
              <form onSubmit={onSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email" className="text-xs font-medium text-foreground">
                    Email
                  </Label>
                  <select
                    id="login-email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                    data-testid="login-email-select"
                    className="w-full h-10 px-3 text-sm bg-background text-foreground border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary transition-colors cursor-pointer"
                  >
                    {LOGIN_OPTIONS.map((grp) => (
                      <optgroup key={grp.group} label={grp.group}>
                        {grp.options.map((opt) => (
                          <option key={opt.email} value={opt.email}>
                            {opt.label}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="login-password" className="text-xs font-medium text-muted-foreground">
                    Password
                  </Label>
                  <Input
                    id="login-password"
                    type="password"
                    value="••••••••••••"
                    disabled
                    readOnly
                    className="h-10 text-sm bg-muted/50 cursor-not-allowed select-none text-muted-foreground"
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full h-10 font-semibold text-sm transition-all shadow-sm"
                  disabled={loading}
                  data-testid="login-submit"
                >
                  {loading ? "Signing in..." : "Sign In"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
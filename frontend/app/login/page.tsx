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
      { label: "Solar Assist Fleet Admin (admin@solarassist.dev)", email: "admin@solarassist.dev" },
      { label: "Super Admin (super@solarassist.dev)", email: "super@solarassist.dev" },
    ],
  },
  {
    group: "Field Technicians (10 Active Technicians)",
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
    group: "Client Portals (Fleet Sites)",
    options: [
      { label: "Cilantro CHS (client@cilantro.com)", email: "client@cilantro.com" },
      { label: "Maxima CHS (client@maxima.com)", email: "client@maxima.com" },
      { label: "MK Thakur Complex (client@mkthakur.com)", email: "client@mkthakur.com" },
      { label: "Alcove Society (client@alcove.com)", email: "client@alcove.com" },
      { label: "Manavsthal Tower (client@manavsthal.com)", email: "client@manavsthal.com" },
      { label: "Patwardhan Hospital (client@patwardhan.com)", email: "client@patwardhan.com" },
      { label: "Dosti Jade CHS (client@dostijade.com)", email: "client@dostijade.com" },
      { label: "Belmac Panvel (client@belmac.com)", email: "client@belmac.com" },
      { label: "BWSSB Bangalore (client@bwssb.com)", email: "client@bwssb.com" },
      { label: "Regalia CHS (client@regalia.com)", email: "client@regalia.com" },
      { label: "Maitri Anand CHS (client@maitrianand.com)", email: "client@maitrianand.com" },
      { label: "Sophistica Solar (client@sophistica.com)", email: "client@sophistica.com" },
      { label: "Ivy By Courtyard (client@ivy.com)", email: "client@ivy.com" },
      { label: "Casa Florea (client@casaflorea.com)", email: "client@casaflorea.com" },
      { label: "Madhukosh CHS (client@madhukosh.com)", email: "client@madhukosh.com" },
      { label: "Garcinia Residency (client@garcinia.com)", email: "client@garcinia.com" },
      { label: "Anoopam Mission (client@anoopam.com)", email: "client@anoopam.com" },
      { label: "Suvarna Pushpa CHS (client@suvarnapushpa.com)", email: "client@suvarnapushpa.com" },
      { label: "Suyash Heights (client@suyash.com)", email: "client@suyash.com" },
      { label: "Venecia CHS (client@venecia.com)", email: "client@venecia.com" },
      { label: "Vijay Vatika CHS (client@vijayvatika.com)", email: "client@vijayvatika.com" },
      { label: "Crestia Solar (client@crestia.com)", email: "client@crestia.com" },
      { label: "STP Plant Services (client@stp.com)", email: "client@stp.com" },
    ],
  },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@solarassist.dev");
  const [loading, setLoading] = useState(false);

  // Ensure clean session state when landing on login page
  useState(() => {
    if (typeof document !== "undefined") {
      document.cookie = "user-role=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    }
  });

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

                <div className="pt-3 border-t border-border/50">
                  <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 text-center">
                    Quick Operational Roles
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      id="quick-login-sa"
                      disabled={loading}
                      className="text-xs h-8"
                      onClick={() => handleLogin("admin@solarassist.dev")}
                    >
                      Fleet Admin
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      id="quick-login-super"
                      disabled={loading}
                      className="text-xs h-8 text-emerald-500 border-emerald-500/30 hover:bg-emerald-500/10"
                      onClick={() => handleLogin("super@solarassist.dev")}
                    >
                      Super Admin
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      id="quick-login-tech"
                      disabled={loading}
                      className="text-xs h-8 text-amber-500 border-amber-500/30 hover:bg-amber-500/10"
                      onClick={() => handleLogin("tech1@solarassist.dev")}
                    >
                      Field Technician
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      id="quick-login-client-cilantro"
                      disabled={loading}
                      className="text-xs h-8 text-purple-500 border-purple-500/30 hover:bg-purple-500/10"
                      onClick={() => handleLogin("client@cilantro.com")}
                    >
                      Client (Cilantro)
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      id="quick-login-client-maxima"
                      disabled={loading}
                      className="col-span-2 text-xs h-8 text-cyan-500 border-cyan-500/30 hover:bg-cyan-500/10"
                      onClick={() => handleLogin("client@maxima.com")}
                    >
                      Client Portal (Maxima CHS)
                    </Button>
                  </div>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
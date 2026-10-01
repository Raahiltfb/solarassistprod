"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { ShieldCheck, HardHat, Building2, Crown, ArrowRight, Sparkles, UserCheck } from "lucide-react";

const DEMO_PERSONAS = [
  {
    role: "epc_admin",
    name: "EPC Ops Manager",
    email: "admin@solarassist.dev",
    description: "Full O&M Command Center & fleet operations",
    icon: ShieldCheck,
    badge: "Admin",
    badgeColor: "bg-blue-500/10 text-blue-600 border-blue-500/30",
  },
  {
    role: "technician",
    name: "Field Technician",
    email: "tech1@solarassist.dev",
    description: "Daily jobs, check-ins, cleaning & field evidence",
    icon: HardHat,
    badge: "Technician",
    badgeColor: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  },
  {
    role: "client",
    name: "Client / Asset Owner",
    email: "client@cilantro.com",
    description: "Cilantro CHS client dashboard & solar metrics",
    icon: Building2,
    badge: "Client Portal",
    badgeColor: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  },
  {
    role: "super_admin",
    name: "Super Admin",
    email: "super@solarassist.dev",
    description: "System administration & global telemetry",
    icon: Crown,
    badge: "Super Admin",
    badgeColor: "bg-purple-500/10 text-purple-600 border-purple-500/30",
  },
];

const CLIENT_OPTIONS = [
  { name: "Cilantro CHS Representative", email: "client@cilantro.com" },
  { name: "Alcove Society Representative", email: "client@alcove.com" },
  { name: "Manavsthal Tower Representative", email: "client@manavsthal.com" },
  { name: "Dosti Jade CHS Representative", email: "client@dostijade.com" },
  { name: "BWSSB Bangalore Representative", email: "client@bwssb.com" },
  { name: "Belmac Panvel Representative", email: "client@belmac.com" },
  { name: "Regalia CHS Representative", email: "client@regalia.com" },
  { name: "Maitri Anand CHS Representative", email: "client@maitrianand.com" },
  { name: "Sophistica Solar Representative", email: "client@sophistica.com" },
  { name: "Patwardhan Hospital Representative", email: "client@patwardhan.com" },
  { name: "Ivy By Courtyard Representative", email: "client@ivy.com" },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeLoggingEmail, setActiveLoggingEmail] = useState<string | null>(null);

  async function handleLogin(targetEmail: string) {
    if (!targetEmail) {
      toast.error("Please enter an email address");
      return;
    }

    setLoading(true);
    setActiveLoggingEmail(targetEmail);

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
        setActiveLoggingEmail(null);
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
      setActiveLoggingEmail(null);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    handleLogin(email);
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      {/* Left Branding Panel */}
      <div className="hidden lg:flex relative bg-[radial-gradient(ellipse_at_top_left,hsl(150_70%_45%/0.18),transparent_60%),radial-gradient(ellipse_at_bottom_right,hsl(200_80%_50%/0.12),transparent_60%)] bg-slate-950 text-white">
        <div className="absolute inset-0 bg-grid opacity-20" />

        <div className="relative z-10 flex flex-col justify-between p-10 w-full">
          <div className="flex items-center gap-3">
            <img src="/logo-full.png" alt="Solar Assist Logo" className="h-12 w-auto object-contain brightness-200" />
          </div>

          <div className="space-y-6 max-w-md">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold">

            </div>

            <h1 className="text-4xl xl:text-5xl font-display font-semibold leading-tight">
              Every kilowatt.
              <br />
              Every site.{" "}
              <span className="text-primary">
                One platform.
              </span>
            </h1>

            <p className="text-slate-300 text-base leading-relaxed">
              The unified O&amp;M platform for EPCs. Instant passwordless demo access for all roles: Admins, Technicians, and Clients.
            </p>

            <div className="grid grid-cols-3 gap-6 pt-6">
              <div>
                <div className="text-2xl font-semibold text-primary">10+ <span className="text-slate-400 text-base">MW</span></div>
                <div className="text-xs text-slate-400 uppercase tracking-wider">Under management</div>
              </div>

              <div>
                <div className="text-2xl font-semibold text-primary">98.7%</div>
                <div className="text-xs text-slate-400 uppercase tracking-wider">Avg PR uptime</div>
              </div>

              <div>
                <div className="text-2xl font-semibold text-primary">&lt; 4h</div>
                <div className="text-xs text-slate-400 uppercase tracking-wider">Alert → resolve</div>
              </div>
            </div>
          </div>

          <p className="text-xs text-slate-500">&copy; {new Date().getFullYear()} SolarAssist O&amp;M OS</p>
        </div>
      </div>

      {/* Right Login & Persona Selection Panel */}
      <div className="relative flex items-center justify-center p-6 lg:p-12 overflow-y-auto">
        <div className="w-full max-w-xl space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl lg:text-3xl font-display font-bold text-foreground">Sign In to SolarAssist</h2>
              <p className="text-xs text-muted-foreground mt-1">
                Select a user persona below or enter an email for instant passwordless sign in.
              </p>
            </div>
            <img src="/logo-full.png" alt="Solar Assist Logo" className="h-10 w-auto object-contain shrink-0" />
          </div>

          {/* Persona Click-to-Login Cards */}
          <div className="space-y-3">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              1-Click Demo Login (Select Persona)
            </Label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {DEMO_PERSONAS.map((persona) => {
                const Icon = persona.icon;
                const isCurrentLogging = activeLoggingEmail === persona.email;

                return (
                  <button
                    key={persona.email}
                    type="button"
                    onClick={() => handleLogin(persona.email)}
                    disabled={loading}
                    className="group relative text-left p-4 rounded-xl border bg-card hover:bg-accent/40 hover:border-primary/40 transition-all duration-200 shadow-sm hover:shadow-md flex flex-col justify-between"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="p-2 rounded-lg bg-muted group-hover:bg-primary/10 transition-colors">
                            <Icon className="h-5 w-5 text-primary" />
                          </div>
                          <span className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                            {persona.name}
                          </span>
                        </div>
                        <Badge variant="outline" className={`text-[10px] ${persona.badgeColor}`}>
                          {persona.badge}
                        </Badge>
                      </div>

                      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                        {persona.description}
                      </p>
                    </div>

                    <div className="mt-3 pt-2 border-t flex items-center justify-between text-xs font-mono text-muted-foreground group-hover:text-foreground">
                      <span className="truncate max-w-[170px]">{persona.email}</span>
                      <span className="text-primary font-sans font-semibold flex items-center gap-1">
                        {isCurrentLogging ? "Signing in..." : "Login"} <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Client Organization Quick Switcher */}
          <div className="p-4 bg-muted/40 rounded-xl border space-y-2">
            <Label htmlFor="client-select" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5 text-primary" /> Quick Client Account Switcher
            </Label>
            <div className="flex gap-2">
              <select
                id="client-select"
                className="w-full h-9 px-3 text-xs bg-background border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                onChange={(e) => {
                  if (e.target.value) handleLogin(e.target.value);
                }}
                defaultValue=""
                disabled={loading}
              >
                <option value="" disabled>-- Select Client Organization Persona --</option>
                {CLIENT_OPTIONS.map((c) => (
                  <option key={c.email} value={c.email}>
                    {c.name} ({c.email})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Divider */}
          <div className="relative flex items-center justify-center">
            <div className="border-t w-full" />
            <span className="bg-background px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground shrink-0">
              Or Sign In With Custom Email
            </span>
            <div className="border-t w-full" />
          </div>

          {/* Passwordless Custom Email Form */}
          <Card className="border shadow-sm">
            <CardContent className="pt-6">
              <form onSubmit={onSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-xs font-medium">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="e.g. user@solarassist.dev"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    data-testid="login-email"
                    className="h-10 text-sm"
                  />
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <UserCheck className="h-3 w-3 text-emerald-500" /> Password not required. Clicking sign in will instantly authenticate your account.
                  </p>
                </div>

                <Button
                  type="submit"
                  className="w-full h-10 gap-2 font-medium"
                  disabled={loading}
                  data-testid="login-submit"
                >
                  {loading ? (
                    <span>Signing in...</span>
                  ) : (
                    <>
                      <span>Instant Passwordless Sign In</span>
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
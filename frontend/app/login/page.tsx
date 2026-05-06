"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Sun } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@heliogrid.dev");
  const [password, setPassword] = useState("Solar@12345");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const sb = createClient();
    const { error } = await sb.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast.error(error.message || "Invalid credentials");
      return;
    }
    toast.success("Welcome back");
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      <div className="hidden lg:flex relative bg-[radial-gradient(ellipse_at_top_left,hsl(36_95%_55%/0.18),transparent_60%),radial-gradient(ellipse_at_bottom_right,hsl(200_80%_50%/0.12),transparent_60%)] bg-slate-950 text-white">
        <div className="absolute inset-0 bg-grid opacity-20" />
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
              <Sun className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="font-display font-semibold text-xl">Solar Assist</span>
          </div>
          <div className="space-y-6 max-w-md">
            <h1 className="text-4xl xl:text-5xl font-display font-semibold leading-tight">
              Every kilowatt.<br />Every site. <span className="text-primary">One console.</span>
            </h1>
            <p className="text-slate-300 text-base leading-relaxed">
              The unified O&amp;M platform for EPCs. Normalize Solis, Growatt, Sungrow and more —
              get alerts, tickets, cleaning workflows and client reports out of the box.
            </p>
            <div className="grid grid-cols-3 gap-6 pt-6">
              <div><div className="text-2xl font-semibold text-primary">4.2<span className="text-slate-400 text-base"> GW</span></div><div className="text-xs text-slate-400 uppercase tracking-wider">Under management</div></div>
              <div><div className="text-2xl font-semibold text-primary">98.7%</div><div className="text-xs text-slate-400 uppercase tracking-wider">Avg PR uptime</div></div>
              <div><div className="text-2xl font-semibold text-primary">&lt; 4h</div><div className="text-xs text-slate-400 uppercase tracking-wider">Alert → resolve</div></div>
            </div>
          </div>
          <p className="text-xs text-slate-500">&copy; {new Date().getFullYear()} Solar Assist</p>
        </div>
      </div>

      <div className="flex items-center justify-center p-6 lg:p-12">
        <Card className="w-full max-w-md border-none shadow-none lg:shadow-sm lg:border" data-testid="login-card">
          <CardHeader>
            <div className="lg:hidden flex items-center gap-2 mb-4">
              <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center">
                <Sun className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="font-display font-semibold text-lg">Solar Assist</span>
            </div>
            <CardTitle className="text-2xl">Sign in</CardTitle>
            <CardDescription>Enter your credentials to access the platform.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required data-testid="login-email" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required data-testid="login-password" />
              </div>
              <Button type="submit" className="w-full" disabled={loading} data-testid="login-submit">
                {loading ? "Signing in…" : "Sign in"}
              </Button>
              <div className="text-xs text-muted-foreground bg-muted/50 rounded-md p-3 space-y-1">
                <div className="font-medium text-foreground">Demo accounts</div>
                <div>super@solarassist.dev &nbsp;·&nbsp; admin@heliogrid.dev</div>
                <div>tech@heliogrid.dev &nbsp;·&nbsp; client@heliogrid.dev</div>
                <div>Password: <span className="font-mono">Solar@12345</span></div>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

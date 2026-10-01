import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ArrowLeft,
  SprayCan,
  MapPin,
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Zap,
  Wrench,
  Camera,
  FileText,
} from "lucide-react";
import { formatDate, formatDateTime } from "@/lib/utils";
import { CleaningEvidenceLinks } from "@/components/cleaning-evidence-links";

export default async function TechnicianSiteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sb = await createClient();

  const {
    data: { user },
  } = await sb.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: site } = await sb.from("sites").select("*").eq("id", id).maybeSingle();

  if (!site) {
    notFound();
  }

  const [cleaningRes, workOrdersRes, alertsRes, invertersRes] = await Promise.all([
    sb
      .from("cleaning_logs")
      .select("*, profiles!cleaning_logs_performed_by_fkey(full_name, email)")
      .eq("site_id", id)
      .order("performed_at", { ascending: false })
      .limit(20),
    sb
      .from("work_orders")
      .select("*")
      .eq("site_id", id)
      .order("created_at", { ascending: false })
      .limit(10),
    sb
      .from("alerts")
      .select("*")
      .eq("site_id", id)
      .eq("status", "open")
      .order("triggered_at", { ascending: false }),
    sb
      .from("inverters")
      .select("id, model, serial_number, status, capacity_kw")
      .eq("site_id", id),
  ]);

  const cleaningLogs = cleaningRes.data ?? [];
  const workOrders = workOrdersRes.data ?? [];
  const alerts = alertsRes.data ?? [];
  const inverters = invertersRes.data ?? [];

  const now = Date.now();
  const lastCleaned = site.last_cleaned_on ? new Date(site.last_cleaned_on).getTime() : 0;
  const daysSinceClean = lastCleaned > 0 ? Math.floor((now - lastCleaned) / 86400_000) : null;
  const isOverdue =
    daysSinceClean === null || (daysSinceClean !== null && daysSinceClean >= site.cleaning_cycle_days);

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12" data-testid="technician-site-detail">
      {/* Navigation Header */}
      <div className="flex items-center justify-between">
        <Link href="/dashboard">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            <span>Back to My Work</span>
          </Button>
        </Link>
        <Badge
          variant={isOverdue ? "destructive" : "success"}
          className="text-xs px-3 py-1 font-semibold uppercase tracking-wider"
        >
          {isOverdue ? "Cleaning Overdue" : "Cleaned Recently"}
        </Badge>
      </div>

      {/* Main Site Banner */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-4 border-b">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="text-xs text-muted-foreground uppercase font-semibold tracking-wider mb-1">
                Technician Field Hub
              </div>
              <CardTitle className="text-2xl font-bold">{site.name}</CardTitle>
              <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                <MapPin className="h-4 w-4 text-primary shrink-0" />
                {site.location}
              </p>
            </div>

            <Link href={`/technician/cleaning?site_id=${site.id}`}>
              <Button size="lg" className="w-full sm:w-auto gap-2 font-semibold shadow-md">
                <SprayCan className="h-5 w-5" />
                <span>Log Cleaning Now</span>
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent className="pt-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground text-xs block">System Capacity</span>
            <span className="font-bold text-base font-mono">
              {Number(site.capacity_kwp).toLocaleString()} kWp
            </span>
          </div>
          <div>
            <span className="text-muted-foreground text-xs block">Cleaning Cycle</span>
            <span className="font-semibold text-base">Every {site.cleaning_cycle_days} Days</span>
          </div>
          <div>
            <span className="text-muted-foreground text-xs block">Last Cleaned</span>
            <span className="font-semibold text-base">
              {site.last_cleaned_on ? formatDate(site.last_cleaned_on) : "Never Recorded"}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground text-xs block">Days Elapsed</span>
            <span
              className={`font-bold text-base font-mono ${isOverdue ? "text-destructive" : "text-emerald-600"
                }`}
            >
              {daysSinceClean !== null ? `${daysSinceClean} days` : "N/A"}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Active Alerts Banner if any */}
      {alerts.length > 0 && (
        <Card className="border-red-300 bg-red-50/70 dark:bg-red-950/20">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-red-900 dark:text-red-300 text-sm">
                Active Site Alerts ({alerts.length})
              </h3>
              <p className="text-xs text-red-700 dark:text-red-400 mt-0.5">
                {alerts.map((a) => `${a.code}: ${a.title}`).join(" • ")}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Action Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="p-4 flex flex-col justify-between space-y-3 hover:border-primary/50 transition">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-primary font-semibold">
              <Camera className="h-5 w-5" />
              <span>Submit Cleaning Report</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Capture safety gear, before & after panel photos, and report any physical damage observed.
            </p>
          </div>
          <Link href={`/technician/cleaning?site_id=${site.id}`}>
            <Button className="w-full gap-2" variant="default" size="sm">
              <SprayCan className="h-4 w-4" /> Start Cleaning Log
            </Button>
          </Link>
        </Card>

        <Card className="p-4 flex flex-col justify-between space-y-3 hover:border-primary/50 transition">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-semibold">
              <Wrench className="h-5 w-5" />
              <span>Assigned Technical Service Requests</span>
            </div>
            <p className="text-xs text-muted-foreground">
              View open maintenance tickets or assigned technical service requests for this location.
            </p>
          </div>
          <Link href="/service-requests">
            <Button className="w-full gap-2" variant="outline" size="sm">
              <FileText className="h-4 w-4" /> View Service Requests ({workOrders.length})
            </Button>
          </Link>
        </Card>
      </div>

      {/* Site Inverters Quick View */}
      {inverters.length > 0 && (
        <Card>
          <CardHeader className="pb-3 border-b">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              Installed Inverters ({inverters.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
            {inverters.map((inv) => (
              <div
                key={inv.id}
                className="p-3 border rounded-lg bg-muted/30 flex items-center justify-between"
              >
                <div>
                  <div className="font-semibold font-mono">{inv.serial_number}</div>
                  <div className="text-muted-foreground">{inv.model || "Inverter Unit"}</div>
                </div>
                <Badge variant="outline" className="font-mono text-[10px]">
                  {inv.capacity_kw ? `${inv.capacity_kw} kW` : "Online"}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Recent Cleaning Logs History Table */}
      <Card>
        <CardHeader className="pb-3 border-b flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              Cleaning Log History
            </CardTitle>
            <CardDescription className="text-xs">
              Past cleaning completions recorded for {site.name}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {cleaningLogs.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              No cleaning logs recorded for this site yet.
            </div>
          ) : (
            <div className="divide-y text-xs">
              {cleaningLogs.map((log: any) => (
                <div key={log.id} className="p-4 space-y-2 hover:bg-muted/30 transition">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-mono bg-emerald-50 text-emerald-800 border-emerald-300">
                        {formatDateTime(log.performed_at)}
                      </Badge>
                      <span className="font-medium text-foreground">
                        {log.profiles?.full_name || log.profiles?.email || "Technician"}
                      </span>
                    </div>

                    {log.damage_observed && (
                      <Badge variant="destructive" className="text-[10px]">
                        Damage Reported: {log.damage_type || "Yes"}
                      </Badge>
                    )}
                  </div>

                  {log.remarks && (
                    <p className="text-muted-foreground italic">"{log.remarks}"</p>
                  )}

                  <div className="pt-1">
                    <CleaningEvidenceLinks
                      safetyPhotoUrl={log.safety_photo_url}
                      beforePhotoUrl={log.before_photo_url}
                      afterPhotoUrl={log.after_photo_url}
                      damagePhotoUrl={log.damage_photo_url}
                      damageObserved={log.damage_observed}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

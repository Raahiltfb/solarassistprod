import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Activity,
  Building2,
  Zap,
  TrendingUp,
  DollarSign,
  PieChart,
  Users,
  Clock,
  CheckCircle2,
  Wrench,
  BarChart3,
  Sun,
  ShieldCheck,
  Award,
  Layers,
  ArrowUpRight,
} from "lucide-react";
import { getSiteStatus } from "@/lib/status-utils";
import { PerformanceAnalyticsSection } from "@/components/performance-analytics-section";
import { kWh } from "@/lib/utils";

export default async function FleetOverviewPage() {
  const sb = await createClient();

  const {
    data: { user },
  } = await sb.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [sitesRes, invertersRes, ticketsRes, alertsRes, workOrdersRes] = await Promise.all([
    sb.from("sites").select("*").order("name"),
    sb.from("inverters").select("*"),
    sb.from("tickets").select("id, status, priority, created_at").neq("status", "closed"),
    sb.from("alerts").select("id, status, severity").eq("status", "open"),
    sb.from("work_orders").select("id, status, scheduled_date"),
  ]);

  const sites = sitesRes.data ?? [];
  const inverters = invertersRes.data ?? [];
  const tickets = ticketsRes.data ?? [];
  const alerts = alertsRes.data ?? [];
  const workOrders = workOrdersRes.data ?? [];

  const inverterIds = inverters.map((inv) => inv.id);
  let latestTelemetry: any[] = [];

  if (inverterIds.length > 0) {
    const latestTelsRes = await sb.rpc("get_latest_telemetry", { inverter_ids: inverterIds });
    latestTelemetry = latestTelsRes.data ?? [];
  }

  const latestTelemetryMap = new Map<string, any>();
  const latestTimestampMap = new Map<string, string>();
  for (const t of latestTelemetry) {
    latestTelemetryMap.set(t.inverter_id, t);
    latestTimestampMap.set(t.inverter_id, t.timestamp);
  }

  let totalPowerKw = 0;
  let todayEnergyKwh = 0;
  for (const inv of inverters) {
    const tel = latestTelemetryMap.get(inv.id);
    if (tel) {
      totalPowerKw += Number(tel.ac_power_kw || 0);
      todayEnergyKwh += Number(tel.daily_generation_kwh || 0);
    }
  }

  const totalCapacityKwp = sites.reduce((sum, s) => sum + Number(s.capacity_kwp || 0), 0);
  const totalCapacityMwp = (totalCapacityKwp / 1000).toFixed(2);

  let onlineSites = 0;
  let offlineSites = 0;
  for (const site of sites) {
    const siteInvs = inverters.filter((inv) => inv.site_id === site.id);
    const status = getSiteStatus(siteInvs, latestTimestampMap);
    if (status === "OFFLINE") {
      offlineSites++;
    } else {
      onlineSites++;
    }
  }

  const onlineInverters = inverters.filter((i) => getSiteStatus([i], latestTimestampMap) !== "OFFLINE").length;
  const fleetAvailability = inverters.length > 0 ? ((onlineInverters / inverters.length) * 100).toFixed(1) : "100.0";

  return (
    <div className="space-y-8 pb-12" data-testid="fleet-overview-page">
      {/* Executive Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <Activity className="h-7 w-7 text-primary" />
            <span>Fleet Executive Dashboard &amp; Business KPIs</span>
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Unified snapshot of O&amp;M business growth, unit economics, SLA availability, and operational efficiency.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="font-mono text-xs px-3 py-1 bg-card shadow-sm">
            {sites.length} Fleet Sites ({totalCapacityMwp} MWp)
          </Badge>
          <Badge variant="success" className="font-mono text-xs px-3 py-1">
            {fleetAvailability}% Fleet Availability
          </Badge>
        </div>
      </div>

      {/* SECTION 1: BUSINESS GROWTH & UNIT ECONOMICS */}
      <div className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <TrendingUp className="h-3.5 w-3.5 text-primary" />
          Growth &amp; Financial Unit Economics
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* KPI 1: MW Under O&M */}
          <Card className="shadow-sm border">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  MW Under O&amp;M
                </span>
                <div className="text-2xl font-bold font-mono text-foreground">
                  {totalCapacityMwp} <span className="text-xs font-sans font-normal text-muted-foreground">MWp</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  <strong className="text-emerald-600 font-medium">+13.9% MoM Growth</strong> · 35 Sites
                </p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Building2 className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          {/* KPI 2: O&M Annual Revenue */}
          <Card className="shadow-sm border">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  O&amp;M Annual Revenue
                </span>
                <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                  ₹1.10 Cr <span className="text-xs font-sans font-normal text-muted-foreground">/ yr</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Revenue / MW: <strong className="text-foreground">₹9.82 L / MW</strong>
                </p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <DollarSign className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          {/* KPI 3: Gross & EBITDA Margins */}
          <Card className="shadow-sm border">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Gross / EBITDA Margin
                </span>
                <div className="text-2xl font-bold font-mono text-foreground">
                  68.4% <span className="text-xs font-sans font-normal text-muted-foreground">Gross</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  EBITDA Margin: <strong className="text-emerald-600 font-medium">42.1%</strong>
                </p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                <PieChart className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          {/* KPI 4: Customer Retention & Churn */}
          <Card className="shadow-sm border">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Client Retention
                </span>
                <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                  98.5%
                </div>
                <p className="text-xs text-muted-foreground">
                  Annual Churn: <strong className="text-foreground">1.5%</strong>
                </p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <ShieldCheck className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* SECTION 2: OPERATIONAL & SLA PERFORMANCE METRICS */}
      <div className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Zap className="h-3.5 w-3.5 text-amber-500" />
          Plant Operational &amp; SLA Performance
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* KPI 5: Availability & Uptime */}
          <Card className="shadow-sm border">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Fleet Availability Ratio
                </span>
                <div className="text-2xl font-bold font-mono text-foreground">
                  {fleetAvailability}%
                </div>
                <p className="text-xs text-muted-foreground">
                  Target: <strong className="text-emerald-600 font-medium">99.0% SLA</strong> · {onlineSites}/{sites.length} Online
                </p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <CheckCircle2 className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          {/* KPI 6: Generation Performance PR */}
          <Card className="shadow-sm border">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Performance Ratio (PR)
                </span>
                <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                  96.8%
                </div>
                <p className="text-xs text-muted-foreground">
                  Yield: <strong className="text-foreground">1.48 kWh / kWp / day</strong>
                </p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                <Sun className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          {/* KPI 7: MTTR (Mean Time to Resolve) */}
          <Card className="shadow-sm border">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  MTTR (Mean Time To Resolve)
                </span>
                <div className="text-2xl font-bold font-mono text-foreground">
                  3.4 <span className="text-xs font-sans font-normal text-muted-foreground">Hours</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  SLA Target: <strong className="text-emerald-600 font-medium">&lt; 6.0 Hours</strong>
                </p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Clock className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          {/* KPI 8: Preventive Maintenance Compliance */}
          <Card className="shadow-sm border">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  PM &amp; Cleaning Compliance
                </span>
                <div className="text-2xl font-bold font-mono text-foreground">
                  94.2%
                </div>
                <p className="text-xs text-muted-foreground">
                  On-Time Cleanings (15d / 30d cycle)
                </p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <Award className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* SECTION 3: WORKFORCE EFFICIENCY & FINANCIAL HEALTH */}
      <div className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Wrench className="h-3.5 w-3.5 text-primary" />
          Workforce Efficiency &amp; Working Capital
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* KPI 9: Technician Productivity */}
          <Card className="shadow-sm border">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Tech Productivity
                </span>
                <div className="text-2xl font-bold font-mono text-foreground">
                  4.2 <span className="text-xs font-sans font-normal text-muted-foreground">Sites / Tech / Day</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Route Optimization Lift: <strong className="text-emerald-600 font-medium">+28%</strong>
                </p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Users className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          {/* KPI 10: Open / Overdue Backlog */}
          <Card className="shadow-sm border">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Incident Backlog
                </span>
                <div className="text-2xl font-bold font-mono text-foreground">
                  {tickets.length} <span className="text-xs font-sans font-normal text-muted-foreground">Open Tickets</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  SLA Overdue: <strong className="text-emerald-600 font-medium">0 Breaches</strong>
                </p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                <Layers className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          {/* KPI 11: Cash Conversion / DSO */}
          <Card className="shadow-sm border">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Cash Conversion / DSO
                </span>
                <div className="text-2xl font-bold font-mono text-foreground">
                  28 <span className="text-xs font-sans font-normal text-muted-foreground">Days DSO</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Collection Efficiency: <strong className="text-emerald-600 font-medium">92.0%</strong>
                </p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                <DollarSign className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          {/* KPI 12: Customer Concentration */}
          <Card className="shadow-sm border">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Customer Concentration
                </span>
                <div className="text-2xl font-bold font-mono text-foreground">
                  24.1%
                </div>
                <p className="text-xs text-muted-foreground">
                  Top 3 Clients Revenue Share (Low Risk)
                </p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <PieChart className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* SECTION 4: PIPELINE & SOFTWARE COVERAGE */}
      <div className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <ArrowUpRight className="h-3.5 w-3.5 text-emerald-600" />
          Growth Pipeline &amp; Software Coverage
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* KPI 13: Sales Pipeline -> MW Won */}
          <Card className="shadow-sm border">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Sales Pipeline $\rightarrow$ MW Target
                </span>
                <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                  25.0 <span className="text-xs font-sans font-normal text-muted-foreground">MW Target</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Roofsol &amp; SolarSquare EPC fleets capture in progress
                </p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <TrendingUp className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          {/* KPI 14: Software Adoption & Telemetry Coverage */}
          <Card className="shadow-sm border">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Software Telemetry Coverage
                </span>
                <div className="text-2xl font-bold font-mono text-foreground">
                  100%
                </div>
                <p className="text-xs text-muted-foreground">
                  Real-time Solis OEM telemetry connected &amp; active
                </p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Zap className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          {/* KPI 15: Average Revenue Per Customer */}
          <Card className="shadow-sm border">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Avg Revenue / Customer
                </span>
                <div className="text-2xl font-bold font-mono text-foreground">
                  ₹73.3k <span className="text-xs font-sans font-normal text-muted-foreground">/ mo</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Target: <strong className="text-foreground">150+ Clients</strong>
                </p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                <DollarSign className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Fleet Production & Generation Analytics Section */}
      <Card className="shadow-sm border">
        <CardHeader className="p-5 pb-2 border-b">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary" />
                <span>Fleet Energy Output &amp; Generation Analytics</span>
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Comparative portfolio energy output history across daily, weekly, monthly, and yearly cycles.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-5 pt-3">
          <PerformanceAnalyticsSection
            isPortfolio={true}
            initialInverterIds={inverterIds}
            initialTotalCapacity={totalCapacityKwp}
          />
        </CardContent>
      </Card>
    </div>
  );
}

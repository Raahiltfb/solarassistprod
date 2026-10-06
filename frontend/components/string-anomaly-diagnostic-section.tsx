"use client";

import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { AlertTriangle, ShieldAlert, Zap, ArrowRight, Wrench, CheckCircle2, Filter } from "lucide-react";
import { analyzeStringAnomalies, StringAnomaly, AnomalyType } from "@/lib/string-anomaly-engine";
import { formatDateTime } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

export function StringAnomalyDiagnosticSection({
  telemetry,
  strings,
  inverters,
  sites,
}: {
  telemetry: any[];
  strings: any[];
  inverters: any[];
  sites: any[];
}) {
  const sb = createClient();

  const anomalies: StringAnomaly[] = analyzeStringAnomalies(telemetry, strings, inverters, sites);

  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [dispatchingId, setDispatchingId] = useState<string | null>(null);

  const filteredAnomalies = anomalies.filter((a) => {
    if (typeFilter === "all") return true;
    return a.type === typeFilter;
  });

  const totalLossKwh = anomalies.reduce((sum, a) => sum + a.estimated_loss_kwh, 0);
  const totalLossInr = anomalies.reduce((sum, a) => sum + a.estimated_loss_inr, 0);
  const disconnectedCount = anomalies.filter((a) => a.type === "string_disconnected").length;
  const sustainedCount = anomalies.filter((a) => a.type === "sustained_underperformance").length;

  async function handleDispatchTicket(anomaly: StringAnomaly) {
    setDispatchingId(anomaly.id);
    try {
      // Get current user profile to set org_id
      const { data: profile } = await sb.from("profiles").select("org_id").limit(1).single();

      const { data: ticket, error } = await sb.from("tickets").insert({
        org_id: profile?.org_id || sites[0]?.org_id,
        site_id: anomaly.site_id,
        inverter_id: anomaly.inverter_id,
        title: `[String Diagnostic] ${anomaly.type.replace("_", " ").toUpperCase()} - ${anomaly.inverter_name} String #${anomaly.string_index}`,
        description: `${anomaly.recommendation}\n\nTechnical Details:\n- Current: ${anomaly.current_a}A (Expected: ${anomaly.expected_current_a}A)\n- Voltage: ${anomaly.voltage_v}V\n- Deviation: ${anomaly.deviation_pct}%\n- Duration: ${anomaly.duration_mins} mins\n- Estimated Generation Loss: ${anomaly.estimated_loss_kwh} kWh (₹${anomaly.estimated_loss_inr})`,
        priority: anomaly.severity === "critical" ? "p1" : anomaly.severity === "high" ? "p2" : "p3",
        status: "open",
      }).select("id").single();

      if (error) throw error;

      toast.success(`Service Ticket created for String #${anomaly.string_index} (${anomaly.inverter_name})`);
    } catch (err: any) {
      toast.error(err.message || "Failed to dispatch ticket");
    }
    setDispatchingId(null);
  }

  return (
    <div className="space-y-6" data-testid="string-anomaly-section">
      {/* Summary KPI Bar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border shadow-sm">
          <CardContent className="pt-4 space-y-1">
            <div className="text-xs text-muted-foreground font-medium">Active String Anomalies</div>
            <div className="text-2xl font-bold font-mono text-foreground">{anomalies.length}</div>
            <div className="text-xs text-muted-foreground">{disconnectedCount} disconnected, {sustainedCount} underperforming</div>
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardContent className="pt-4 space-y-1">
            <div className="text-xs text-muted-foreground font-medium">Disconnected Strings</div>
            <div className="text-2xl font-bold font-mono text-destructive">{disconnectedCount}</div>
            <div className="text-xs text-muted-foreground">0A current while inverter generating</div>
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardContent className="pt-4 space-y-1">
            <div className="text-xs text-muted-foreground font-medium">Estimated Generation Loss</div>
            <div className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400">{totalLossKwh.toFixed(1)} kWh</div>
            <div className="text-xs text-muted-foreground">Across active anomaly durations</div>
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardContent className="pt-4 space-y-1">
            <div className="text-xs text-muted-foreground font-medium">Estimated Financial Impact</div>
            <div className="text-2xl font-bold font-mono text-foreground">₹{totalLossInr.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">Based on ₹7.50/kWh tariff rate</div>
          </CardContent>
        </Card>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          size="sm"
          variant={typeFilter === "all" ? "default" : "outline"}
          onClick={() => setTypeFilter("all")}
          className="text-xs h-7"
        >
          All Anomalies ({anomalies.length})
        </Button>
        <Button
          size="sm"
          variant={typeFilter === "string_disconnected" ? "default" : "outline"}
          onClick={() => setTypeFilter("string_disconnected")}
          className="text-xs h-7"
        >
          Disconnected ({anomalies.filter((a) => a.type === "string_disconnected").length})
        </Button>
        <Button
          size="sm"
          variant={typeFilter === "sustained_underperformance" ? "default" : "outline"}
          onClick={() => setTypeFilter("sustained_underperformance")}
          className="text-xs h-7"
        >
          Sustained Underperformance ({anomalies.filter((a) => a.type === "sustained_underperformance").length})
        </Button>
        <Button
          size="sm"
          variant={typeFilter === "transient_shadow" ? "default" : "outline"}
          onClick={() => setTypeFilter("transient_shadow")}
          className="text-xs h-7"
        >
          Transient Shadows ({anomalies.filter((a) => a.type === "transient_shadow").length})
        </Button>
        <Button
          size="sm"
          variant={typeFilter === "voltage_droop" ? "default" : "outline"}
          onClick={() => setTypeFilter("voltage_droop")}
          className="text-xs h-7"
        >
          Voltage Droop ({anomalies.filter((a) => a.type === "voltage_droop").length})
        </Button>
      </div>

      {/* Anomalies Table / Card List */}
      <Card className="border shadow-sm overflow-hidden">
        <CardHeader className="pb-3 border-b bg-muted/30">
          <CardTitle className="text-sm font-semibold flex items-center justify-between">
            <span>Detected String Anomalies & Field Diagnostic Recommendations</span>
            <span className="text-xs text-muted-foreground font-normal">{filteredAnomalies.length} items shown</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table className="text-xs">
            <TableHeader className="bg-muted/50 uppercase tracking-wider font-semibold">
              <TableRow>
                <TableHead>Severity</TableHead>
                <TableHead>Location & Inverter</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Anomaly Type</TableHead>
                <TableHead className="text-right">Current (I / I_exp)</TableHead>
                <TableHead className="text-right">Voltage</TableHead>
                <TableHead className="text-right">Duration</TableHead>
                <TableHead className="text-right">Est. Loss</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAnomalies.map((anom) => (
                <TableRow key={anom.id} className="hover:bg-muted/30">
                  <TableCell>
                    <Badge 
                      variant={
                        anom.severity === "critical" 
                          ? "destructive" 
                          : anom.severity === "high" 
                          ? "warning" 
                          : "secondary"
                      }
                      className="text-[10px] uppercase font-bold"
                    >
                      {anom.severity}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-semibold">
                    <div>{anom.site_name}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">{anom.inverter_name}</div>
                  </TableCell>
                  <TableCell className="font-bold font-mono">
                    String #{anom.string_index}
                  </TableCell>
                  <TableCell>
                    <div className="font-semibold text-foreground capitalize">
                      {anom.type.replace("_", " ")}
                    </div>
                    <div className="text-[10px] text-muted-foreground line-clamp-1 max-w-[220px]">
                      {anom.recommendation}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    <span className="font-bold text-foreground">{anom.current_a} A</span>
                    <span className="text-muted-foreground text-[10px] block">/ {anom.expected_current_a} A</span>
                  </TableCell>
                  <TableCell className="text-right font-mono">{anom.voltage_v} V</TableCell>
                  <TableCell className="text-right font-mono">{anom.duration_mins}m</TableCell>
                  <TableCell className="text-right font-mono">
                    <div className="font-bold text-amber-600 dark:text-amber-400">{anom.estimated_loss_kwh} kWh</div>
                    <div className="text-[10px] text-muted-foreground">₹{anom.estimated_loss_inr}</div>
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={dispatchingId === anom.id}
                      onClick={() => handleDispatchTicket(anom)}
                      className="h-7 text-xs gap-1 text-primary hover:text-primary-foreground hover:bg-primary"
                    >
                      <Wrench className="h-3 w-3" />
                      <span>{dispatchingId === anom.id ? "Creating..." : "Create Ticket"}</span>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {filteredAnomalies.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    No string anomalies detected for the selected filter.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

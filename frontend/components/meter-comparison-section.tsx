"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Zap, Activity, ShieldAlert, Plus, Calendar, FileText, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { calculateMeterComparison, MeterComparisonResult } from "@/lib/meter-comparison-engine";
import { formatDateTime, formatDate } from "@/lib/utils";

export function MeterComparisonSection({ 
  site, 
  telemetry 
}: { 
  site: any; 
  telemetry: any[];
}) {
  const sb = createClient();

  const [meterReadings, setMeterReadings] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const [addDialogOpen, setAddDialogOpen] = useState<boolean>(false);
  const [meterName, setMeterName] = useState<string>("Utility Export Meter");
  const [meterNumber, setMeterNumber] = useState<string>("MTR-EX-01");
  const [exportKwh, setExportKwh] = useState<string>("");
  const [importKwh, setImportKwh] = useState<string>("0");
  const [peakDemandKw, setPeakDemandKw] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [saving, setSaving] = useState<boolean>(false);

  // Fetch meters and meter_readings for site
  async function loadMeterData() {
    if (!site?.id) return;
    setLoading(true);
    try {
      const { data } = await sb
        .from("meter_readings")
        .select("*")
        .eq("site_id", site.id)
        .order("reading_timestamp", { ascending: false });

      setMeterReadings(data ?? []);
    } catch (err) {
      console.error("Failed to fetch meter readings:", err);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadMeterData();
  }, [site?.id]);

  const result: MeterComparisonResult = calculateMeterComparison(
    site?.id || "",
    site?.name || "Site",
    "2026-10-01",
    "2026-10-06",
    telemetry,
    meterReadings
  );

  async function handleSaveReading() {
    if (!exportKwh || isNaN(Number(exportKwh))) {
      return toast.error("Please enter a valid Export kWh reading.");
    }
    setSaving(true);

    try {
      // 1. Get or create meter record
      let meterId = "";
      const { data: meters } = await sb
        .from("meters")
        .select("id")
        .eq("site_id", site.id)
        .limit(1);

      if (meters && meters.length > 0) {
        meterId = meters[0].id;
      } else {
        const { data: newMeter, error: mErr } = await sb
          .from("meters")
          .insert({
            site_id: site.id,
            meter_number: meterNumber || "MTR-EX-01",
            meter_name: meterName || "Utility Export Meter",
            meter_type: "export",
          })
          .select("id")
          .single();

        if (mErr) throw mErr;
        meterId = newMeter.id;
      }

      // 2. Insert meter reading record
      const { error } = await sb.from("meter_readings").insert({
        meter_id: meterId,
        site_id: site.id,
        reading_timestamp: new Date().toISOString(),
        export_kwh: Number(exportKwh),
        import_kwh: Number(importKwh) || 0,
        peak_demand_kw: peakDemandKw ? Number(peakDemandKw) : null,
        notes: notes || "Logged via Technical Intelligence portal",
      });

      if (error) throw error;

      toast.success("Utility meter reading logged successfully");
      setAddDialogOpen(false);
      setExportKwh("");
      setNotes("");
      loadMeterData();
    } catch (err: any) {
      toast.error(err.message || "Failed to log meter reading");
    }
    setSaving(false);
  }

  return (
    <div className="space-y-6" data-testid="meter-comparison-section">
      {/* Header Action */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-foreground">Utility Meter vs Inverter Balance</h3>
          <p className="text-xs text-muted-foreground">
            Compare aggregated inverter generation against physical utility meter export to calculate electrical transmission losses.
          </p>
        </div>
        <Button size="sm" onClick={() => setAddDialogOpen(true)} className="text-xs h-8 gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Log Physical Meter Reading
        </Button>
      </div>

      {/* Primary KPI & Analysis Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border shadow-sm">
          <CardContent className="pt-4 space-y-1">
            <div className="text-xs text-muted-foreground font-medium">Inverter Telemetry Yield</div>
            <div className="text-2xl font-bold font-mono text-foreground">{result.inverter_total_kwh.toLocaleString()} kWh</div>
            <div className="text-xs text-muted-foreground">Aggregated across all plant inverters</div>
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardContent className="pt-4 space-y-1">
            <div className="text-xs text-muted-foreground font-medium">Utility Meter Export</div>
            <div className="text-2xl font-bold font-mono text-foreground">{result.meter_export_kwh.toLocaleString()} kWh</div>
            <div className="text-xs text-muted-foreground">Physical utility meter delta</div>
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardContent className="pt-4 space-y-1">
            <div className="text-xs text-muted-foreground font-medium">Transmission & Cable Loss</div>
            <div className={`text-2xl font-bold font-mono ${result.loss_pct > 6 ? "text-destructive" : result.loss_pct > 3.5 ? "text-amber-600 font-bold" : "text-emerald-600 font-bold"}`}>
              {result.loss_pct.toFixed(1)}%
            </div>
            <div className="text-xs text-muted-foreground">{result.loss_kwh.toLocaleString()} kWh cable/transformer loss</div>
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardContent className="pt-4 space-y-1">
            <div className="text-xs text-muted-foreground font-medium">Balance Status</div>
            <div className="pt-0.5">
              <Badge 
                variant={
                  result.status === "optimal" 
                    ? "success" 
                    : result.status === "acceptable_loss" 
                    ? "warning" 
                    : "destructive"
                }
                className="text-xs uppercase font-bold py-0.5 px-2.5"
              >
                {result.status.replace("_", " ")}
              </Badge>
            </div>
            <div className="text-xs text-muted-foreground line-clamp-1">{result.notes}</div>
          </CardContent>
        </Card>
      </div>

      {/* Inverter Offline Downtime Alert */}
      {result.inverter_offline_count > 0 && (
        <Card className="border-amber-500/50 bg-amber-500/10 dark:bg-amber-950/20 shadow-sm">
          <CardContent className="pt-4 pb-4 flex items-start gap-3 text-xs">
            <ShieldAlert className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-semibold text-amber-800 dark:text-amber-300">
                Inverter Downtime Detected ({result.inverter_offline_count} Inverter Offline)
              </div>
              <p className="text-amber-700 dark:text-amber-400 leading-relaxed">
                {result.inverter_offline_count} inverter is currently offline or unreachable. Missing generation telemetry is attributable to inverter availability rather than electrical cable transmission loss.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Detailed Actionable Findings List */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3 border-b bg-muted/30">
          <CardTitle className="text-sm font-semibold flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              <span>Diagnostic Findings & Action Reasoning</span>
            </div>
            <span className="text-xs text-muted-foreground font-normal">{result.findings.length} findings identified</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table className="text-xs">
            <TableHeader className="bg-muted/50 uppercase tracking-wider font-semibold">
              <TableRow>
                <TableHead>Severity</TableHead>
                <TableHead>Finding</TableHead>
                <TableHead>Diagnostic Evidence</TableHead>
                <TableHead>Recommended Action</TableHead>
                <TableHead className="text-center">SR Eligibility</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.findings.map((f, idx) => (
                <TableRow key={idx} className="hover:bg-muted/30">
                  <TableCell>
                    <Badge 
                      variant={
                        f.severity === "high" 
                          ? "destructive" 
                          : f.severity === "medium" 
                          ? "warning" 
                          : "secondary"
                      }
                      className="text-[10px] uppercase font-bold"
                    >
                      {f.severity}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-semibold text-foreground max-w-[180px]">
                    {f.finding}
                  </TableCell>
                  <TableCell className="text-muted-foreground max-w-[220px]">
                    {f.evidence}
                  </TableCell>
                  <TableCell className="font-medium text-foreground max-w-[250px]">
                    {f.recommended_action}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge 
                      variant={f.sr_eligibility ? "default" : "outline"}
                      className="text-[10px]"
                    >
                      {f.sr_eligibility ? "Eligible for SR" : "Monitor Only"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Meter Readings History Table */}
      <Card className="border shadow-sm overflow-hidden">
        <CardHeader className="pb-3 border-b bg-muted/30">
          <CardTitle className="text-sm font-semibold">Logged Utility Meter Readings</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table className="text-xs">
            <TableHeader className="bg-muted/50 uppercase tracking-wider font-semibold">
              <TableRow>
                <TableHead>Reading Timestamp</TableHead>
                <TableHead className="text-right">Export Reading (kWh)</TableHead>
                <TableHead className="text-right">Import Reading (kWh)</TableHead>
                <TableHead className="text-right">Peak Demand (kW)</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {meterReadings.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-semibold">{formatDateTime(r.reading_timestamp)}</TableCell>
                  <TableCell className="text-right font-mono font-bold text-foreground">
                    {Number(r.export_kwh).toLocaleString()} kWh
                  </TableCell>
                  <TableCell className="text-right font-mono text-muted-foreground">
                    {Number(r.import_kwh || 0).toLocaleString()} kWh
                  </TableCell>
                  <TableCell className="text-right font-mono text-muted-foreground">
                    {r.peak_demand_kw ? `${r.peak_demand_kw} kW` : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground max-w-[250px] truncate">{r.notes || "—"}</TableCell>
                </TableRow>
              ))}
              {meterReadings.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    No physical meter readings logged yet. Click &quot;Log Physical Meter Reading&quot; above to record utility bill values.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Log Meter Reading Modal */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Log Physical Utility Meter Reading</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 text-xs pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Meter Name</Label>
                <Input
                  value={meterName}
                  onChange={(e) => setMeterName(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Meter Serial Number</Label>
                <Input
                  value={meterNumber}
                  onChange={(e) => setMeterNumber(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Export Active Energy (kWh)</Label>
                <Input
                  type="number"
                  value={exportKwh}
                  onChange={(e) => setExportKwh(e.target.value)}
                  placeholder="e.g. 14250.5"
                  className="h-8 text-xs font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Import Active Energy (kWh)</Label>
                <Input
                  type="number"
                  value={importKwh}
                  onChange={(e) => setImportKwh(e.target.value)}
                  placeholder="e.g. 120"
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Peak Demand (kW) (Optional)</Label>
              <Input
                type="number"
                value={peakDemandKw}
                onChange={(e) => setPeakDemandKw(e.target.value)}
                placeholder="e.g. 245.8"
                className="h-8 text-xs font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Remarks / Calibration Notes</Label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Recorded from Discom Check Meter during monthly billing audit"
                className="h-8 text-xs"
              />
            </div>
          </div>

          <DialogFooter className="pt-2 border-t">
            <Button variant="outline" size="sm" onClick={() => setAddDialogOpen(false)} className="text-xs">
              Cancel
            </Button>
            <Button onClick={handleSaveReading} disabled={saving} size="sm" className="text-xs">
              {saving ? "Saving Reading..." : "Log Meter Reading"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

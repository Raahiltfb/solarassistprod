"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle2, History, ShieldCheck, Clock, FileText } from "lucide-react";
import { formatDateTime } from "@/lib/utils";

export interface ResolvedAnomalyRecord {
  id: string;
  site_id: string;
  site_name: string;
  inverter_name: string;
  string_index: number;
  anomaly_type: string;
  detected_at: string;
  recovered_at: string;
  duration_mins: number;
  ticket_id?: string;
  service_request_id?: string;
  resolution_summary: string;
  recovered_current_a: number;
  expected_current_a: number;
}

export function HistoricalResolvedAnomaliesSection({
  resolvedRecords,
}: {
  resolvedRecords: ResolvedAnomalyRecord[];
}) {
  return (
    <div className="space-y-6" data-testid="historical-resolved-section">
      <Card className="border shadow-sm overflow-hidden">
        <CardHeader className="pb-3 border-b bg-muted/30">
          <CardTitle className="text-sm font-semibold flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span>Resolved Diagnostics & Verified Historical Incidents</span>
            </div>
            <span className="text-xs text-muted-foreground font-normal">{resolvedRecords.length} records retained</span>
          </CardTitle>
          <CardDescription className="text-xs">
            Historical anomalies automatically verified recovered via real-time telemetry stream matching expected peer baseline.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table className="text-xs">
            <TableHeader className="bg-muted/50 uppercase tracking-wider font-semibold">
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Location & Inverter</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Anomaly Type</TableHead>
                <TableHead>Detection Timestamp</TableHead>
                <TableHead>Telemetry Recovery Timestamp</TableHead>
                <TableHead className="text-right">Recovered Current</TableHead>
                <TableHead>Resolution Proof</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {resolvedRecords.map((rec) => (
                <TableRow key={rec.id} className="hover:bg-muted/30">
                  <TableCell>
                    <Badge variant="success" className="text-[10px] uppercase font-bold gap-1 bg-emerald-600 text-white">
                      <CheckCircle2 className="h-3 w-3" /> Recovered
                    </Badge>
                  </TableCell>
                  <TableCell className="font-semibold">
                    <div>{rec.site_name}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">{rec.inverter_name}</div>
                  </TableCell>
                  <TableCell className="font-bold font-mono">
                    String #{rec.string_index}
                  </TableCell>
                  <TableCell className="capitalize font-medium">
                    {rec.anomaly_type.replace("_", " ")}
                  </TableCell>
                  <TableCell className="font-mono text-muted-foreground">
                    {formatDateTime(rec.detected_at)}
                  </TableCell>
                  <TableCell className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                    {formatDateTime(rec.recovered_at)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    <span className="font-bold text-foreground">{rec.recovered_current_a} A</span>
                    <span className="text-muted-foreground text-[10px] block">/ {rec.expected_current_a} A exp</span>
                  </TableCell>
                  <TableCell className="text-muted-foreground max-w-[220px]">
                    <div className="line-clamp-1">{rec.resolution_summary}</div>
                    {rec.ticket_id && (
                      <span className="text-[10px] font-mono text-primary block">Ticket: #{rec.ticket_id.slice(0, 8)}</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {resolvedRecords.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No historical resolved anomalies found for this site.
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

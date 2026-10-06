"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Settings, Info, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Site, SiteCleaningRule } from "@/lib/types";

interface BulkRuleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sites: Site[];
  rules: SiteCleaningRule[];
  onSaved: () => void;
}

export function BulkRuleDialog({ open, onOpenChange, sites, rules, onSaved }: BulkRuleDialogProps) {
  const sb = createClient();

  const [selectedSiteIds, setSelectedSiteIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "unconfigured" | "configured">("all");
  const [normalInterval, setNormalInterval] = useState<string>("15");
  const [monsoonInterval, setMonsoonInterval] = useState<string>("30");
  const [monsoonStart, setMonsoonStart] = useState<string>("06-01");
  const [monsoonEnd, setMonsoonEnd] = useState<string>("09-30");
  const [allowedWeekdays, setAllowedWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [estimatedMins, setEstimatedMins] = useState<string>("90");
  const [requiredTeams, setRequiredTeams] = useState<string>("1");
  const [saving, setSaving] = useState(false);

  const ruleMap = new Map<string, SiteCleaningRule>();
  rules.forEach((r) => ruleMap.set(r.site_id, r));

  const unconfiguredSiteIds = sites
    .filter((s) => {
      const r = ruleMap.get(s.id);
      return !r || !r.is_configured;
    })
    .map((s) => s.id);

  useEffect(() => {
    if (open) {
      if (unconfiguredSiteIds.length > 0) {
        setSelectedSiteIds(unconfiguredSiteIds);
      } else {
        setSelectedSiteIds(sites.map((s) => s.id));
      }
    }
  }, [open, sites.length]);

  const filteredSites = sites.filter((s) => {
    const isConf = ruleMap.get(s.id)?.is_configured;
    const matchesSearch = s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          s.location.toLowerCase().includes(searchQuery.toLowerCase());
    if (statusFilter === "unconfigured") return matchesSearch && !isConf;
    if (statusFilter === "configured") return matchesSearch && isConf;
    return matchesSearch;
  });

  const selectAll = () => setSelectedSiteIds(filteredSites.map((s) => s.id));
  const selectNone = () => setSelectedSiteIds([]);
  const selectUnconfigured = () => setSelectedSiteIds(unconfiguredSiteIds);

  const toggleSite = (id: string) => {
    setSelectedSiteIds((prev) =>
      prev.includes(id) ? prev.filter((sId) => sId !== id) : [...prev, id]
    );
  };

  const toggleWeekday = (day: number) => {
    setAllowedWeekdays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day).sort() : [...prev, day].sort()
    );
  };

  const dayLabels = [
    { id: 1, label: "Mon" },
    { id: 2, label: "Tue" },
    { id: 3, label: "Wed" },
    { id: 4, label: "Thu" },
    { id: 5, label: "Fri" },
    { id: 6, label: "Sat" },
    { id: 7, label: "Sun" },
  ];

  const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const selectedDayNames = allowedWeekdays.map((d) => dayNames[d - 1]);
  let daysSummary = "Any day";
  if (allowedWeekdays.length === 5 && allowedWeekdays.every((d, i) => d === i + 1)) {
    daysSummary = "Monday – Friday";
  } else if (allowedWeekdays.length === 6 && allowedWeekdays.every((d, i) => d === i + 1)) {
    daysSummary = "Monday – Saturday";
  } else if (allowedWeekdays.length > 0) {
    daysSummary = selectedDayNames.join(", ");
  }

  async function handleApplyBulk() {
    if (selectedSiteIds.length === 0) {
      return toast.error("Please select at least one site.");
    }
    setSaving(true);

    const payloadBatch = selectedSiteIds.map((sId) => ({
      site_id: sId,
      is_configured: true,
      normal_interval_days: Number(normalInterval) || 15,
      monsoon_interval_days: Number(monsoonInterval) || 30,
      monsoon_start_md: monsoonStart,
      monsoon_end_md: monsoonEnd,
      allowed_weekdays: allowedWeekdays,
      estimated_cleaning_mins: Number(estimatedMins) || 90,
      required_teams: Number(requiredTeams) || 1,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await sb.from("site_cleaning_rules").upsert(payloadBatch, { onConflict: "site_id" });

    if (error) {
      toast.error(error.message);
    } else {
      toast.success(`Applied cleaning policy to ${selectedSiteIds.length} sites`);
      onSaved();
      onOpenChange(false);
    }
    setSaving(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="pb-2 border-b">
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-primary" />
            <DialogTitle>Bulk Configure Site Cleaning Policies</DialogTitle>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-4 pr-1 text-xs">
          {/* Site Multi-Selection Controls & Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Label className="font-bold">Select Target Sites ({selectedSiteIds.length} / {sites.length})</Label>
                <div className="relative w-48">
                  <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search sites..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-7 text-xs pl-7"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 text-[11px]">
                <button type="button" onClick={selectAll} className="text-primary hover:underline font-medium">
                  Select All ({filteredSites.length})
                </button>
                <span>·</span>
                <button type="button" onClick={selectUnconfigured} className="text-amber-600 hover:underline font-medium">
                  Select Unconfigured ({unconfiguredSiteIds.length})
                </button>
                <span>·</span>
                <button type="button" onClick={selectNone} className="text-muted-foreground hover:underline">
                  Clear
                </button>
              </div>
            </div>

            {/* SCALABLE OPERATIONAL SITE CONFIGURATION TABLE */}
            <div className="max-h-48 overflow-y-auto border rounded-lg bg-card">
              <Table className="text-xs">
                <TableHeader className="sticky top-0 bg-muted/90 backdrop-blur-sm z-10">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-8 h-8 p-2 text-center">
                      <input
                        type="checkbox"
                        checked={filteredSites.length > 0 && filteredSites.every((s) => selectedSiteIds.includes(s.id))}
                        onChange={(e) => {
                          if (e.target.checked) selectAll();
                          else selectNone();
                        }}
                        className="rounded border-gray-300"
                      />
                    </TableHead>
                    <TableHead className="h-8 p-2">Site</TableHead>
                    <TableHead className="h-8 p-2">Location</TableHead>
                    <TableHead className="h-8 p-2 text-right">Capacity</TableHead>
                    <TableHead className="h-8 p-2">Status</TableHead>
                    <TableHead className="h-8 p-2">Current Policy</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSites.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-4 text-muted-foreground">
                        No sites match the current filter.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredSites.map((s) => {
                      const isSelected = selectedSiteIds.includes(s.id);
                      const rule = ruleMap.get(s.id);
                      const isConf = rule?.is_configured;

                      return (
                        <TableRow
                          key={s.id}
                          onClick={() => toggleSite(s.id)}
                          className={`cursor-pointer transition-colors ${
                            isSelected ? "bg-primary/5 font-medium" : ""
                          }`}
                        >
                          <TableCell className="p-2 text-center" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSite(s.id)}
                              className="rounded border-gray-300"
                            />
                          </TableCell>
                          <TableCell className="p-2 font-medium text-foreground">{s.name}</TableCell>
                          <TableCell className="p-2 text-muted-foreground">{s.location}</TableCell>
                          <TableCell className="p-2 text-right font-mono text-muted-foreground">
                            {Number(s.capacity_kwp).toLocaleString()} kWp
                          </TableCell>
                          <TableCell className="p-2">
                            {isConf ? (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-600 font-medium">
                                Configured
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-amber-500/10 text-amber-600 font-medium">
                                Needs Setup
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="p-2 text-muted-foreground text-[11px]">
                            {isConf && rule
                              ? `Every ${rule.normal_interval_days}d (${rule.monsoon_interval_days ? `Monsoon ${rule.monsoon_interval_days}d` : "Default"})`
                              : "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* CLEANING POLICY CONFIGURATION */}
          <div className="space-y-3 pt-2">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Cleaning Policy Settings</div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Normal frequency</Label>
                <Select value={normalInterval} onValueChange={setNormalInterval}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">Every 7 days</SelectItem>
                    <SelectItem value="10">Every 10 days</SelectItem>
                    <SelectItem value="12">Every 12 days</SelectItem>
                    <SelectItem value="15">Every 15 days</SelectItem>
                    <SelectItem value="20">Every 20 days</SelectItem>
                    <SelectItem value="30">Every 30 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Monsoon frequency</Label>
                <Select value={monsoonInterval} onValueChange={setMonsoonInterval}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="15">Every 15 days</SelectItem>
                    <SelectItem value="30">Every 30 days</SelectItem>
                    <SelectItem value="45">Every 45 days</SelectItem>
                    <SelectItem value="60">Every 60 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Monsoon start date (MM-DD)</Label>
                <Input
                  value={monsoonStart}
                  onChange={(e) => setMonsoonStart(e.target.value)}
                  className="h-8 text-xs"
                  placeholder="06-01"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Monsoon end date (MM-DD)</Label>
                <Input
                  value={monsoonEnd}
                  onChange={(e) => setMonsoonEnd(e.target.value)}
                  className="h-8 text-xs"
                  placeholder="09-30"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Allowed days</Label>
              <div className="flex flex-wrap items-center gap-1.5">
                {dayLabels.map((d) => (
                  <label
                    key={d.id}
                    className={`flex items-center justify-center px-2.5 py-1 rounded border cursor-pointer select-none transition-colors ${
                      allowedWeekdays.includes(d.id)
                        ? "bg-primary/10 border-primary text-primary font-semibold"
                        : "bg-background text-muted-foreground border-input"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={allowedWeekdays.includes(d.id)}
                      onChange={() => toggleWeekday(d.id)}
                      className="sr-only"
                    />
                    <span>{d.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Estimated duration (mins)</Label>
                <Input
                  type="number"
                  value={estimatedMins}
                  onChange={(e) => setEstimatedMins(e.target.value)}
                  className="h-8 text-xs"
                  placeholder="e.g. 90 or 1440"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Required Teams / Workforce</Label>
                <Select value={requiredTeams} onValueChange={setRequiredTeams}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 Team (Standard ~2 techs)</SelectItem>
                    <SelectItem value="2">2 Teams (~4 technicians)</SelectItem>
                    <SelectItem value="3">3 Teams (~6 technicians)</SelectItem>
                    <SelectItem value="4">4 Teams (~8 technicians)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* CLEANING POLICY SUMMARY */}
          <div className="p-3 bg-muted/40 border rounded-lg space-y-1.5 text-xs">
            <div className="font-semibold text-foreground flex items-center gap-1.5">
              <Info className="h-3.5 w-3.5 text-muted-foreground" />
              <span>Cleaning Policy Summary</span>
            </div>
            <div className="space-y-1 text-muted-foreground text-[11px] leading-relaxed">
              <div>Normal: Every {normalInterval || "15"} days</div>
              <div>Monsoon: Every {monsoonInterval || "30"} days</div>
              <div>Monsoon period: {monsoonStart} – {monsoonEnd}</div>
              <div>Allowed days: {daysSummary}</div>
              <div>Estimated duration: {estimatedMins} minutes</div>
              <div>Required workforce: {requiredTeams} {Number(requiredTeams) > 1 ? "teams (multi-team dispatch)" : "team"}</div>
            </div>
          </div>
        </div>

        <DialogFooter className="pt-2 border-t flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="text-xs">
            Cancel
          </Button>
          <Button
            onClick={handleApplyBulk}
            disabled={saving || selectedSiteIds.length === 0}
            size="sm"
            variant="default"
            className="text-xs"
          >
            {saving ? "Saving Policy..." : `Save Cleaning Policy (${selectedSiteIds.length} sites)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

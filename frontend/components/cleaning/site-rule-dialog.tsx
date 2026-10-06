"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Calendar, Info, Settings } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Site, SiteCleaningRule } from "@/lib/types";

interface SiteRuleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  site: Site | null;
  rule: SiteCleaningRule | null;
  onSaved: () => void;
}

export function SiteRuleDialog({ open, onOpenChange, site, rule, onSaved }: SiteRuleDialogProps) {
  const sb = createClient();

  const [isOverride, setIsOverride] = useState<boolean>(false);
  const [normalInterval, setNormalInterval] = useState<string>("15");
  const [monsoonInterval, setMonsoonInterval] = useState<string>("30");
  const [monsoonStart, setMonsoonStart] = useState<string>("06-01");
  const [monsoonEnd, setMonsoonEnd] = useState<string>("09-30");
  const [allowedWeekdays, setAllowedWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [estimatedMins, setEstimatedMins] = useState<string>("90");
  const [requiredTeams, setRequiredTeams] = useState<string>("1");
  const [blackoutDatesStr, setBlackoutDatesStr] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (rule) {
      setIsOverride(rule.is_override ?? false);
      setNormalInterval(rule.normal_interval_days ? String(rule.normal_interval_days) : "15");
      setMonsoonInterval(rule.monsoon_interval_days ? String(rule.monsoon_interval_days) : "30");
      setMonsoonStart(rule.monsoon_start_md || "06-01");
      setMonsoonEnd(rule.monsoon_end_md || "09-30");
      setAllowedWeekdays(rule.allowed_weekdays || [1, 2, 3, 4, 5]);
      setEstimatedMins(String(rule.estimated_cleaning_mins || 90));
      setRequiredTeams(String(rule.required_teams || 1));
      setBlackoutDatesStr((rule.blackout_dates || []).join(", "));
    } else {
      setIsOverride(false);
      setNormalInterval("15");
      setMonsoonInterval("30");
      setMonsoonStart("06-01");
      setMonsoonEnd("09-30");
      setAllowedWeekdays([1, 2, 3, 4, 5]);
      setEstimatedMins("90");
      setRequiredTeams("1");
      setBlackoutDatesStr("");
    }
  }, [rule, site]);

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

  async function handleSave() {
    if (!site) return;
    setSaving(true);

    const blackoutDates = blackoutDatesStr
      .split(",")
      .map((s) => s.trim())
      .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s));

    const payload = {
      site_id: site.id,
      is_configured: true,
      is_override: isOverride,
      normal_interval_days: Number(normalInterval) || 15,
      monsoon_interval_days: monsoonInterval ? Number(monsoonInterval) : 30,
      monsoon_start_md: monsoonStart,
      monsoon_end_md: monsoonEnd,
      allowed_weekdays: allowedWeekdays,
      blackout_dates: blackoutDates,
      estimated_cleaning_mins: Number(estimatedMins) || 90,
      required_teams: Number(requiredTeams) || 1,
      updated_at: new Date().toISOString(),
    };

    const { error } = await sb.from("site_cleaning_rules").upsert(payload, { onConflict: "site_id" });

    if (error) {
      toast.error(error.message);
    } else {
      // Also update site's next_cleaning_date and cleaning_cycle_days dynamically from last_cleaned_on + configured interval
      const baseDateStr = site.last_cleaned_on || new Date().toISOString().slice(0, 10);
      const baseDate = new Date(baseDateStr);
      if (!isNaN(baseDate.getTime())) {
        const intervalDays = Number(normalInterval) || 15;
        const nextDate = new Date(baseDate.getTime() + intervalDays * 86400_000);
        if (allowedWeekdays && allowedWeekdays.length > 0) {
          for (let i = 0; i < 7; i++) {
            const day = nextDate.getDay();
            const isoWeekday = day === 0 ? 7 : day;
            if (allowedWeekdays.includes(isoWeekday)) break;
            nextDate.setDate(nextDate.getDate() + 1);
          }
        }
        const nextStr = nextDate.toISOString().slice(0, 10);
        await sb.from("sites").update({
          next_cleaning_date: nextStr,
          cleaning_cycle_days: Number(normalInterval) || 15
        }).eq("id", site.id);
      }

      toast.success(`Cleaning policy saved for ${site.name}`);
      onSaved();
      onOpenChange(false);
    }
    setSaving(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-primary" />
            <DialogTitle>Configure Cleaning Policy</DialogTitle>
          </div>
        </DialogHeader>

        {site && (
          <div className="space-y-4 text-xs">
            {/* SITE SECTION */}
            <div className="space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Site</div>
              <div className="p-3 bg-muted/40 rounded-lg border space-y-0.5">
                <div className="font-bold text-sm text-foreground">{site.name}</div>
                <div className="text-muted-foreground">{site.location} · {Number(site.capacity_kwp).toLocaleString()} kWp</div>
              </div>
            </div>

            {/* CLEANING POLICY SECTION */}
            <div className="space-y-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Cleaning Policy</div>
              
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

              <div className="space-y-1.5">
                <Label>Exceptions (blackout dates)</Label>
                <Input
                  value={blackoutDatesStr}
                  onChange={(e) => setBlackoutDatesStr(e.target.value)}
                  placeholder="2026-09-15, 2026-09-20"
                  className="h-8 text-xs"
                />
              </div>
            </div>

            {/* CONCISE SUMMARY OF WHAT SOLARASSIST WILL DO */}
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
                {site?.last_cleaned_on && (
                  <div>
                    Last completed cleaning: <span className="font-mono text-foreground font-medium">{site.last_cleaned_on}</span>
                  </div>
                )}
                {(() => {
                  const baseDateStr = site?.last_cleaned_on || new Date().toISOString().slice(0, 10);
                  const baseDate = new Date(baseDateStr);
                  if (isNaN(baseDate.getTime())) return null;

                  const mm = String(baseDate.getMonth() + 1).padStart(2, "0");
                  const dd = String(baseDate.getDate()).padStart(2, "0");
                  const currentMD = `${mm}-${dd}`;
                  const isMonsoon = monsoonStart <= monsoonEnd
                    ? (currentMD >= monsoonStart && currentMD <= monsoonEnd)
                    : (currentMD >= monsoonStart || currentMD <= monsoonEnd);

                  const intervalDays = isMonsoon
                    ? (Number(monsoonInterval) || 30)
                    : (Number(normalInterval) || 15);

                  const nextDate = new Date(baseDate.getTime() + intervalDays * 86400_000);

                  if (allowedWeekdays && allowedWeekdays.length > 0) {
                    for (let i = 0; i < 7; i++) {
                      const day = nextDate.getDay();
                      const isoWeekday = day === 0 ? 7 : day;
                      if (allowedWeekdays.includes(isoWeekday)) break;
                      nextDate.setDate(nextDate.getDate() + 1);
                    }
                  }

                  const nextStr = nextDate.toISOString().slice(0, 10);
                  return (
                    <div className="text-foreground font-medium pt-0.5">
                      Next planned cleaning: <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">{nextStr}</span>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="text-xs">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving} size="sm" variant="default" className="text-xs">
            {saving ? "Saving..." : "Save Cleaning Policy"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

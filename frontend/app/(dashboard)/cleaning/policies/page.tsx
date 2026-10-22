"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SubNav } from "@/components/sub-nav";
import { SiteRuleDialog } from "@/components/cleaning/site-rule-dialog";
import { BulkRuleDialog } from "@/components/cleaning/bulk-rule-dialog";
import { formatDate } from "@/lib/utils";
import { Settings, Search, Edit3, ShieldAlert, CheckCircle2, SlidersHorizontal, MapPin } from "lucide-react";
import type { Site, SiteCleaningRule } from "@/lib/types";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function CleaningPoliciesPage() {
  const sb = createClient();

  const [sites, setSites] = useState<Site[]>([]);
  const [rules, setRules] = useState<SiteCleaningRule[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [regionFilter, setRegionFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Dialogs
  const [bulkOpen, setBulkOpen] = useState(false);
  const [singleOpen, setSingleOpen] = useState(false);
  const [activeSite, setActiveSite] = useState<Site | null>(null);

  async function loadData() {
    setLoading(true);
    const [{ data: sData }, { data: rData }] = await Promise.all([
      sb.from("sites").select("*").order("name"),
      sb.from("site_cleaning_rules").select("*"),
    ]);

    setSites((sData as Site[]) ?? []);
    setRules((rData as SiteCleaningRule[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  const ruleMap = new Map<string, SiteCleaningRule>();
  rules.forEach((r) => ruleMap.set(r.site_id, r));

  const filteredSites = sites.filter((site) => {
    const matchesSearch =
      !search ||
      site.name.toLowerCase().includes(search.toLowerCase()) ||
      (site.location && site.location.toLowerCase().includes(search.toLowerCase()));

    const isPune = (site.location || "").toLowerCase().includes("pune") || (site.location || "").toLowerCase().includes("pimpri");
    const matchesRegion =
      regionFilter === "all" ||
      (regionFilter === "pune" && isPune) ||
      (regionFilter === "mumbai" && !isPune);

    const rule = ruleMap.get(site.id);
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "override" && rule?.is_override) ||
      (statusFilter === "standard" && rule?.is_configured && !rule?.is_override) ||
      (statusFilter === "unconfigured" && (!rule || !rule.is_configured));

    return matchesSearch && matchesRegion && matchesStatus;
  });

  const configuredCount = sites.filter((s) => ruleMap.get(s.id)?.is_configured).length;
  const overrideCount = sites.filter((s) => ruleMap.get(s.id)?.is_override).length;
  const unconfiguredCount = sites.length - configuredCount;

  return (
    <div className="space-y-6 pb-12" data-testid="cleaning-policies-page">
      <SubNav hub="cleaning" />

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight text-foreground">
            Site Cleaning Policies
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Audit recurring maintenance intervals, seasonal weather windows, allowed working days, and crew requirements across all fleet sites.
          </p>
        </div>

        <Button
          onClick={() => setBulkOpen(true)}
          className="text-xs h-9 gap-1.5 shadow-sm"
        >
          <SlidersHorizontal className="h-4 w-4" /> Bulk Configure Policies
        </Button>
      </div>

      {/* Policy Audit Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card className="border shadow-sm">
          <CardContent className="p-4 space-y-1">
            <span className="text-[11px] font-bold uppercase text-muted-foreground">Total Solar Sites</span>
            <div className="text-2xl font-bold font-mono text-foreground">{sites.length}</div>
            <span className="text-xs text-muted-foreground">Fleet installations</span>
          </CardContent>
        </Card>

        <Card className="border shadow-sm bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200/50">
          <CardContent className="p-4 space-y-1">
            <span className="text-[11px] font-bold uppercase text-emerald-700 dark:text-emerald-400">Standard Configured</span>
            <div className="text-2xl font-bold font-mono text-emerald-800 dark:text-emerald-300">
              {configuredCount - overrideCount}
            </div>
            <span className="text-xs text-emerald-600/80 dark:text-emerald-400/80">Following standard policy</span>
          </CardContent>
        </Card>

        <Card className="border shadow-sm bg-blue-50/40 dark:bg-blue-950/20 border-blue-200/50">
          <CardContent className="p-4 space-y-1">
            <span className="text-[11px] font-bold uppercase text-blue-700 dark:text-blue-400">Custom Overrides</span>
            <div className="text-2xl font-bold font-mono text-blue-800 dark:text-blue-300">{overrideCount}</div>
            <span className="text-xs text-blue-600/80 dark:text-blue-400/80">Site-specific rules applied</span>
          </CardContent>
        </Card>

        <Card className={`border shadow-sm ${unconfiguredCount > 0 ? "bg-amber-50/50 border-amber-300 dark:bg-amber-950/20" : ""}`}>
          <CardContent className="p-4 space-y-1">
            <span className="text-[11px] font-bold uppercase text-amber-700 dark:text-amber-400">Unconfigured</span>
            <div className="text-2xl font-bold font-mono text-amber-800 dark:text-amber-300">{unconfiguredCount}</div>
            <span className="text-xs text-amber-600/80 dark:text-amber-400/80">
              {unconfiguredCount > 0 ? "Requires policy assignment" : "All sites fully configured"}
            </span>
          </CardContent>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <Card className="border shadow-sm">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-2.5 text-muted-foreground" />
              <Input
                placeholder="Search site name or location..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 text-xs h-9"
              />
            </div>

            <Select value={regionFilter} onValueChange={setRegionFilter}>
              <SelectTrigger className="text-xs h-9">
                <SelectValue placeholder="All Regions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Regions</SelectItem>
                <SelectItem value="mumbai">Mumbai, MMR &amp; Navi Mumbai (Teams A–D)</SelectItem>
                <SelectItem value="pune">Pune &amp; Pimpri (Team E)</SelectItem>
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="text-xs h-9">
                <SelectValue placeholder="All Policy Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Policy Types</SelectItem>
                <SelectItem value="standard">Standard Default Policy</SelectItem>
                <SelectItem value="override">Custom Site Override</SelectItem>
                <SelectItem value="unconfigured">Unconfigured</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Policies Table */}
      <Card className="border shadow-sm overflow-hidden">
        <CardHeader className="p-6 pb-4 border-b bg-muted/20">
          <CardTitle className="text-base font-bold">Fleet Site Policy Directory</CardTitle>
          <CardDescription className="text-xs">
            Review and adjust operational parameters governing the deterministic scheduling engine for each physical asset.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table className="text-xs">
            <TableHeader className="bg-muted/50 uppercase tracking-wider font-semibold">
              <TableRow>
                <TableHead className="py-3 px-6">Site &amp; Region</TableHead>
                <TableHead className="py-3 px-4 text-center">Policy Status</TableHead>
                <TableHead className="py-3 px-4 text-center">Normal Interval</TableHead>
                <TableHead className="py-3 px-4 text-center">Monsoon Interval</TableHead>
                <TableHead className="py-3 px-4">Allowed Days</TableHead>
                <TableHead className="py-3 px-4 text-center">Required Crew</TableHead>
                <TableHead className="py-3 px-4">Blackout Dates</TableHead>
                <TableHead className="py-3 px-4">Last Cleaned</TableHead>
                <TableHead className="py-3 px-6 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-10 text-muted-foreground">
                    Loading site policies...
                  </TableCell>
                </TableRow>
              ) : filteredSites.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-10 text-muted-foreground">
                    No site policies match your search filters.
                  </TableCell>
                </TableRow>
              ) : (
                filteredSites.map((site) => {
                  const rule = ruleMap.get(site.id);
                  const isPune = (site.location || "").toLowerCase().includes("pune") || (site.location || "").toLowerCase().includes("pimpri");
                  const allowedDaysStr = rule?.allowed_weekdays && rule.allowed_weekdays.length > 0
                    ? rule.allowed_weekdays.map((d) => DAY_NAMES[d - 1]).join(", ")
                    : "Mon–Sat";

                  return (
                    <TableRow key={site.id} className="hover:bg-muted/30">
                      <TableCell className="py-3.5 px-6 font-semibold">
                        <div>
                          <div className="text-foreground">{site.name}</div>
                          <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                            <MapPin className="h-3 w-3 shrink-0" />
                            {site.location || "Maharashtra"}
                            {isPune ? (
                              <Badge variant="outline" className="text-[9px] px-1 py-0 border-pink-400 text-pink-700 bg-pink-500/10">
                                Team E (Pune)
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[9px] px-1 py-0">
                                Teams A–D
                              </Badge>
                            )}
                          </div>
                        </div>
                      </TableCell>

                      <TableCell className="py-3.5 px-4 text-center">
                        {rule?.is_override ? (
                          <Badge variant="secondary" className="text-[10px] bg-blue-500/10 text-blue-700 border-blue-500/30">
                            Custom Override
                          </Badge>
                        ) : rule?.is_configured ? (
                          <Badge variant="outline" className="text-[10px] text-emerald-700 border-emerald-500/30 bg-emerald-500/5">
                            Standard Policy
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="text-[10px]">
                            Unconfigured
                          </Badge>
                        )}
                      </TableCell>

                      <TableCell className="py-3.5 px-4 text-center font-mono font-semibold">
                        {rule?.normal_interval_days ? `${rule.normal_interval_days} days` : "15 days"}
                      </TableCell>

                      <TableCell className="py-3.5 px-4 text-center font-mono text-muted-foreground">
                        {rule?.monsoon_interval_days ? `${rule.monsoon_interval_days} days` : "30 days"}
                      </TableCell>

                      <TableCell className="py-3.5 px-4 text-xs font-mono text-muted-foreground">
                        {allowedDaysStr}
                      </TableCell>

                      <TableCell className="py-3.5 px-4 text-center font-mono font-medium">
                        {rule?.required_teams && rule.required_teams > 1 ? (
                          <Badge variant="outline" className="text-[10px] font-bold text-amber-700 border-amber-400 bg-amber-50">
                            {rule.required_teams} Teams
                          </Badge>
                        ) : (
                          "1 Team"
                        )}
                      </TableCell>

                      <TableCell className="py-3.5 px-4 text-xs text-muted-foreground font-mono">
                        {rule?.blackout_dates && rule.blackout_dates.length > 0 ? (
                          <span className="text-amber-700 dark:text-amber-400 font-semibold">
                            {rule.blackout_dates.length} date(s)
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>

                      <TableCell className="py-3.5 px-4 text-xs font-mono text-muted-foreground">
                        {site.last_cleaned_on ? formatDate(site.last_cleaned_on) : "Never"}
                      </TableCell>

                      <TableCell className="py-3.5 px-6 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs h-7 gap-1"
                          onClick={() => {
                            setActiveSite(site);
                            setSingleOpen(true);
                          }}
                        >
                          <Edit3 className="h-3 w-3" /> Edit Policy
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Modals */}
      <BulkRuleDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        sites={sites}
        rules={rules}
        onSaved={loadData}
      />

      <SiteRuleDialog
        open={singleOpen}
        onOpenChange={setSingleOpen}
        site={activeSite}
        rule={activeSite ? ruleMap.get(activeSite.id) || null : null}
        onSaved={loadData}
      />
    </div>
  );
}

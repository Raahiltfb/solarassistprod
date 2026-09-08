"use client";

import { useState } from "react";
import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Settings, Search, MapPin, Building2, Layers } from "lucide-react";
import { Site, SiteCleaningRule } from "@/lib/types";
import { SiteRuleDialog } from "@/components/cleaning/site-rule-dialog";
import { BulkRuleDialog } from "@/components/cleaning/bulk-rule-dialog";

interface SitesConfigurationTableProps {
  sites: Site[];
  rules: SiteCleaningRule[];
}

export function SitesConfigurationTable({ sites, rules }: SitesConfigurationTableProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [singleSite, setSingleSite] = useState<Site | null>(null);
  const [singleDialogOpen, setSingleDialogOpen] = useState(false);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);

  const ruleMap = new Map<string, SiteCleaningRule>();
  rules.forEach((r) => ruleMap.set(r.site_id, r));

  const filteredSites = sites.filter(
    (s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.location.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* Search & Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="relative w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search sites or locations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 text-xs h-9"
          />
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setBulkDialogOpen(true)}
          className="text-xs h-9 gap-1.5 text-muted-foreground hover:text-foreground"
        >
          <Layers className="h-3.5 w-3.5" />
          <span>Bulk configure sites</span>
        </Button>
      </div>

      {/* OPERATIONAL SITES TABLE */}
      <div className="border rounded-xl bg-card overflow-hidden shadow-sm">
        <Table className="text-xs">
          <TableHeader className="bg-muted/50 uppercase tracking-wider font-semibold">
            <TableRow>
              <TableHead className="py-3 px-4">Site</TableHead>
              <TableHead className="py-3 px-4">Location</TableHead>
              <TableHead className="py-3 px-4 text-right">Capacity</TableHead>
              <TableHead className="py-3 px-4">Cleaning Policy</TableHead>
              <TableHead className="py-3 px-4 text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredSites.map((site) => {
              const rule = ruleMap.get(site.id);
              const isCustom = rule?.is_override === true;

              return (
                <TableRow key={site.id} className="hover:bg-muted/30">
                  <TableCell className="py-3.5 px-4 font-semibold">
                    <Link href={`/sites/${site.id}`} className="hover:underline text-foreground">
                      {site.name}
                    </Link>
                  </TableCell>
                  <TableCell className="py-3.5 px-4 text-muted-foreground">{site.location}</TableCell>
                  <TableCell className="py-3.5 px-4 text-right font-mono font-medium">
                    {Number(site.capacity_kwp).toLocaleString()} kWp
                  </TableCell>
                  <TableCell className="py-3.5 px-4">
                    {isCustom ? (
                      <div className="space-y-0.5">
                        <Badge variant="secondary" className="text-[10px] px-2 py-0.5 font-medium">
                          Custom Policy
                        </Badge>
                        <div className="text-[11px] text-muted-foreground font-mono">
                          Every {rule.normal_interval_days}d (Monsoon {rule.monsoon_interval_days}d)
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-0.5">
                        <Badge variant="outline" className="text-[10px] px-2 py-0.5 font-medium">
                          Default Policy
                        </Badge>
                        <div className="text-[11px] text-muted-foreground font-mono">
                          Every 15d (Monsoon 30d) · Mon–Fri
                        </div>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="py-3.5 px-4 text-right">
                    <Button
                      size="sm"
                      variant={isCustom ? "outline" : "default"}
                      className="h-7 text-xs gap-1"
                      onClick={() => {
                        setSingleSite(site);
                        setSingleDialogOpen(true);
                      }}
                    >
                      <Settings className="h-3 w-3" />
                      <span>{isCustom ? "Edit policy" : "Configure"}</span>
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
            {filteredSites.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  No sites match the current filter.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Individual Site Dialog */}
      <SiteRuleDialog
        open={singleDialogOpen}
        onOpenChange={setSingleDialogOpen}
        site={singleSite}
        rule={singleSite ? ruleMap.get(singleSite.id) || null : null}
        onSaved={() => window.location.reload()}
      />

      {/* Bulk Dialog */}
      <BulkRuleDialog
        open={bulkDialogOpen}
        onOpenChange={setBulkDialogOpen}
        sites={sites}
        rules={rules}
        onSaved={() => window.location.reload()}
      />
    </div>
  );
}

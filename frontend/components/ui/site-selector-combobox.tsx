"use client";

import { useState, useRef, useEffect } from "react";
import { Search, ChevronDown, Building2, Check, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface SiteOption {
  id: string;
  name: string;
  capacity_kwp?: number;
  org_id?: string;
  status?: string;
}

export function SiteSelectorCombobox({
  sites,
  selectedSiteId,
  onSelectSite,
  className,
}: {
  sites: SiteOption[];
  selectedSiteId: string;
  onSelectSite: (site: SiteOption) => void;
  className?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedSite = sites.find((s) => s.id === selectedSiteId) || sites[0];

  const filteredSites = sites.filter((site) =>
    site.name.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className={`relative inline-block text-left w-full sm:w-72 ${className || ""}`}>
      <Button
        type="button"
        variant="outline"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between gap-2 h-9 px-3 text-xs bg-background hover:bg-accent border border-input rounded-md shadow-sm font-medium"
      >
        <div className="flex items-center gap-2 truncate">
          <Building2 className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="truncate font-semibold text-foreground">
            {selectedSite ? selectedSite.name : "Select Site"}
          </span>
          {selectedSite?.capacity_kwp && (
            <span className="text-[10px] text-muted-foreground font-mono shrink-0">
              ({selectedSite.capacity_kwp} kWp)
            </span>
          )}
        </div>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0 opacity-70" />
      </Button>

      {isOpen && (
        <div className="absolute right-0 sm:left-0 mt-1 w-full min-w-[280px] max-w-sm rounded-lg bg-popover text-popover-foreground border shadow-lg z-50 overflow-hidden text-xs">
          <div className="p-2 border-b bg-muted/40 flex items-center gap-2">
            <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <Input
              type="text"
              placeholder="Search site name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-7 text-xs border-none shadow-none focus-visible:ring-0 px-0 bg-transparent"
              autoFocus
            />
          </div>

          <div className="max-h-60 overflow-y-auto p-1 space-y-0.5">
            {filteredSites.map((site) => {
              const isSelected = site.id === selectedSiteId;
              return (
                <button
                  key={site.id}
                  onClick={() => {
                    onSelectSite(site);
                    setIsOpen(false);
                    setSearch("");
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-2 rounded-md text-left transition-colors ${
                    isSelected
                      ? "bg-primary/10 text-primary font-semibold"
                      : "hover:bg-muted text-foreground"
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate">{site.name}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {site.capacity_kwp && (
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {site.capacity_kwp} kWp
                      </span>
                    )}
                    {isSelected && <Check className="h-3.5 w-3.5 text-primary" />}
                  </div>
                </button>
              );
            })}

            {filteredSites.length === 0 && (
              <div className="p-4 text-center text-muted-foreground text-xs">
                No matching sites found.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

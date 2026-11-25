"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { 
  Building2, 
  Cpu, 
  SprayCan, 
  FileCheck2, 
  CheckCircle2, 
  AlertCircle, 
  ArrowRight, 
  ArrowLeft, 
  Plus, 
  Trash2, 
  Loader2, 
  Sparkles,
  ShieldCheck,
  Zap
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  OnboardingRequest, 
  OnboardingInverterPayload,
  validateOnboardingPayload 
} from "@/lib/onboarding/onboarding-engine";
import { ContractType, BillingFrequency, SlaTier } from "@/lib/types";

interface OnboardingWizardProps {
  cleaningLocations: Array<{ id: string; name: string; address: string }>;
  clientProfiles: Array<{ id: string; full_name: string; email: string }>;
}

export function OnboardingWizard({ cleaningLocations, clientProfiles }: OnboardingWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState<number>(1);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [completedSiteId, setCompletedSiteId] = useState<string | null>(null);

  // Form State
  const [siteName, setSiteName] = useState("");
  const [capacityKwp, setCapacityKwp] = useState<number | "">("");
  const [location, setLocation] = useState("");
  const [latitude, setLatitude] = useState<number | "">(19.0760);
  const [longitude, setLongitude] = useState<number | "">(72.8777);
  const [gridTariff, setGridTariff] = useState<number | "">(8.5);
  const [serviceTier, setServiceTier] = useState<"full_om" | "cleaning_only">("full_om");
  const [selectedClientId, setSelectedClientId] = useState<string>("");

  // Inverters
  const [inverters, setInverters] = useState<OnboardingInverterPayload[]>([
    {
      oem: "solis",
      model: "Solis-50K-HV-5G",
      serial_number: "",
      capacity_kw: 50,
      string_count: 8,
      datalogger_sn: "",
    },
  ]);

  // Cleaning
  const [cleaningCycleDays, setCleaningCycleDays] = useState<number>(15);
  const [cleaningLocationId, setCleaningLocationId] = useState<string>("");
  const [waterNotes, setWaterNotes] = useState<string>("Borewell water available on terrace with dedicated booster pump.");

  // Contract & SLA
  const [contractNumber, setContractNumber] = useState<string>(`AMC-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`);
  const [contractType, setContractType] = useState<ContractType>("comprehensive_amc");
  const [startDate, setStartDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [durationMonths, setDurationMonths] = useState<number>(12);
  const [annualValueInr, setAnnualValueInr] = useState<number | "">(75000);
  const [billingFrequency, setBillingFrequency] = useState<BillingFrequency>("monthly");
  const [slaTier, setSlaTier] = useState<SlaTier>("standard");
  const [autoRenew, setAutoRenew] = useState<boolean>(true);

  // Helpers for Inverters List
  function handleAddInverter() {
    setInverters((prev) => [
      ...prev,
      {
        oem: prev[prev.length - 1]?.oem || "solis",
        model: prev[prev.length - 1]?.model || "Solis-50K-HV-5G",
        serial_number: "",
        capacity_kw: prev[prev.length - 1]?.capacity_kw || 50,
        string_count: prev[prev.length - 1]?.string_count || 8,
        datalogger_sn: "",
      },
    ]);
  }

  function handleRemoveInverter(idx: number) {
    if (inverters.length <= 1) return;
    setInverters((prev) => prev.filter((_, i) => i !== idx));
  }

  function handleInverterChange(idx: number, field: keyof OnboardingInverterPayload, val: any) {
    setInverters((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [field]: val };
      return copy;
    });
  }

  // Auto-calculate suggested capacity & contract value
  function handleCapacityChange(val: number | "") {
    setCapacityKwp(val);
    if (typeof val === "number" && val > 0) {
      // Suggest ~₹1,400/kWp/year AMC
      setAnnualValueInr(Math.round(val * 1400));
      // Suggest inverters capacity match
      if (inverters.length === 1) {
        handleInverterChange(0, "capacity_kw", Math.round(val));
      }
    }
  }

  const payload: OnboardingRequest = {
    site: {
      name: siteName,
      capacity_kwp: Number(capacityKwp) || 0,
      location,
      latitude: Number(latitude) || 0,
      longitude: Number(longitude) || 0,
      grid_tariff_inr_per_kwh: gridTariff === "" ? null : Number(gridTariff),
      service_tier: serviceTier,
      client_id: selectedClientId || null,
    },
    inverters,
    cleaning: {
      cleaning_cycle_days: Number(cleaningCycleDays),
      cleaning_location_id: cleaningLocationId || null,
      water_source_notes: waterNotes,
    },
    contract: {
      contract_number: contractNumber,
      contract_type: contractType,
      start_date: startDate,
      duration_months: Number(durationMonths),
      annual_value_inr: Number(annualValueInr) || 0,
      billing_frequency: billingFrequency,
      sla_tier: slaTier,
      auto_renew: autoRenew,
    },
  };

  const validation = validateOnboardingPayload(payload);

  async function handleCompleteOnboarding() {
    setSubmissionError(null);
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to complete onboarding");
      }

      setCompletedSiteId(data.site_id);
      setStep(5);
    } catch (err: any) {
      setSubmissionError(err.message || "An unexpected error occurred during onboarding execution");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Stepper Navigation Indicator */}
      <div className="bg-card border rounded-xl p-4 shadow-xs">
        <div className="grid grid-cols-4 gap-2 text-xs">
          <div className={`flex items-center gap-2 p-2 rounded-lg font-medium transition-colors ${step === 1 ? "bg-primary/10 text-primary font-bold" : step > 1 ? "text-muted-foreground line-through opacity-70" : "text-muted-foreground"}`}>
            <span className="h-5 w-5 rounded-full bg-primary/20 flex items-center justify-center text-[11px] font-mono">1</span>
            <span>Plant & Client</span>
          </div>
          <div className={`flex items-center gap-2 p-2 rounded-lg font-medium transition-colors ${step === 2 ? "bg-primary/10 text-primary font-bold" : step > 2 ? "text-muted-foreground line-through opacity-70" : "text-muted-foreground"}`}>
            <span className="h-5 w-5 rounded-full bg-primary/20 flex items-center justify-center text-[11px] font-mono">2</span>
            <span>Inverters & OEM</span>
          </div>
          <div className={`flex items-center gap-2 p-2 rounded-lg font-medium transition-colors ${step === 3 ? "bg-primary/10 text-primary font-bold" : step > 3 ? "text-muted-foreground line-through opacity-70" : "text-muted-foreground"}`}>
            <span className="h-5 w-5 rounded-full bg-primary/20 flex items-center justify-center text-[11px] font-mono">3</span>
            <span>Cleaning Policy</span>
          </div>
          <div className={`flex items-center gap-2 p-2 rounded-lg font-medium transition-colors ${step === 4 || step === 5 ? "bg-primary/10 text-primary font-bold" : "text-muted-foreground"}`}>
            <span className="h-5 w-5 rounded-full bg-primary/20 flex items-center justify-center text-[11px] font-mono">4</span>
            <span>Contract & SLA</span>
          </div>
        </div>
      </div>

      {submissionError && (
        <div className="p-4 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive text-xs flex items-center gap-3">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{submissionError}</span>
        </div>
      )}

      {/* STEP 1: Plant & Client */}
      {step === 1 && (
        <Card className="p-6 space-y-6">
          <div className="border-b pb-4">
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" /> Step 1: Solar Plant & Client Profile
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Enter the site physical specifications, geographic coordinates, and client assignment.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="space-y-1.5 sm:col-span-2">
              <label className="font-semibold text-foreground">Plant Name *</label>
              <Input
                placeholder="e.g. Navratna Solar Park 150kWp"
                value={siteName}
                onChange={(e) => setSiteName(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-foreground">Installed DC Capacity (kWp) *</label>
              <Input
                type="number"
                placeholder="e.g. 150"
                value={capacityKwp}
                onChange={(e) => handleCapacityChange(e.target.value === "" ? "" : Number(e.target.value))}
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-foreground">Service Agreement Tier *</label>
              <select
                value={serviceTier}
                onChange={(e) => setServiceTier(e.target.value as any)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs focus-visible:outline-none"
              >
                <option value="full_om">Full Comprehensive O&M (Electrical + Cleaning)</option>
                <option value="cleaning_only">Preventive Cleaning Only</option>
              </select>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <label className="font-semibold text-foreground">Site Address & Location *</label>
              <Input
                placeholder="e.g. Plot 42, MIDC Industrial Area, Navi Mumbai, Maharashtra"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-foreground">Latitude</label>
              <Input
                type="number"
                step="0.0001"
                value={latitude}
                onChange={(e) => setLatitude(e.target.value === "" ? "" : Number(e.target.value))}
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-foreground">Longitude</label>
              <Input
                type="number"
                step="0.0001"
                value={longitude}
                onChange={(e) => setLongitude(e.target.value === "" ? "" : Number(e.target.value))}
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-foreground">Grid Discom Tariff (₹/kWh)</label>
              <Input
                type="number"
                step="0.1"
                placeholder="e.g. 8.50"
                value={gridTariff}
                onChange={(e) => setGridTariff(e.target.value === "" ? "" : Number(e.target.value))}
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-foreground">Client Portal Account</label>
              <select
                value={selectedClientId}
                onChange={(e) => setSelectedClientId(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs focus-visible:outline-none"
              >
                <option value="">No Client Account (Internal Management)</option>
                {clientProfiles.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name} ({c.email})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t">
            <Button
              onClick={() => setStep(2)}
              disabled={!siteName || !capacityKwp || !location}
              className="gap-2 text-xs"
            >
              <span>Next: Inverters & Telemetry</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </Card>
      )}

      {/* STEP 2: Inverters & Telemetry */}
      {step === 2 && (
        <Card className="p-6 space-y-6">
          <div className="flex items-center justify-between border-b pb-4">
            <div>
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                <Cpu className="h-5 w-5 text-primary" /> Step 2: Solar Inverters & Strings
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Configure inverter hardware models, OEM data telemetry collector, and string configurations.
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={handleAddInverter} className="gap-1.5 text-xs">
              <Plus className="h-3.5 w-3.5" />
              <span>Add Inverter</span>
            </Button>
          </div>

          <div className="space-y-4">
            {inverters.map((inv, idx) => (
              <div key={idx} className="p-4 rounded-xl border bg-muted/20 space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-foreground uppercase tracking-wide">
                    Inverter #{idx + 1}
                  </span>
                  {inverters.length > 1 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleRemoveInverter(idx)}
                      className="h-7 text-xs text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-muted-foreground font-medium">OEM Brand</label>
                    <select
                      value={inv.oem}
                      onChange={(e) => handleInverterChange(idx, "oem", e.target.value)}
                      className="w-full h-8 rounded-md border border-input bg-background px-2.5 py-1 text-xs"
                    >
                      <option value="solis">Solis (Ginlong)</option>
                      <option value="growatt">Growatt</option>
                      <option value="sungrow">Sungrow</option>
                      <option value="feston">Feston (SolarOS)</option>
                      <option value="suryalogix">Suryalogix</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-muted-foreground font-medium">Inverter Model</label>
                    <Input
                      className="h-8 text-xs"
                      placeholder="e.g. Solis-50K-HV-5G"
                      value={inv.model}
                      onChange={(e) => handleInverterChange(idx, "model", e.target.value)}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-muted-foreground font-medium">Inverter Serial Number *</label>
                    <Input
                      className="h-8 text-xs font-mono"
                      placeholder="e.g. 110D822409012"
                      value={inv.serial_number}
                      onChange={(e) => handleInverterChange(idx, "serial_number", e.target.value)}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-muted-foreground font-medium">AC Capacity (kW)</label>
                    <Input
                      type="number"
                      className="h-8 text-xs"
                      value={inv.capacity_kw}
                      onChange={(e) => handleInverterChange(idx, "capacity_kw", Number(e.target.value))}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-muted-foreground font-medium">MPPT String Count</label>
                    <Input
                      type="number"
                      min="1"
                      max="48"
                      className="h-8 text-xs"
                      value={inv.string_count}
                      onChange={(e) => handleInverterChange(idx, "string_count", Number(e.target.value))}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-muted-foreground font-medium">Datalogger / Stick SN</label>
                    <Input
                      className="h-8 text-xs font-mono"
                      placeholder="e.g. 230981920"
                      value={inv.datalogger_sn || ""}
                      onChange={(e) => handleInverterChange(idx, "datalogger_sn", e.target.value)}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-between pt-4 border-t">
            <Button variant="outline" onClick={() => setStep(1)} className="gap-2 text-xs">
              <ArrowLeft className="h-4 w-4" />
              <span>Back</span>
            </Button>
            <Button
              onClick={() => setStep(3)}
              disabled={inverters.some((i) => !i.serial_number)}
              className="gap-2 text-xs"
            >
              <span>Next: Cleaning Policy</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </Card>
      )}

      {/* STEP 3: Cleaning Policy */}
      {step === 3 && (
        <Card className="p-6 space-y-6">
          <div className="border-b pb-4">
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <SprayCan className="h-5 w-5 text-primary" /> Step 3: Preventive Panel Cleaning Operations
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Set module wash cycles and water infrastructure details.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="space-y-1.5">
              <label className="font-semibold text-foreground">Cleaning Cycle Frequency (Days)</label>
              <select
                value={cleaningCycleDays}
                onChange={(e) => setCleaningCycleDays(Number(e.target.value))}
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs"
              >
                <option value={15}>Every 15 Days (High Dust / Industrial Standard)</option>
                <option value={30}>Every 30 Days (Standard Monthly Cycle)</option>
                <option value={45}>Every 45 Days (Extended Cycle)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-foreground">Cleaning Location Cluster</label>
              <select
                value={cleaningLocationId}
                onChange={(e) => setCleaningLocationId(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs"
              >
                <option value="">Independent Site (No Cluster)</option>
                {cleaningLocations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name} ({loc.address})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <label className="font-semibold text-foreground">Water Supply & Site Access Notes</label>
              <Input
                placeholder="e.g. Terrace water tap available, key at security gate."
                value={waterNotes}
                onChange={(e) => setWaterNotes(e.target.value)}
              />
            </div>
          </div>

          <div className="flex justify-between pt-4 border-t">
            <Button variant="outline" onClick={() => setStep(2)} className="gap-2 text-xs">
              <ArrowLeft className="h-4 w-4" />
              <span>Back</span>
            </Button>
            <Button onClick={() => setStep(4)} className="gap-2 text-xs">
              <span>Next: Contract & SLA</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </Card>
      )}

      {/* STEP 4: Contract & SLA Review */}
      {step === 4 && (
        <Card className="p-6 space-y-6">
          <div className="border-b pb-4">
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <FileCheck2 className="h-5 w-5 text-primary" /> Step 4: AMC Contract & SLA Commitments
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Establish contractual commitments, billing cycle rate, and uptime guarantees.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="space-y-1.5">
              <label className="font-semibold text-foreground">Contract Number *</label>
              <Input
                value={contractNumber}
                onChange={(e) => setContractNumber(e.target.value)}
                className="font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-foreground">Contract Type</label>
              <select
                value={contractType}
                onChange={(e) => setContractType(e.target.value as any)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs"
              >
                <option value="comprehensive_amc">Comprehensive AMC (Full Equipment & Labor)</option>
                <option value="semi_comprehensive">Semi-Comprehensive (Labor + Cleaning Only)</option>
                <option value="preventive_cleaning">Preventive Cleaning Only</option>
                <option value="monitoring_only">Supervised Telemetry Monitoring Only</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-foreground">Effective Start Date</label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-foreground">Contract Duration (Months)</label>
              <Input
                type="number"
                min="1"
                max="120"
                value={durationMonths}
                onChange={(e) => setDurationMonths(Number(e.target.value))}
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-foreground">Annual Contract Value (₹/year)</label>
              <Input
                type="number"
                value={annualValueInr}
                onChange={(e) => setAnnualValueInr(e.target.value === "" ? "" : Number(e.target.value))}
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-foreground">Billing Cadence</label>
              <select
                value={billingFrequency}
                onChange={(e) => setBillingFrequency(e.target.value as any)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs"
              >
                <option value="monthly">Monthly Invoicing</option>
                <option value="quarterly">Quarterly Invoicing</option>
                <option value="annually">Annual Upfront</option>
              </select>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <label className="font-semibold text-foreground">Service Level Agreement (SLA) Tier</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <div
                  onClick={() => setSlaTier("premium")}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${slaTier === "premium" ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/40"}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs">Premium</span>
                    <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary">99.0% Uptime</Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    P1 Response: &lt;2h | Resolution: &lt;8h. Penalty: ₹1,000/hr.
                  </p>
                </div>

                <div
                  onClick={() => setSlaTier("standard")}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${slaTier === "standard" ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/40"}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs">Standard</span>
                    <Badge variant="outline" className="text-[10px]">98.0% Uptime</Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    P1 Response: &lt;4h | Resolution: &lt;12h. Penalty: ₹500/hr.
                  </p>
                </div>

                <div
                  onClick={() => setSlaTier("basic")}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${slaTier === "basic" ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/40"}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs">Basic</span>
                    <Badge variant="outline" className="text-[10px]">95.0% Uptime</Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    P1 Response: &lt;8h | Resolution: &lt;24h. Penalty: ₹250/hr.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Pre-launch Summary */}
          <div className="p-4 rounded-xl border bg-muted/30 space-y-2 text-xs">
            <span className="font-bold text-foreground">Pre-flight Verification Summary</span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-muted-foreground">
              <div>Site: <strong className="text-foreground">{siteName}</strong></div>
              <div>Capacity: <strong className="text-foreground">{capacityKwp} kWp</strong></div>
              <div>Inverters: <strong className="text-foreground">{inverters.length} units</strong></div>
              <div>Contract: <strong className="text-foreground">{contractNumber}</strong></div>
            </div>
          </div>

          <div className="flex justify-between pt-4 border-t">
            <Button variant="outline" onClick={() => setStep(3)} className="gap-2 text-xs">
              <ArrowLeft className="h-4 w-4" />
              <span>Back</span>
            </Button>
            <Button
              onClick={handleCompleteOnboarding}
              disabled={isSubmitting || !validation.isValid}
              className="gap-2 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Provisioning Plant...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  <span>Execute Automated Onboarding</span>
                </>
              )}
            </Button>
          </div>
        </Card>
      )}

      {/* STEP 5: Success Screen */}
      {step === 5 && (
        <Card className="p-8 text-center space-y-6">
          <div className="h-16 w-16 rounded-full bg-emerald-500/15 text-emerald-600 flex items-center justify-center mx-auto">
            <CheckCircle2 className="h-8 w-8" />
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-bold font-display text-foreground">
              Plant Successfully Onboarded!
            </h2>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              <strong>{siteName}</strong> ({capacityKwp} kWp) is now actively monitored by Solar Assist. 
              Telemetry mappings, string arrays, cleaning cycle, and AMC contract have been provisioned.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            {completedSiteId && (
              <Button
                onClick={() => router.push(`/sites/${completedSiteId}`)}
                className="gap-2 text-xs"
              >
                <Zap className="h-4 w-4" />
                <span>View Plant Page</span>
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => router.push("/diagnostics")}
              className="gap-2 text-xs"
            >
              <ShieldCheck className="h-4 w-4" />
              <span>Open Technical Intelligence</span>
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setStep(1);
                setSiteName("");
                setCompletedSiteId(null);
              }}
              className="text-xs"
            >
              Onboard Another Plant
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import { createClient } from "@/lib/supabase/client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import { toast } from "sonner";
import { Camera, Image as ImageIcon, AlertTriangle, ArrowLeft } from "lucide-react";

import type { Site } from "@/lib/types";
import { isValidStateTransition } from "@/lib/cleaning-domain";
import { enqueueOfflineAction } from "@/lib/offline-sync";

function CleaningFormContent() {
  const sb = createClient();
  const searchParams = useSearchParams();
  const router = useRouter();

  const queryWoId = searchParams.get("work_order_id");
  const querySiteId = searchParams.get("site_id");

  const [sites, setSites] = useState<Site[]>([]);
  const [open, setOpen] = useState(Boolean(queryWoId));

  const [form, setForm] = useState({
    site_id: querySiteId || "",
    remarks: "",
    safety: "",
    before: "",
    after: "",
    damageObserved: false,
    damageType: "",
    damagePhoto: "",
  });

  const [currentTime, setCurrentTime] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  async function loadSites() {
    const { data } = await sb.from("sites").select("*");

    setSites((data as Site[]) ?? []);
  }

  useEffect(() => {
    loadSites();
    setCurrentTime(new Date().toLocaleString());
    if (querySiteId) {
      setForm((f) => ({ ...f, site_id: querySiteId }));
    }
    if (queryWoId) {
      setOpen(true);
    }
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleString());
    }, 10000);
    return () => clearInterval(timer);
  }, [querySiteId, queryWoId]);

  const isFormValid = Boolean(form.site_id && form.safety && form.before && form.after);

  async function uploadPhoto(
    file: File,
    kind: "safety" | "before" | "after" | "damagePhoto"
  ) {
    if (!navigator.onLine) {
      // Read file as base64 for offline storage
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64Url = reader.result as string;
        setForm((f) => ({ ...f, [kind]: base64Url }));
        toast.info(`${kind} photo saved locally (Offline Mode)`);
      };
      reader.readAsDataURL(file);
      return;
    }

    try {
      const path = `cleaning/${crypto.randomUUID()}-${kind}-${file.name}`;
      const { error } = await sb.storage
        .from("solar-uploads")
        .upload(path, file, { upsert: true });

      if (error) {
        // Fallback to base64 if network fails
        const reader = new FileReader();
        reader.onloadend = () => {
          setForm((f) => ({ ...f, [kind]: reader.result as string }));
          toast.warning(`${kind} photo saved locally`);
        };
        reader.readAsDataURL(file);
        return;
      }

      const { data } = sb.storage.from("solar-uploads").getPublicUrl(path);
      setForm((f) => ({ ...f, [kind]: data.publicUrl }));
      toast.success(`${kind} photo uploaded`);
    } catch (err: any) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setForm((f) => ({ ...f, [kind]: reader.result as string }));
        toast.info(`${kind} photo saved locally`);
      };
      reader.readAsDataURL(file);
    }
  }

  async function submit() {
    if (!form.site_id) {
      return toast.error("Site name is mandatory");
    }

    if (!form.safety) {
      return toast.error("Safety gear photo is mandatory");
    }

    if (!form.before) {
      return toast.error("Before cleaning photo is mandatory");
    }

    if (!form.after) {
      return toast.error("After cleaning photo is mandatory");
    }

    setSubmitting(true);
    const completedAtIso = new Date().toISOString();

    if (!navigator.onLine) {
      const { data: { user } } = await sb.auth.getUser().catch(() => ({ data: { user: null } }));
      enqueueOfflineAction("cleaning_submission", {
        ...form,
        work_order_id: queryWoId || null,
        performed_by: user?.id || null,
        completedAt: completedAtIso,
      });
      toast.warning("Cleaning report saved offline! Will auto-sync when online.");
      setOpen(false);
      setSubmitting(false);
      if (queryWoId) {
        router.push(`/technician/route`);
      }
      return;
    }

    try {
      const {
        data: { user },
      } = await sb.auth.getUser();

      const site = sites.find((s) => s.id === form.site_id);
      const nextDue = site
        ? new Date(Date.now() + site.cleaning_cycle_days * 86400_000)
            .toISOString()
            .slice(0, 10)
        : null;

      const { data: logData, error } = await sb
        .from("cleaning_logs")
        .insert({
          site_id: form.site_id,
          work_order_id: queryWoId || null,
          performed_by: user?.id ?? null,
          performed_at: completedAtIso,
          next_due_on: nextDue,
          remarks: form.remarks,
          safety_photo_url: form.safety,
          before_photo_url: form.before,
          after_photo_url: form.after,
          damage_observed: form.damageObserved,
          damage_type: form.damageObserved ? form.damageType : null,
          damage_photo_url: form.damageObserved ? form.damagePhoto : null,
        })
        .select()
        .single();

      if (error || !logData) {
        enqueueOfflineAction("cleaning_submission", {
          ...form,
          work_order_id: queryWoId || null,
          performed_by: user?.id || null,
          completedAt: completedAtIso,
        });
        toast.warning("Saved report to offline queue due to network delay.");
        setOpen(false);
        setSubmitting(false);
        if (queryWoId) router.push(`/technician/route`);
        return;
      }

      await sb
        .from("sites")
        .update({
          last_cleaned_on: new Date().toISOString().slice(0, 10),
        })
        .eq("id", form.site_id);

      // Sync canonical cleaning_visits record to completed
      const { data: activeVisit } = await sb
        .from("cleaning_visits")
        .select("*")
        .eq("site_id", form.site_id)
        .in("status", ["published", "en_route", "in_progress", "planned", "approved"])
        .order("target_due_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (activeVisit) {
        if (isValidStateTransition(activeVisit.status, "completed")) {
          await sb
            .from("cleaning_visits")
            .update({
              status: "completed",
              execution_log_id: logData.id,
              completed_at: completedAtIso,
              updated_at: completedAtIso,
            })
            .eq("id", activeVisit.id);
        }
      }

      // If originated from a Work Order, mark the work order completed
      if (queryWoId) {
        await sb
          .from("work_orders")
          .update({
            status: "completed",
            completed_at: completedAtIso,
            updated_at: completedAtIso,
          })
          .eq("id", queryWoId);

        toast.success("Task completed!");
      }

      toast.success("Cleaning logged successfully");

      setOpen(false);
      setForm({
        site_id: "",
        remarks: "",
        safety: "",
        before: "",
        after: "",
        damageObserved: false,
        damageType: "",
        damagePhoto: "",
      });

      loadSites();

      if (queryWoId) {
        router.push(`/technician/route`);
      }
    } finally {
      setSubmitting(false);
    }
  }

  const now = Date.now();

  const overdueSites = sites.filter((s) => {
    if (!s.last_cleaned_on) return true;

    const last = new Date(
      s.last_cleaned_on
    ).getTime();

    return (
      (now - last) / 86400_000 >
      s.cleaning_cycle_days
    );
  });

  return (
    <div className="p-4 space-y-4 max-w-xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold">
          Technician Cleaning
        </h1>

        <p className="text-sm text-muted-foreground mt-1">
          Log completed cleanings and report
          site issues.
        </p>
      </div>

      {overdueSites.length > 0 && (
        <Card className="border-red-300 bg-red-50">
          <CardContent className="p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />

              <div>
                <p className="font-medium text-red-700">
                  Overdue Sites
                </p>

                <p className="text-sm text-red-600 mt-1">
                  {overdueSites
                    .map((s) => s.name)
                    .join(", ")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button className="w-full h-12 text-base">
            <Camera className="h-4 w-4 mr-2" />
            Log Cleaning
          </Button>
        </DialogTrigger>

        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Submit Cleaning
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Auto set & uneditable Date & Time of Cleaning */}
            <div className="space-y-2">
              <Label>Date & Time of Cleaning</Label>
              <Input
                type="text"
                value={currentTime || new Date().toLocaleString()}
                disabled
                className="bg-muted text-muted-foreground cursor-not-allowed font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">Automatically set to current date and time</p>
            </div>

            <div className="space-y-2">
              <Label>Site Name <span className="text-red-500">*</span></Label>

              <Select
                value={form.site_id}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    site_id: v,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select site" />
                </SelectTrigger>

                <SelectContent>
                  {sites.map((s) => (
                    <SelectItem
                      key={s.id}
                      value={s.id}
                    >
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>
                Safety Gear Photo <span className="text-red-500">*</span>
              </Label>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex items-center justify-center gap-1.5 px-3 py-2 bg-muted hover:bg-muted/80 rounded-lg text-xs font-medium cursor-pointer border text-foreground">
                  <Camera className="h-4 w-4 shrink-0 text-primary" />
                  <span>Take Photo</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) =>
                      e.target.files?.[0] && uploadPhoto(e.target.files[0], "safety")
                    }
                  />
                </label>
                <label className="flex items-center justify-center gap-1.5 px-3 py-2 bg-muted hover:bg-muted/80 rounded-lg text-xs font-medium cursor-pointer border text-foreground">
                  <ImageIcon className="h-4 w-4 shrink-0 text-primary" />
                  <span>Choose Gallery</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) =>
                      e.target.files?.[0] && uploadPhoto(e.target.files[0], "safety")
                    }
                  />
                </label>
              </div>
              {form.safety ? (
                <p className="text-xs text-green-600 font-medium">
                  ✓ Safety gear photo uploaded
                </p>
              ) : (
                <p className="text-xs text-amber-600">
                  Required: Upload photo of safety gear
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>
                Before Cleaning Photo <span className="text-red-500">*</span>
              </Label>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex items-center justify-center gap-1.5 px-3 py-2 bg-muted hover:bg-muted/80 rounded-lg text-xs font-medium cursor-pointer border text-foreground">
                  <Camera className="h-4 w-4 shrink-0 text-primary" />
                  <span>Take Photo</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) =>
                      e.target.files?.[0] && uploadPhoto(e.target.files[0], "before")
                    }
                  />
                </label>
                <label className="flex items-center justify-center gap-1.5 px-3 py-2 bg-muted hover:bg-muted/80 rounded-lg text-xs font-medium cursor-pointer border text-foreground">
                  <ImageIcon className="h-4 w-4 shrink-0 text-primary" />
                  <span>Choose Gallery</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) =>
                      e.target.files?.[0] && uploadPhoto(e.target.files[0], "before")
                    }
                  />
                </label>
              </div>
              {form.before ? (
                <p className="text-xs text-green-600 font-medium">
                  ✓ Before cleaning photo uploaded
                </p>
              ) : (
                <p className="text-xs text-amber-600">
                  Required: Upload photo of panels before cleaning
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>
                After Cleaning Photo <span className="text-red-500">*</span>
              </Label>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex items-center justify-center gap-1.5 px-3 py-2 bg-muted hover:bg-muted/80 rounded-lg text-xs font-medium cursor-pointer border text-foreground">
                  <Camera className="h-4 w-4 shrink-0 text-primary" />
                  <span>Take Photo</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) =>
                      e.target.files?.[0] && uploadPhoto(e.target.files[0], "after")
                    }
                  />
                </label>
                <label className="flex items-center justify-center gap-1.5 px-3 py-2 bg-muted hover:bg-muted/80 rounded-lg text-xs font-medium cursor-pointer border text-foreground">
                  <ImageIcon className="h-4 w-4 shrink-0 text-primary" />
                  <span>Choose Gallery</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) =>
                      e.target.files?.[0] && uploadPhoto(e.target.files[0], "after")
                    }
                  />
                </label>
              </div>
              {form.after ? (
                <p className="text-xs text-green-600 font-medium">
                  ✓ After cleaning photo uploaded
                </p>
              ) : (
                <p className="text-xs text-amber-600">
                  Required: Upload photo of panels after cleaning
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>
                Damage Observed? (Optional)
              </Label>

              <Select
                value={
                  form.damageObserved
                    ? "yes"
                    : "no"
                }
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    damageObserved:
                      v === "yes",
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>

                <SelectContent>
                  <SelectItem value="no">
                    No
                  </SelectItem>

                  <SelectItem value="yes">
                    Yes
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.damageObserved && (
              <>
                <div className="space-y-2">
                  <Label>Type of Damage</Label>

                  <Select
                    value={form.damageType}
                    onValueChange={(v) =>
                      setForm({
                        ...form,
                        damageType: v,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select issue" />
                    </SelectTrigger>

                    <SelectContent>
                      <SelectItem value="broken_panel">
                        Broken Panel
                      </SelectItem>

                      <SelectItem value="broken_wire">
                        Broken Wire
                      </SelectItem>

                      <SelectItem value="rusting">
                        Rusting
                      </SelectItem>

                      <SelectItem value="beehive">
                        Beehive
                      </SelectItem>

                      <SelectItem value="unsafe_access">
                        Unsafe Access
                      </SelectItem>

                      <SelectItem value="other">
                        Other
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>
                    Damage Photo
                  </Label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex items-center justify-center gap-1.5 px-3 py-2 bg-muted hover:bg-muted/80 rounded-lg text-xs font-medium cursor-pointer border text-foreground">
                      <Camera className="h-4 w-4 shrink-0 text-primary" />
                      <span>Take Photo</span>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={(e) =>
                          e.target.files?.[0] && uploadPhoto(e.target.files[0], "damagePhoto")
                        }
                      />
                    </label>
                    <label className="flex items-center justify-center gap-1.5 px-3 py-2 bg-muted hover:bg-muted/80 rounded-lg text-xs font-medium cursor-pointer border text-foreground">
                      <ImageIcon className="h-4 w-4 shrink-0 text-primary" />
                      <span>Choose Gallery</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) =>
                          e.target.files?.[0] && uploadPhoto(e.target.files[0], "damagePhoto")
                        }
                      />
                    </label>
                  </div>

                  {form.damagePhoto && (
                    <p className="text-xs text-green-600 font-medium">
                      ✓ Damage photo uploaded
                    </p>
                  )}
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label>Remarks</Label>

              <Textarea
                placeholder="Add site observations..."
                value={form.remarks}
                onChange={(e) =>
                  setForm({
                    ...form,
                    remarks: e.target.value,
                  })
                }
              />
            </div>
          </div>

          <DialogFooter className="flex flex-col gap-2 sm:flex-col">
            <Button
              onClick={submit}
              disabled={!isFormValid || submitting}
              className="w-full"
            >
              {submitting ? "Submitting..." : "Log Cleaning"}
            </Button>
            {!isFormValid && (
              <p className="text-xs text-center text-muted-foreground">
                Site selection and all 3 photos (Safety, Before, After) are mandatory to enable submission.
              </p>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function TechnicianCleaningPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-muted-foreground animate-pulse">Loading cleaning form...</div>}>
      <CleaningFormContent />
    </Suspense>
  );
}
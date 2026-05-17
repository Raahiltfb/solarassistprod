"use client";

import { useEffect, useState } from "react";
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
import { Camera, AlertTriangle } from "lucide-react";

import type { Site } from "@/lib/types";

export default function TechnicianCleaningPage() {
  const sb = createClient();

  const [sites, setSites] = useState<Site[]>([]);
  const [open, setOpen] = useState(false);

  const [form, setForm] = useState({
    site_id: "",
    remarks: "",
    safety: "",
    before: "",
    after: "",
    damageObserved: false,
    damageType: "",
    damagePhoto: "",
  });

  async function loadSites() {
    const { data } = await sb.from("sites").select("*");

    setSites((data as Site[]) ?? []);
  }

  useEffect(() => {
    loadSites();
  }, []);

  async function uploadPhoto(
    file: File,
    kind:
      | "safety"
      | "before"
      | "after"
      | "damagePhoto"
  ) {
    const path = `cleaning/${crypto.randomUUID()}-${kind}-${file.name}`;

    const { error } = await sb.storage
      .from("solar-uploads")
      .upload(path, file, { upsert: true });

    if (error) {
      toast.error(error.message);
      return;
    }

    const { data } = sb.storage
      .from("solar-uploads")
      .getPublicUrl(path);

    setForm((f) => ({
      ...f,
      [kind]: data.publicUrl,
    }));

    toast.success(`${kind} photo uploaded`);
  }

  async function submit() {
    if (!form.site_id) {
      return toast.error("Select a site");
    }

    if (!form.safety) {
      return toast.error("Safety gear photo required");
    }

    if (!form.before) {
      return toast.error("Before cleaning photo required");
    }

    if (!form.after) {
      return toast.error("After cleaning photo required");
    }

    const {
      data: { user },
    } = await sb.auth.getUser();

    const site = sites.find(
      (s) => s.id === form.site_id
    );

    const nextDue = site
      ? new Date(
          Date.now() +
            site.cleaning_cycle_days * 86400_000
        )
          .toISOString()
          .slice(0, 10)
      : null;

    const { error } = await sb
      .from("cleaning_logs")
      .insert({
        site_id: form.site_id,
        performed_by: user?.id ?? null,
        performed_at: new Date().toISOString(),
        next_due_on: nextDue,

        remarks: form.remarks,

        safety_photo_url: form.safety,

        before_photo_url: form.before,

        after_photo_url: form.after,

        damage_observed: form.damageObserved,

        damage_type:
          form.damageObserved
            ? form.damageType
            : null,

        damage_photo_url:
          form.damageObserved
            ? form.damagePhoto
            : null,
      });

    if (error) {
      return toast.error(error.message);
    }

    await sb
      .from("sites")
      .update({
        last_cleaned_on: new Date()
          .toISOString()
          .slice(0, 10),
      })
      .eq("id", form.site_id);

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
            <div className="space-y-2">
              <Label>Site</Label>

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
                Safety Gear Photo *
              </Label>

              <Input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) =>
                  e.target.files?.[0] &&
                  uploadPhoto(
                    e.target.files[0],
                    "safety"
                  )
                }
              />

              {form.safety && (
                <p className="text-xs text-green-600">
                  uploaded ✓
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>
                Before Cleaning Photo *
              </Label>

              <Input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) =>
                  e.target.files?.[0] &&
                  uploadPhoto(
                    e.target.files[0],
                    "before"
                  )
                }
              />

              {form.before && (
                <p className="text-xs text-green-600">
                  uploaded ✓
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>
                After Cleaning Photo *
              </Label>

              <Input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) =>
                  e.target.files?.[0] &&
                  uploadPhoto(
                    e.target.files[0],
                    "after"
                  )
                }
              />

              {form.after && (
                <p className="text-xs text-green-600">
                  uploaded ✓
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>
                Damage Observed?
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
                  <Label>Damage Type</Label>

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

                  <Input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) =>
                      e.target.files?.[0] &&
                      uploadPhoto(
                        e.target.files[0],
                        "damagePhoto"
                      )
                    }
                  />

                  {form.damagePhoto && (
                    <p className="text-xs text-green-600">
                      uploaded ✓
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

          <DialogFooter>
            <Button
              onClick={submit}
              className="w-full"
            >
              Submit Cleaning
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
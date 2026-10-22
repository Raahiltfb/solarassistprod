"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { CheckCircle2, AlertTriangle, CalendarCheck } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import { CleaningEvidenceLinks } from "@/components/cleaning-evidence-links";

export function ClientGlobalPopups({ events }: { events: any[] }) {
  const router = useRouter();
  const sb = createClient();
  const [pendingEvents, setPendingEvents] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Filter out events that are pending acknowledgment
    const unacknowledged = events.filter((e) => {
      if (e.actionableStatus !== "pending") return false;
      if (e.actionable === "cleaning_ack") return true;
      if (e.actionable === "cleaning_schedule_ack") {
        const schDateStr = e.actionableContext?.scheduled_date || e.timestamp;
        const todayStr = new Date().toISOString().slice(0, 10);
        const targetStr = (schDateStr || "").slice(0, 10);
        // Show popup for any upcoming scheduled cleaning that client has not yet acknowledged
        return targetStr >= todayStr;
      }
      return false;
    });
    setPendingEvents(unacknowledged);
  }, [events]);

  if (!mounted || pendingEvents.length === 0 || currentIndex >= pendingEvents.length) {
    return null;
  }

  const currentEvent = pendingEvents[currentIndex];
  const isSchedule = currentEvent.actionable === "cleaning_schedule_ack";
  const schDateStr = currentEvent.actionableContext?.scheduled_date || currentEvent.timestamp;
  const todayStr = new Date().toISOString().slice(0, 10);
  const targetStr = (schDateStr || "").slice(0, 10);
  const diffDays = Math.round((new Date(targetStr + "T00:00:00").getTime() - new Date(todayStr + "T00:00:00").getTime()) / 86400000);

  const noticeBadgeText = isSchedule
    ? (diffDays <= 2 ? "Notice: 2 Days in Advance" : `Scheduled for ${targetStr}`)
    : "Service Completed";

  async function handleAcknowledge() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/cleaning/acknowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionId: currentEvent.actionableId,
          isSchedule,
          entityType: currentEvent.actionableContext?.entityType,
        }),
      });

      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error || "Failed to acknowledge");
      }

      toast.success(isSchedule ? "Cleaning schedule acknowledged" : "Completed cleaning visit acknowledged");
      
      // Remove current acknowledged event from pending list immediately so popup disappears
      const nextPending = pendingEvents.filter((_, idx) => idx !== currentIndex);
      setPendingEvents(nextPending);
      router.refresh();
    } catch (e: any) {
      console.error("Acknowledge error:", e);
      toast.error(e.message || "Failed to acknowledge");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={true} onOpenChange={() => {}}>
      <DialogContent className="max-w-md bg-card border shadow-2xl">
        <DialogHeader>
          <div className="flex items-center justify-between mb-1">
            <span className={`text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${
              isSchedule ? "bg-blue-500/10 text-blue-600 dark:text-blue-400" : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            }`}>
              {noticeBadgeText}
            </span>
            <span className="text-xs text-muted-foreground font-mono">
              Solar Assist Care
            </span>
          </div>
          <DialogTitle className="flex items-center gap-2 text-xl font-display">
            {isSchedule ? <CalendarCheck className="h-6 w-6 text-blue-500" /> : <CheckCircle2 className="h-6 w-6 text-emerald-500" />}
            {isSchedule ? "Solar Panel Cleaning Scheduled" : "Solar Panel Cleaning Completed"}
          </DialogTitle>
          <DialogDescription>
            {isSchedule 
              ? "Routine preventive panel washing is scheduled for your site. Power generation remains active during cleaning." 
              : "Your solar modules have been washed and inspected by our certified crew."}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 text-sm mt-2">
          <div className="bg-muted/70 p-4 rounded-xl border border-border/60 space-y-2">
            <div className="font-semibold text-foreground text-sm flex items-center justify-between">
              <span>{currentEvent.title}</span>
              {currentEvent.actionableContext?.site_name && (
                <span className="text-xs text-muted-foreground font-normal">{currentEvent.actionableContext.site_name}</span>
              )}
            </div>
            <div className="text-xs text-muted-foreground leading-relaxed">{currentEvent.description}</div>
            
            {isSchedule && currentEvent.actionableContext?.scheduled_date && (
              <div className="mt-2 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2.5 py-1.5 rounded-lg flex items-center justify-between">
                <span>Target Cleaning Date:</span>
                <span className="font-mono font-bold">{currentEvent.actionableContext.scheduled_date}</span>
              </div>
            )}
            
            {!isSchedule && (
              <div className="mt-2 text-xs text-muted-foreground font-mono bg-background/50 px-2.5 py-1 rounded">
                Completed on: {formatDateTime(currentEvent.timestamp)}
              </div>
            )}
          </div>

          {!isSchedule && currentEvent.actionableContext?.damage_observed && (
            <div className="bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 p-4 rounded-xl">
              <div className="flex items-center gap-2 font-semibold text-xs">
                <AlertTriangle className="h-4 w-4" />
                Damage / Condition Observation Note
              </div>
              <div className="mt-1.5 text-xs leading-relaxed">
                {currentEvent.actionableContext.damage_type || "A potential surface or roof issue was recorded during the cleaning inspection."}
              </div>
              {currentEvent.actionableContext.remarks && (
                <div className="mt-2 text-xs italic bg-background/50 p-2 rounded border border-amber-500/20">
                  &quot;{currentEvent.actionableContext.remarks}&quot;
                </div>
              )}
            </div>
          )}

          {!isSchedule && (
            <div>
              <div className="font-semibold text-xs uppercase tracking-wider text-muted-foreground mb-2">Service Proof Evidence</div>
              <CleaningEvidenceLinks
                safetyPhotoUrl={currentEvent.safety_photo_url}
                beforePhotoUrl={currentEvent.before_photo_url}
                afterPhotoUrl={currentEvent.after_photo_url}
                damagePhotoUrl={currentEvent.damage_photo_url}
                damageObserved={currentEvent.actionableContext?.damage_observed}
              />
            </div>
          )}
        </div>

        <DialogFooter className="mt-6">
          <Button onClick={handleAcknowledge} disabled={submitting} className="w-full h-11 text-sm font-semibold shadow-md">
            {submitting ? "Processing..." : (isSchedule ? "Acknowledge Cleaning Schedule" : "Acknowledge Cleaning Completed")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

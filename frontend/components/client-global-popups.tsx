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
    // Filter out events that are pending
    const unacknowledged = events.filter(e => 
      e.actionableStatus === "pending" && 
      (e.actionable === "cleaning_ack" || e.actionable === "cleaning_schedule_ack")
    );
    setPendingEvents(unacknowledged);
  }, [events]);

  if (!mounted || pendingEvents.length === 0 || currentIndex >= pendingEvents.length) {
    return null;
  }

  const currentEvent = pendingEvents[currentIndex];
  const isSchedule = currentEvent.actionable === "cleaning_schedule_ack";

  async function handleAcknowledge() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/cleaning/acknowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionId: currentEvent.actionableId, isSchedule }),
      });

      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error || "Failed to acknowledge");
      }

      toast.success("Acknowledged successfully");
      
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
      <DialogContent className="max-w-md bg-card border shadow-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-display">
            {isSchedule ? <CalendarCheck className="h-6 w-6 text-blue-500" /> : <CheckCircle2 className="h-6 w-6 text-emerald-500" />}
            {isSchedule ? "Upcoming Cleaning Scheduled" : "Cleaning Completed"}
          </DialogTitle>
          <DialogDescription>
            {isSchedule ? "Your site is scheduled for upcoming maintenance." : "Your site has been successfully cleaned."}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 text-sm mt-2">
          <div className="bg-muted p-4 rounded-lg border border-border/50">
            <div className="font-medium text-foreground text-base">{currentEvent.title}</div>
            <div className="text-muted-foreground mt-2">{currentEvent.description}</div>
            
            {isSchedule && currentEvent.actionableContext?.scheduled_date && (
              <div className="mt-3 font-mono font-semibold text-blue-600 bg-blue-500/10 inline-block px-2 py-1 rounded">
                Scheduled for: {currentEvent.actionableContext.scheduled_date}
              </div>
            )}
            
            {!isSchedule && (
              <div className="mt-3 text-xs text-muted-foreground font-mono">
                Completed on: {formatDateTime(currentEvent.timestamp)}
              </div>
            )}
          </div>

          {!isSchedule && currentEvent.actionableContext?.damage_observed && (
            <div className="bg-amber-500/10 border border-amber-500/30 text-amber-700 p-4 rounded-lg">
              <div className="flex items-center gap-2 font-semibold">
                <AlertTriangle className="h-4 w-4" />
                Damage Observation Report
              </div>
              <div className="mt-2 text-xs leading-relaxed">
                {currentEvent.actionableContext.damage_type || "A potential issue was flagged during cleaning."}
              </div>
              {currentEvent.actionableContext.remarks && (
                <div className="mt-2 text-xs italic">
                  &quot;{currentEvent.actionableContext.remarks}&quot;
                </div>
              )}
            </div>
          )}

          {!isSchedule && (
            <div>
              <div className="font-semibold text-xs uppercase tracking-wider text-muted-foreground mb-2">Service Evidence</div>
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
          <Button onClick={handleAcknowledge} disabled={submitting} className="w-full h-11 text-base font-semibold shadow-md">
            {submitting ? "Processing..." : (isSchedule ? "Acknowledge Schedule" : "Acknowledge Cleaning")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

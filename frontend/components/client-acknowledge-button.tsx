"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";

interface Props {
  logId: string;
}

export function ClientAcknowledgeButton({ logId }: Props) {
  const router = useRouter();
  const [acknowledging, setAcknowledging] = useState(false);

  async function handleAcknowledgeCleaning() {
    setAcknowledging(true);
    try {
      const res = await fetch("/api/cleaning/acknowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionId: logId, isSchedule: false }),
      });

      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error || "Failed to acknowledge");
      }
      
      toast.success("Cleaning acknowledged. Thank you!");
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to acknowledge");
    } finally {
      setAcknowledging(false);
    }
  }

  return (
    <Button 
      size="sm" 
      variant="outline" 
      onClick={handleAcknowledgeCleaning}
      disabled={acknowledging}
      className="h-8 text-xs bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200"
    >
      <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
      {acknowledging ? "Acknowledging..." : "Acknowledge Cleaning"}
    </Button>
  );
}

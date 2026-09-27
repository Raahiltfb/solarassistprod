"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface Props {
  logId: string;
}

export function ClientAcknowledgeButton({ logId }: Props) {
  const [acknowledging, setAcknowledging] = useState(false);
  const sb = createClient();

  async function handleAcknowledgeCleaning() {
    setAcknowledging(true);
    try {
      const { error } = await sb
        .from("cleaning_logs")
        .update({
          client_acknowledged_at: new Date().toISOString(),
          client_acknowledged_damage: true,
        })
        .eq("id", logId);

      if (error) throw error;
      
      toast.success("Cleaning acknowledged. Thank you!");
      window.location.reload();
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

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MapPin, Zap } from "lucide-react";

export default async function SitesPage() {
  const sb = await createClient();
  const { data: sites } = await sb.from("sites").select("*").order("name");

  return (
    <div className="space-y-6" data-testid="sites-page">
      <div>
        <h1 className="text-3xl font-display font-semibold">Sites</h1>
        <p className="text-sm text-muted-foreground mt-1">All installations under your organisation.</p>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Site</TableHead>
                <TableHead>Location</TableHead>
                <TableHead className="text-right">Capacity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last cleaned</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(sites ?? []).map((s) => (
                <TableRow key={s.id} className="cursor-pointer" data-testid={`site-row-${s.id}`}>
                  <TableCell>
                    <Link href={`/sites/${s.id}`} className="font-medium hover:text-primary flex items-center gap-2">
                      <Zap className="h-3.5 w-3.5 text-primary" />{s.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{s.location}</span>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">{Number(s.capacity_kwp).toLocaleString()} kWp</TableCell>
                  <TableCell><Badge variant={s.status === "active" ? "success" : "secondary"} className="capitalize">{s.status}</Badge></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{s.last_cleaned_on ?? "—"}</TableCell>
                </TableRow>
              ))}
              {(!sites || sites.length === 0) && (
                <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground">No sites yet. Seed data with <code>yarn seed</code>.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

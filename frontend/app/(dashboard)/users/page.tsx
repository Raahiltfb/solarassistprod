import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ROLE_LABELS } from "@/lib/permissions";
import { SubNav } from "@/components/sub-nav";

export default async function UsersPage() {
  const sb = await createClient();
  const { data: users } = await sb.from("profiles").select("*").order("created_at", { ascending: false });

  return (
    <div className="space-y-6" data-testid="users-page">
      <SubNav hub="configuration" />
      <div>
        <h1 className="text-3xl font-display font-semibold">Users</h1>
        <p className="text-sm text-muted-foreground mt-1">People with access to your organisation.</p>
      </div>
      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Role</TableHead><TableHead>Joined</TableHead></TableRow></TableHeader>
          <TableBody>
            {(users ?? []).map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.full_name || "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                <TableCell><Badge variant="secondary">{ROLE_LABELS[u.role as keyof typeof ROLE_LABELS] ?? u.role}</Badge></TableCell>
                <TableCell className="text-xs text-muted-foreground">{new Date(u.created_at).toLocaleDateString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}

import { NextResponse } from "next/server";
import { isConfigured, supabase } from "@/lib/supabase";

export async function GET() {
  if (!isConfigured())
    return NextResponse.json(
      { error: "Serviço indisponível" },
      { status: 503 },
    );
  const db = await supabase();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user)
    return NextResponse.json(
      { error: "Entre para exportar seus dados" },
      { status: 401 },
    );
  const { data, error } = await db.rpc("export_my_data");
  if (error)
    return NextResponse.json(
      { error: "Não foi possível exportar seus dados" },
      { status: 500 },
    );
  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": 'attachment; filename="mymeet-meus-dados.json"',
      "X-Content-Type-Options": "nosniff",
    },
  });
}

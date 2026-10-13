import { NextResponse } from "next/server";
import { isConfigured, supabase } from "@/lib/supabase";

const headers = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

export async function GET() {
  if (!isConfigured())
    return NextResponse.json(
      { error: "Serviço indisponível" },
      { status: 503, headers },
    );
  const db = await supabase();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user)
    return NextResponse.json(
      { error: "Entre para exportar seus dados" },
      { status: 401, headers },
    );
  const { data, error } = await db.rpc("export_my_data");
  if (error)
    return NextResponse.json(
      { error: "Não foi possível exportar seus dados" },
      { status: 500, headers },
    );
  return NextResponse.json(data, {
    headers: {
      ...headers,
      "Content-Disposition": 'attachment; filename="nuvemmeet-meus-dados.json"',
    },
  });
}

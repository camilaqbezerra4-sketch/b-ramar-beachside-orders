import { createServerFn } from "@tanstack/react-start";
import { useSession } from "@tanstack/react-start/server";
import { createHash, timingSafeEqual } from "node:crypto";

interface SessaoAdmin {
  liberado?: boolean;
}

function config() {
  return {
    password: process.env["SESSION_SECRET"]!,
    name: "boramar-admin",
    maxAge: 60 * 60 * 24 * 7,
    cookie: {
      httpOnly: true,
      secure: true,
      sameSite: "lax" as const,
      path: "/",
    },
  };
}

function confere(entrada: string, esperada: string) {
  const a = createHash("sha256").update(entrada, "utf8").digest();
  const b = createHash("sha256").update(esperada, "utf8").digest();
  return timingSafeEqual(a, b);
}

async function exigirAdmin() {
  const sessao = await useSession<SessaoAdmin>(config());
  if (!sessao.data.liberado) throw new Error("Acesso negado");
  return sessao;
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const entrarAdmin = createServerFn({ method: "POST" })
  .inputValidator((data: { senha: string }) => data)
  .handler(async ({ data }) => {
    const esperada = process.env["ADMIN_PASSWORD"];
    if (!esperada) throw new Error("ADMIN_PASSWORD não configurada");
    if (!confere(data.senha, esperada)) return { ok: false as const };
    const sessao = await useSession<SessaoAdmin>(config());
    await sessao.update({ liberado: true });
    return { ok: true as const };
  });

export const sairAdmin = createServerFn({ method: "POST" }).handler(async () => {
  const sessao = await useSession<SessaoAdmin>(config());
  await sessao.clear();
  return { ok: true as const };
});

export interface BarracaAdmin {
  id: string;
  slug: string;
  nome: string;
  cidade: string;
  chave_pix: string;
  whatsapp_suporte: string;
  pin: string;
  ativa: boolean;
  mesas: number;
}

export const listarBarracas = createServerFn({ method: "GET" }).handler(async () => {
  const sessao = await useSession<SessaoAdmin>(config());
  if (!sessao.data.liberado) return { liberado: false as const, barracas: [] as BarracaAdmin[] };
  const sb = await admin();
  const { data, error } = await sb
    .from("barracas")
    .select("id, slug, nome, cidade, chave_pix, whatsapp_suporte, pin, ativa")
    .order("criado_em");
  if (error) throw error;
  const { data: mesas } = await sb.from("mesas").select("barraca_id");
  const contagem = new Map<string, number>();
  for (const m of mesas ?? [])
    contagem.set(m.barraca_id, (contagem.get(m.barraca_id) ?? 0) + 1);
  return {
    liberado: true as const,
    barracas: (data ?? []).map((b) => ({
      ...(b as Omit<BarracaAdmin, "mesas">),
      mesas: contagem.get(b.id) ?? 0,
    })),
  };
});

export const criarBarraca = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      nome: string;
      slug: string;
      chave_pix: string;
      cidade: string;
      whatsapp_suporte: string;
      pin: string;
      mesas: number;
    }) => data,
  )
  .handler(async ({ data }) => {
    await exigirAdmin();
    const sb = await admin();
    const { data: nova, error } = await sb
      .from("barracas")
      .insert({
        nome: data.nome,
        slug: data.slug,
        chave_pix: data.chave_pix,
        cidade: data.cidade,
        whatsapp_suporte: data.whatsapp_suporte,
        pin: data.pin,
      })
      .select("id")
      .single();
    if (error) return { ok: false as const, erro: error.message };

    const total = Math.max(1, Math.min(200, Math.floor(data.mesas)));
    await sb.from("mesas").insert(
      Array.from({ length: total }, (_, i) => ({
        barraca_id: nova.id,
        numero: i + 1,
        tem_qrcode: true,
      })),
    );

    // cardápio inicial copiado da barraca de exemplo
    const { data: exemplo } = await sb
      .from("barracas")
      .select("id")
      .eq("slug", "exemplo")
      .maybeSingle();
    if (exemplo) {
      const { data: produtos } = await sb
        .from("produtos")
        .select("nome, categoria, preco, ordem")
        .eq("barraca_id", exemplo.id);
      if (produtos?.length)
        await sb.from("produtos").insert(
          produtos.map((p) => ({ ...p, barraca_id: nova.id, disponivel: true })),
        );
    }
    return { ok: true as const, id: nova.id };
  });

export const atualizarBarraca = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      id: string;
      patch: Partial<Omit<BarracaAdmin, "id" | "mesas">>;
    }) => data,
  )
  .handler(async ({ data }) => {
    await exigirAdmin();
    const sb = await admin();
    const { error } = await sb.from("barracas").update(data.patch).eq("id", data.id);
    if (error) return { ok: false as const, erro: error.message };
    return { ok: true as const };
  });

export const salvarImportacao = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      barracaId: string;
      itens: Array<{ nome: string; categoria: string; preco: number }>;
    }) => data,
  )
  .handler(async ({ data }) => {
    await exigirAdmin();
    const sb = await admin();
    const { error } = await sb.from("produtos").insert(
      data.itens.map((i, idx) => ({
        barraca_id: data.barracaId,
        nome: i.nome,
        categoria: i.categoria,
        preco: i.preco,
        disponivel: true,
        ordem: idx,
      })),
    );
    if (error) return { ok: false as const, erro: error.message };
    return { ok: true as const, total: data.itens.length };
  });

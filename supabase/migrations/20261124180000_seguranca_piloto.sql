-- BóraMar: rodada de segurança para o piloto.
--
-- Antes: o navegador (papel "anon") lia e alterava as tabelas direto,
-- inclusive o PIN da barraca, preços e o campo "pago" dos pedidos.
-- Depois: o navegador não acessa nenhuma tabela de dados. Tudo passa pelo
-- servidor do app (papel "service_role"), que confere o PIN ou a senha do
-- admin. O navegador só escuta a tabela "sinais", que avisa "algo mudou
-- nesta barraca" sem expor nenhum dado.
--
-- Não apaga nem altera dados existentes.

-- 1. Sinais de mudança por barraca (usados pelo tempo real do painel)
CREATE TABLE IF NOT EXISTS public.sinais (
  barraca_id uuid PRIMARY KEY,
  versao bigint NOT NULL DEFAULT 0,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sinais ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sinais FROM anon, authenticated;
GRANT SELECT ON public.sinais TO anon, authenticated;
GRANT ALL ON public.sinais TO service_role;
DROP POLICY IF EXISTS sinais_leitura_publica ON public.sinais;
CREATE POLICY sinais_leitura_publica ON public.sinais
  FOR SELECT TO anon, authenticated USING (true);

CREATE OR REPLACE FUNCTION public.marcar_sinal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  linha record;
  bid uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    linha := OLD;
  ELSE
    linha := NEW;
  END IF;

  IF TG_TABLE_NAME = 'barracas' THEN
    bid := linha.id;
  ELSIF TG_TABLE_NAME = 'itens_pedido' THEN
    SELECT p.barraca_id INTO bid FROM public.pedidos p WHERE p.id = linha.pedido_id;
  ELSE
    bid := linha.barraca_id;
  END IF;

  IF bid IS NOT NULL THEN
    INSERT INTO public.sinais (barraca_id, versao, atualizado_em)
    VALUES (bid, 1, now())
    ON CONFLICT (barraca_id)
    DO UPDATE SET versao = public.sinais.versao + 1, atualizado_em = now();
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.marcar_sinal() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['barracas','mesas','garcons','produtos','pedidos','itens_pedido','liberacoes_mesa'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS t_%s_sinal ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER t_%s_sinal AFTER INSERT OR UPDATE OR DELETE ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.marcar_sinal()', t, t);
  END LOOP;
END $$;

-- 2. Fecha as tabelas de dados para o navegador
DO $$
DECLARE
  t text;
  p record;
BEGIN
  FOREACH t IN ARRAY ARRAY['barracas','mesas','garcons','produtos','pedidos','itens_pedido','liberacoes_mesa'] LOOP
    FOR p IN
      SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t
    LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, t);
    END LOOP;
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- 3. Tempo real: só a tabela de sinais é publicada
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pedidos','itens_pedido','produtos','mesas','liberacoes_mesa'] LOOP
    IF EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I', t);
    END IF;
  END LOOP;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'sinais'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sinais;
  END IF;
END $$;

-- 4. Índices para carregar só o período necessário
CREATE INDEX IF NOT EXISTS idx_pedidos_barraca_criado
  ON public.pedidos (barraca_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_itens_pedido_pedido
  ON public.itens_pedido (pedido_id);
CREATE INDEX IF NOT EXISTS idx_liberacoes_barraca_data
  ON public.liberacoes_mesa (barraca_id, liberada_em DESC);

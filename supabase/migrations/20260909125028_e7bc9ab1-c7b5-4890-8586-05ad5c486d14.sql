ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS forma_pagamento text NOT NULL DEFAULT 'pix';

ALTER TABLE public.pedidos
  DROP CONSTRAINT IF EXISTS pedidos_forma_pagamento_check;
ALTER TABLE public.pedidos
  ADD CONSTRAINT pedidos_forma_pagamento_check
  CHECK (forma_pagamento IN ('pix','cartao'));

CREATE TABLE IF NOT EXISTS public.liberacoes_mesa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barraca_id uuid NOT NULL REFERENCES public.barracas(id) ON DELETE CASCADE,
  mesa_id uuid NOT NULL REFERENCES public.mesas(id) ON DELETE CASCADE,
  liberada_em timestamptz NOT NULL DEFAULT now(),
  criado_em timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_liberacoes_mesa_mesa ON public.liberacoes_mesa (mesa_id, liberada_em DESC);

GRANT SELECT, INSERT ON public.liberacoes_mesa TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.liberacoes_mesa TO authenticated;
GRANT ALL ON public.liberacoes_mesa TO service_role;

ALTER TABLE public.liberacoes_mesa ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS liberacoes_leitura_publica ON public.liberacoes_mesa;
CREATE POLICY liberacoes_leitura_publica ON public.liberacoes_mesa
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS liberacoes_insert_publico ON public.liberacoes_mesa;
CREATE POLICY liberacoes_insert_publico ON public.liberacoes_mesa
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP TRIGGER IF EXISTS t_liberacoes_updated ON public.liberacoes_mesa;
CREATE TRIGGER t_liberacoes_updated BEFORE UPDATE ON public.liberacoes_mesa
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.liberacoes_mesa;
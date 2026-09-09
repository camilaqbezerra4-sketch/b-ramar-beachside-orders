ALTER TABLE public.barracas ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE public.barracas ADD COLUMN IF NOT EXISTS ativa boolean NOT NULL DEFAULT true;
UPDATE public.barracas SET slug = 'exemplo' WHERE slug IS NULL;
UPDATE public.barracas b SET slug = 'barraca-' || left(replace(b.id::text,'-',''), 6)
  WHERE b.slug IS NULL OR b.slug = '';
ALTER TABLE public.barracas ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS barracas_slug_key ON public.barracas (slug);

ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS ordem integer NOT NULL DEFAULT 0;

ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS pedidos_status_valido;
ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS pedidos_status_pago_check;
ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_status_valido
  CHECK (status IN ('novo','pago','em_preparo','pronto','entregue','cancelado','expirado'));
ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_status_pago_check
  CHECK (NOT (status IN ('em_preparo','pronto','entregue') AND pago = false));

CREATE OR REPLACE FUNCTION public.pedidos_regras_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status IN ('em_preparo','pronto','entregue') AND NEW.pago = false THEN
    RAISE EXCEPTION 'Pedido % nao pode ir para % sem pagamento confirmado', NEW.id, NEW.status;
  END IF;
  IF NEW.pago = true AND NEW.pago_em IS NULL THEN
    NEW.pago_em = now();
  END IF;
  IF NEW.pago = false THEN
    NEW.pago_em = NULL;
  END IF;
  RETURN NEW;
END;
$function$;

DROP POLICY IF EXISTS produtos_delete_publico ON public.produtos;
CREATE POLICY produtos_delete_publico ON public.produtos FOR DELETE TO anon, authenticated USING (true);
DROP POLICY IF EXISTS garcons_insert_publico ON public.garcons;
CREATE POLICY garcons_insert_publico ON public.garcons FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS garcons_update_publico ON public.garcons;
CREATE POLICY garcons_update_publico ON public.garcons FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS garcons_delete_publico ON public.garcons;
CREATE POLICY garcons_delete_publico ON public.garcons FOR DELETE TO anon, authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.produtos TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.garcons TO anon, authenticated;
GRANT ALL ON public.produtos TO service_role;
GRANT ALL ON public.garcons TO service_role;
GRANT ALL ON public.barracas TO service_role;
GRANT ALL ON public.mesas TO service_role;
GRANT ALL ON public.pedidos TO service_role;
GRANT ALL ON public.itens_pedido TO service_role;
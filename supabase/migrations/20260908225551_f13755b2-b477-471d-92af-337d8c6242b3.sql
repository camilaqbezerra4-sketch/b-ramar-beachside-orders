CREATE TABLE public.barracas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  chave_pix text NOT NULL DEFAULT '',
  whatsapp_suporte text NOT NULL DEFAULT '',
  criado_em timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.barracas TO authenticated;
GRANT SELECT ON public.barracas TO anon;
GRANT ALL ON public.barracas TO service_role;
ALTER TABLE public.barracas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "barracas_leitura_publica" ON public.barracas FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.mesas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barraca_id uuid NOT NULL REFERENCES public.barracas(id) ON DELETE CASCADE,
  numero integer NOT NULL,
  tem_qrcode boolean NOT NULL DEFAULT false,
  criado_em timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (barraca_id, numero)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mesas TO authenticated;
GRANT SELECT, UPDATE ON public.mesas TO anon;
GRANT ALL ON public.mesas TO service_role;
ALTER TABLE public.mesas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mesas_leitura_publica" ON public.mesas FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "mesas_update_publico" ON public.mesas FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.garcons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barraca_id uuid NOT NULL REFERENCES public.barracas(id) ON DELETE CASCADE,
  nome text NOT NULL,
  chave_pix text NOT NULL DEFAULT '',
  criado_em timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.garcons TO authenticated;
GRANT SELECT ON public.garcons TO anon;
GRANT ALL ON public.garcons TO service_role;
ALTER TABLE public.garcons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "garcons_leitura_publica" ON public.garcons FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.produtos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barraca_id uuid NOT NULL REFERENCES public.barracas(id) ON DELETE CASCADE,
  nome text NOT NULL,
  categoria text NOT NULL DEFAULT 'Bebidas',
  preco numeric(10,2) NOT NULL DEFAULT 0,
  disponivel boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.produtos TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.produtos TO anon;
GRANT ALL ON public.produtos TO service_role;
ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "produtos_leitura_publica" ON public.produtos FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "produtos_insert_publico" ON public.produtos FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "produtos_update_publico" ON public.produtos FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.pedidos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barraca_id uuid NOT NULL REFERENCES public.barracas(id) ON DELETE CASCADE,
  mesa_id uuid NOT NULL REFERENCES public.mesas(id) ON DELETE CASCADE,
  garcom_id uuid REFERENCES public.garcons(id) ON DELETE SET NULL,
  origem text NOT NULL DEFAULT 'cliente',
  status text NOT NULL DEFAULT 'novo',
  pago boolean NOT NULL DEFAULT false,
  total numeric(10,2) NOT NULL DEFAULT 0,
  gorjeta numeric(10,2) NOT NULL DEFAULT 0,
  criado_em timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pedidos TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.pedidos TO anon;
GRANT ALL ON public.pedidos TO service_role;
ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pedidos_leitura_publica" ON public.pedidos FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "pedidos_insert_publico" ON public.pedidos FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "pedidos_update_publico" ON public.pedidos FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.itens_pedido (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  produto_id uuid REFERENCES public.produtos(id) ON DELETE SET NULL,
  nome_produto text NOT NULL,
  quantidade integer NOT NULL DEFAULT 1,
  preco numeric(10,2) NOT NULL DEFAULT 0,
  criado_em timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.itens_pedido TO authenticated;
GRANT SELECT, INSERT ON public.itens_pedido TO anon;
GRANT ALL ON public.itens_pedido TO service_role;
ALTER TABLE public.itens_pedido ENABLE ROW LEVEL SECURITY;
CREATE POLICY "itens_leitura_publica" ON public.itens_pedido FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "itens_insert_publico" ON public.itens_pedido FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER t_barracas_updated BEFORE UPDATE ON public.barracas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t_mesas_updated BEFORE UPDATE ON public.mesas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t_garcons_updated BEFORE UPDATE ON public.garcons FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t_produtos_updated BEFORE UPDATE ON public.produtos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t_pedidos_updated BEFORE UPDATE ON public.pedidos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t_itens_updated BEFORE UPDATE ON public.itens_pedido FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.pedidos REPLICA IDENTITY FULL;
ALTER TABLE public.itens_pedido REPLICA IDENTITY FULL;
ALTER TABLE public.produtos REPLICA IDENTITY FULL;
ALTER TABLE public.mesas REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pedidos;
ALTER PUBLICATION supabase_realtime ADD TABLE public.itens_pedido;
ALTER PUBLICATION supabase_realtime ADD TABLE public.produtos;
ALTER PUBLICATION supabase_realtime ADD TABLE public.mesas;

INSERT INTO public.barracas (id, nome, chave_pix, whatsapp_suporte) VALUES
  ('11111111-1111-4111-8111-111111111111', 'Barraca do Zé — Praia de Boa Viagem', 'boramar@barracadoze.com.br', '5581999990000');

INSERT INTO public.mesas (barraca_id, numero, tem_qrcode)
SELECT '11111111-1111-4111-8111-111111111111', n, n IN (10,12,14,15,16,18)
FROM generate_series(8,19) AS n;

INSERT INTO public.garcons (id, barraca_id, nome, chave_pix) VALUES
  ('22222222-2222-4222-8222-222222222221','11111111-1111-4111-8111-111111111111','Rafa','rafa@pix.com'),
  ('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','Dedé','81988887777'),
  ('22222222-2222-4222-8222-222222222223','11111111-1111-4111-8111-111111111111','Jussara','jussara@pix.com');

INSERT INTO public.produtos (id, barraca_id, nome, categoria, preco, disponivel) VALUES
  ('33333333-3333-4333-8333-333333333301','11111111-1111-4111-8111-111111111111','Água de Coco','Bebidas',10,true),
  ('33333333-3333-4333-8333-333333333302','11111111-1111-4111-8111-111111111111','Caipirinha','Bebidas',22,true),
  ('33333333-3333-4333-8333-333333333303','11111111-1111-4111-8111-111111111111','Cerveja Long Neck','Bebidas',12,true),
  ('33333333-3333-4333-8333-333333333304','11111111-1111-4111-8111-111111111111','Refrigerante Lata','Bebidas',8,true),
  ('33333333-3333-4333-8333-333333333305','11111111-1111-4111-8111-111111111111','Isca de Peixe','Porções',65,true),
  ('33333333-3333-4333-8333-333333333306','11111111-1111-4111-8111-111111111111','Batata Frita','Porções',35,true),
  ('33333333-3333-4333-8333-333333333307','11111111-1111-4111-8111-111111111111','Camarão Alho e Óleo','Porções',89,false),
  ('33333333-3333-4333-8333-333333333308','11111111-1111-4111-8111-111111111111','Açaí na Tigela','Sobremesas',24,true),
  ('33333333-3333-4333-8333-333333333309','11111111-1111-4111-8111-111111111111','Picolé de Coco','Sobremesas',9,false);

INSERT INTO public.pedidos (id, barraca_id, mesa_id, garcom_id, origem, status, pago, total, gorjeta, criado_em) VALUES
  ('44444444-4444-4444-8444-444444444401','11111111-1111-4111-8111-111111111111',(SELECT id FROM public.mesas WHERE numero=14),'22222222-2222-4222-8222-222222222221','cliente','entregue',true,60,5, now() - interval '95 minutes'),
  ('44444444-4444-4444-8444-444444444402','11111111-1111-4111-8111-111111111111',(SELECT id FROM public.mesas WHERE numero=9),'22222222-2222-4222-8222-222222222222','garcom','em_preparo',true,113,0, now() - interval '40 minutes'),
  ('44444444-4444-4444-8444-444444444403','11111111-1111-4111-8111-111111111111',(SELECT id FROM public.mesas WHERE numero=12),'22222222-2222-4222-8222-222222222223','cliente','novo',false,78,10, now() - interval '6 minutes');

INSERT INTO public.itens_pedido (pedido_id, produto_id, nome_produto, quantidade, preco) VALUES
  ('44444444-4444-4444-8444-444444444401','33333333-3333-4333-8333-333333333301','Água de Coco',2,10),
  ('44444444-4444-4444-8444-444444444401','33333333-3333-4333-8333-333333333306','Batata Frita',1,35),
  ('44444444-4444-4444-8444-444444444402','33333333-3333-4333-8333-333333333305','Isca de Peixe',1,65),
  ('44444444-4444-4444-8444-444444444402','33333333-3333-4333-8333-333333333303','Cerveja Long Neck',4,12),
  ('44444444-4444-4444-8444-444444444403','33333333-3333-4333-8333-333333333302','Caipirinha',2,22),
  ('44444444-4444-4444-8444-444444444403','33333333-3333-4333-8333-333333333308','Açaí na Tigela',1,24);
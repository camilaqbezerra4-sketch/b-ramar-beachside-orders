-- BóraMar: custo de cada item do cardápio, para mostrar margem e lucro
-- estimado nos Resultados. Só acrescenta colunas; não altera dados.

-- custo atual do item (preenchido pelo barraqueiro; vazio = não informado)
ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS custo numeric(10,2);

ALTER TABLE public.produtos DROP CONSTRAINT IF EXISTS produtos_custo_valido;
ALTER TABLE public.produtos ADD CONSTRAINT produtos_custo_valido
  CHECK (custo IS NULL OR (custo >= 0 AND custo <= 100000));

-- custo guardado em cada item vendido, no momento da venda
-- (se o custo mudar depois, as vendas antigas continuam com o custo da época)
ALTER TABLE public.itens_pedido
  ADD COLUMN IF NOT EXISTS custo numeric(10,2);

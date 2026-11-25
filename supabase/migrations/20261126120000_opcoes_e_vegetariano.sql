-- BóraMar: escolhas por item (ex.: bebida e frutas da caipirinha), descrição
-- e marcação de vegetariano/vegano. Só acrescenta colunas; não altera dados.

ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS descricao text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS vegetariano boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS vegano boolean NOT NULL DEFAULT false,
  -- grupos de escolha: [{ id, nome, min, max, precoMistura, itens: [{ id, nome, preco, disponivel }] }]
  ADD COLUMN IF NOT EXISTS opcoes jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.produtos DROP CONSTRAINT IF EXISTS produtos_opcoes_lista;
ALTER TABLE public.produtos ADD CONSTRAINT produtos_opcoes_lista
  CHECK (jsonb_typeof(opcoes) = 'array');

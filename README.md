# BóraMar Beachside Orders

Crie um aplicativo web mobile-first chamado "BóraMar" para gestão de pedidos em barracas de praia. Design com tons de azul marinho, areia e laranja suave, alto contraste e fontes grandes para leitura sob sol forte. Cabeçalho fixo com o nome do app.

BANCO DE DADOS (Supabase, criar desde o início, com Realtime ativo):

- barracas: id, nome, chave_pix, whatsapp_suporte, criado_em

- mesas: id, barraca_id, numero, tem_qrcode (boolean)

- garcons: id, barraca_id, nome, chave_pix

- produtos: id, barraca_id, nome, categoria (Bebidas, Porções, Sobremesas), preco, disponivel (boolean)

- pedidos: id, barraca_id, mesa_id, garcom_id (opcional), origem (cliente ou garcom), status (novo, em_preparo, entregue), total, gorjeta, criado_em

- itens_pedido: id, pedido_id, produto_id, nome_produto, quantidade, preco

TELA INICIAL: duas opções para teste: "Entrar como Cliente" e "Painel da Barraca".

VISÃO DO CLIENTE:

- Simule que o cliente escaneou o QR Code da Mesa 14 de uma barraca de exemplo.

- Cardápio em abas por categoria. Item indisponível aparece esmaecido com o texto "acabou".

- Itens de exemplo: Água de Coco R$ 10, Isca de Peixe R$ 65, Caipirinha R$ 22, Cerveja Long Neck R$ 12, Batata Frita R$ 35.

- Carrinho flutuante com total e botão "Avançar para o Pagamento".

- Checkout: resumo com número da mesa; pergunta "Quer deixar uma caixinha para quem te atendeu?" com opções R$ 2, R$ 5, R$ 10 e Outro valor, e seleção de qual garçom atendeu (lista da barraca); tela de Pix com QR Code gerado a partir da chave_pix da barraca (código Pix copia e cola estático, sem gateway), botão "Copiar código Pix" e botão verde grande "Já paguei, enviar pedido para a cozinha".

- Não existe nenhuma taxa cobrada do cliente. O total é só consumo mais caixinha.

PAINEL DA BARRACA:

- Tela única vertical, pedido mais recente no topo. Cada card mostra mesa, itens, total, caixinha, garçom e origem.

- Botões "Confirmar pagamento" (a cozinha confere o Pix), "Iniciar preparo" e "Entregue".

- Som e destaque visual a cada pedido novo.

- Botão "Lançar pedido" para o garçom registrar manualmente um pedido escolhendo mesa, garçom e itens (origem = garcom).

- Aba "Cardápio": toggle de disponível/indisponível por item e edição de preço.

- Aba "Mesas": lista de mesas com o toggle tem_qrcode.

- Aba "Resultados": relatório do dia e do período com pedidos, faturamento e ticket médio, separado em dois grupos: mesas com QR Code e mesas sem QR Code. Mostrar também total de caixinha por garçom. Deve ter botão para exportar em CSV.

- Ícone flutuante de suporte com símbolo do WhatsApp abrindo o link wa.me do campo whatsapp_suporte.

REGRAS:

- Todo estado vem do Supabase; não usar localStorage.

- Preparar a estrutura para múltiplas barracas, mas na interface de teste usar sempre a barraca de exemplo.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/086f7bd6-7b80-4516-9d68-f12609963ca0).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

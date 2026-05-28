# DiskCerveja Budget Analyzer

Sistema web para importar, normalizar e analisar orcamentos de fornecedores de bebidas da DiskCerveja.

## Funcionalidades do MVP

- Upload multi-arquivo CSV/XLSX.
- Mapeamento explicito de colunas com sugestao automatica.
- Normalizacao de produto em `Marca + Embalagem + Volume + (R/NR)`.
- Deteccao heuristica de embalagem, retornavel, volume e unidades por pack.
- Calculo server-side de custo efetivo unitario:

```txt
(preco_bruto - descontos + frete + impostos_taxas + deposito_retornaveis + ajuste_prazo) / numero_de_unidades
```

- Ajuste de prazo opcional por custo de capital mensal. Prazos maiores reduzem o custo presente, portanto o ajuste pode ser negativo.
- Ranking top 3 por produto, economia frente a media cotada e alertas de qualidade.
- Ranking de fornecedores e simulacoes:
  - Cenario A: multi-fornecedor, menor custo por item.
  - Cenario B: mono-fornecedor, melhor fornecedor unico que cobre todos os itens.
  - Cenario C: restricoes de disponibilidade, lead time, MOQ, listas branca/negra e maximo de fornecedores.
- Dashboards com Recharts e exportacao CSV/XLSX.
- Supabase Auth, Postgres com RLS e buckets `uploads`/`exports` definidos em migracao.

## Stack

- Next.js 14 App Router + TypeScript
- Supabase Auth, Postgres, Storage
- Recharts
- read-excel-file, write-excel-file e PapaParse
- Tailwind CSS

## Configuracao local

```bash
npm install
cp .env.example .env.local
npm run dev
```

Variaveis:

```txt
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
```

`SUPABASE_SERVICE_ROLE_KEY` deve ficar somente no servidor. Ela e usada nas rotas API para persistir dados depois que o token do usuario e validado.

## Supabase

Aplique a migracao:

```bash
supabase link --project-ref <project-ref>
supabase db push
```

A migracao cria:

- `organizations`
- `profiles`
- `suppliers`
- `normalized_products`
- `quotes`
- `quote_items`
- `analysis_runs`
- `analysis_item_results`
- `scenarios`
- buckets privados `uploads` e `exports`

Todas as tabelas possuem RLS por `org_id`. Novos usuarios recebem automaticamente uma organizacao e um profile via trigger em `auth.users`.

## Fluxo de uso

1. Acesse `/upload`.
2. Envie um ou mais arquivos CSV/XLSX.
3. Clique em **Gerar previa**.
4. Revise o mapeamento de colunas.
5. Configure custo de capital, alocacao de frete e restricoes.
6. Clique em **Importar e analisar**.
7. Veja a base normalizada em `/quotes/local` e a analise em `/analysis/local`.
8. Exporte CSV ou Excel pela tela de analise.

## Deploy na Vercel

1. Importe o repositorio GitHub na Vercel.
2. Configure as variaveis de ambiente de producao e preview.
3. Conecte o projeto Supabase e aplique a migracao.
4. A Vercel executara `npm ci` e `npm run build` a cada push/PR.

O arquivo `vercel.json` define o framework Next.js e os comandos padrao. O workflow `.github/workflows/ci.yml` roda typecheck, lint e build em pull requests e pushes para `main`.

## Assuncoes e pendencias

- PDF/foto fica para uma etapa posterior com OCR/LLM.
- A alocacao de frete por volume/peso esta exposta nos parametros, mas o MVP calcula usando o valor informado por item. Para frete total por arquivo, adicionar peso/volume por linha e rateio antes da normalizacao.
- Quantidade-alvo por item pode ser enviada pela API via `targetQuantities`; a tela usa a maior quantidade cotada como demanda padrao.
- Downloads assinados do Supabase Storage estao previstos na estrutura de buckets/RLS; o MVP baixa exportacoes diretamente da rota server-side.

## Observacao de seguranca

O projeto usa Next.js 14 conforme requisito do escopo. Em maio de 2026, `npm audit` recomenda migrar para Next.js 16 para eliminar todos os avisos de seguranca reportados para a familia 14.x. O MVP esta no patch mais recente instalado pelo npm para Next 14 (`14.2.x`) e pode ser migrado futuramente com os codemods oficiais se o requisito de versao for flexibilizado.

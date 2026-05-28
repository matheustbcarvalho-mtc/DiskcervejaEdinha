import Link from 'next/link';
import { AuthPanel } from '@/components/auth-panel';

const questions = [
  'Envie seus orcamentos em CSV/XLSX. Ha PDFs/fotos para considerar depois?',
  'Usar a quantidade cotada ou informar uma quantidade-alvo por item?',
  'Como alocar o frete: por valor (padrao), volume ou peso?',
  'Qual o custo de capital mensal para comparar prazos? Ou deseja ignorar?',
  'Quais restricoes aplicar: lead time maximo, MOQ, fornecedores preferidos/evitados e numero maximo de fornecedores?'
];

const capabilities = [
  'Importacao multi-arquivo com mapeamento explicito de colunas.',
  'Normalizacao de marca, embalagem, volume, retornavel e unidades por pack.',
  'Calculo server-side de custo efetivo unitario e por litro.',
  'Ranking top 3 por produto, ranking de fornecedores e alertas de qualidade.',
  'Simulacoes multi-fornecedor, mono-fornecedor e com restricoes.',
  'Exportacao CSV/XLSX e persistencia Supabase quando configurada.'
];

export default function HomePage() {
  return (
    <div className="space-y-8">
      <section className="grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
        <div className="card bg-gradient-to-br from-amber-50 to-white">
          <p className="text-sm font-semibold uppercase tracking-wide text-amber-700">MVP operacional</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight text-amber-950 sm:text-5xl">
            Compare orcamentos de bebidas com custo efetivo real.
          </h1>
          <p className="mt-4 max-w-3xl text-lg text-slate-700">
            Importe CSV/XLSX de fornecedores, normalize variantes como marca + embalagem + volume + R/NR,
            encontre o melhor preco e simule cenarios de compra para a DiskCerveja.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/upload" className="btn">Comecar importacao</Link>
            <Link href="/analysis/local" className="btn-secondary">Ver ultima analise</Link>
          </div>
        </div>
        <AuthPanel />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="card">
          <h2 className="text-xl font-bold text-slate-900">Perguntas iniciais</h2>
          <ol className="mt-4 space-y-3 text-sm text-slate-700">
            {questions.map((question, index) => (
              <li key={question} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-800">{index + 1}</span>
                <span>{question}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="card">
          <h2 className="text-xl font-bold text-slate-900">O que esta implementado</h2>
          <ul className="mt-4 grid gap-3 text-sm text-slate-700">
            {capabilities.map((item) => (
              <li key={item} className="rounded-xl bg-amber-50 px-3 py-2">{item}</li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}

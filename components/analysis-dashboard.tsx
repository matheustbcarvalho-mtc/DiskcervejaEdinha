"use client";

import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import type { AnalysisResult, ImportResponse, PurchaseScenario, ValidationIssue } from '@/lib/types';

const COLORS = ['#f59e0b', '#2563eb', '#16a34a', '#dc2626', '#9333ea', '#0891b2', '#ea580c', '#4f46e5'];

function storageKey(id: string, type: 'analysis' | 'import') {
  return `diskcerveja:${type}:${id}`;
}

function brl(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function severityClass(severity: ValidationIssue['severity']) {
  if (severity === 'error') return 'bg-red-50 text-red-800 border-red-200';
  if (severity === 'warning') return 'bg-yellow-50 text-yellow-800 border-yellow-200';
  return 'bg-blue-50 text-blue-800 border-blue-200';
}

async function downloadReport(analysis: AnalysisResult, format: 'csv' | 'xlsx') {
  const response = await fetch('/api/export', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ analysis, format })
  });
  if (!response.ok) throw new Error('Falha ao exportar relatorio.');
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = format === 'xlsx' ? 'analise-diskcerveja.xlsx' : 'analise-diskcerveja.csv';
  link.click();
  URL.revokeObjectURL(url);
}

export function AnalysisDashboard({ id }: { id: string }) {
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [importData, setImportData] = useState<ImportResponse | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    const rawAnalysis = localStorage.getItem(storageKey(id, 'analysis')) ?? localStorage.getItem(storageKey('local', 'analysis'));
    const rawImport = localStorage.getItem(storageKey(id, 'import')) ?? localStorage.getItem(storageKey('local', 'import'));
    if (rawAnalysis) setAnalysis(JSON.parse(rawAnalysis) as AnalysisResult);
    if (rawImport) setImportData(JSON.parse(rawImport) as ImportResponse);
  }, [id]);

  const costByProductData = useMemo(() => {
    if (!analysis) return { data: [], suppliers: [] as string[] };
    const suppliers = Array.from(new Set(analysis.products.flatMap((product) => product.topOffers.map((offer) => offer.item.supplier))));
    const data = analysis.products.slice(0, 10).map((product) => {
      const row: Record<string, string | number> = { product: product.canonicalName.replace(/\s+/g, ' ').slice(0, 28) };
      for (const offer of product.topOffers) row[offer.item.supplier] = Number(offer.item.computedCostUnit.toFixed(2));
      return row;
    });
    return { data, suppliers };
  }, [analysis]);

  const supplierShareData = useMemo(() => {
    const multi = analysis?.scenarios.find((scenario) => scenario.id === 'multi');
    const grouped = new Map<string, number>();
    multi?.lines.forEach((line) => grouped.set(line.supplier, (grouped.get(line.supplier) ?? 0) + line.totalCost));
    return Array.from(grouped.entries()).map(([name, value]) => ({ name, value }));
  }, [analysis]);

  const priceHistoryData = useMemo(() => {
    const items = importData?.items ?? [];
    return items
      .filter((item) => item.quoteDate)
      .sort((a, b) => String(a.quoteDate).localeCompare(String(b.quoteDate)))
      .slice(-30)
      .map((item) => ({ date: item.quoteDate, product: item.canonicalName.slice(0, 20), cost: Number(item.computedCostUnit.toFixed(2)) }));
  }, [importData]);

  if (!analysis) {
    return (
      <div className="card">
        <h1 className="text-2xl font-bold text-slate-900">Analise nao encontrada</h1>
        <p className="mt-2 text-slate-600">Importe e analise orcamentos primeiro em /upload.</p>
      </div>
    );
  }

  const multi = analysis.scenarios.find((scenario) => scenario.id === 'multi');
  const mono = analysis.scenarios.find((scenario) => scenario.id === 'mono');
  const restricted = analysis.scenarios.find((scenario) => scenario.id === 'restricted');

  async function onDownload(format: 'csv' | 'xlsx') {
    if (!analysis) return;
    setExportError(null);
    try {
      await downloadReport(analysis, format);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Falha ao exportar.');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-amber-700">Dashboards e recomendacoes</p>
          <h1 className="mt-2 text-3xl font-black text-amber-950">Analise de melhores compras</h1>
          <p className="mt-2 text-slate-700">Gerada em {new Date(analysis.generatedAt).toLocaleString('pt-BR')}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button className="btn-secondary" onClick={() => onDownload('csv')}>Baixar CSV</button>
          <button className="btn" onClick={() => onDownload('xlsx')}>Baixar Excel</button>
        </div>
      </div>
      {exportError ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{exportError}</div> : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Produtos analisados', analysis.products.length.toString()],
          ['Economia vs media', brl(analysis.totalPotentialSavingsVsAverage)],
          ['Cenario multi', multi ? brl(multi.totalCost) : '-'],
          ['Delta mono vs multi', multi && mono && mono.totalCost ? brl(mono.totalCost - multi.totalCost) : '-']
        ].map(([label, value]) => (
          <div key={label} className="card p-4">
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-1 text-2xl font-black text-slate-900">{value}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="card">
          <h2 className="text-xl font-bold text-slate-900">Custo unitario por produto x fornecedores</h2>
          <div className="mt-4 h-96">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={costByProductData.data} margin={{ left: 8, right: 8, bottom: 80 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="product" angle={-35} textAnchor="end" interval={0} height={100} tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(value) => `R$ ${value}`} />
                <Tooltip formatter={(value) => brl(Number(value))} />
                <Legend />
                {costByProductData.suppliers.map((supplier, index) => (
                  <Bar key={supplier} dataKey={supplier} fill={COLORS[index % COLORS.length]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <h2 className="text-xl font-bold text-slate-900">Share no cenario multi</h2>
          <div className="mt-4 h-96">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={supplierShareData} dataKey="value" nameKey="name" outerRadius={120} label={(entry) => `${entry.name}`}>
                  {supplierShareData.map((entry, index) => <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(value) => brl(Number(value))} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="card">
          <h2 className="text-xl font-bold text-slate-900">Ranking de fornecedores</h2>
          <div className="mt-4 h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analysis.supplierRankings.slice(0, 10)} layout="vertical" margin={{ left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="supplier" type="category" width={120} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="winnerItems" name="Itens vencedores" fill="#f59e0b" />
                <Bar dataKey="quotedItems" name="Itens cotados" fill="#2563eb" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <h2 className="text-xl font-bold text-slate-900">Evolucao de precos</h2>
          <p className="mt-1 text-sm text-slate-600">Renderiza quando os orcamentos incluem data historica.</p>
          <div className="mt-4 h-80">
            {priceHistoryData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={priceHistoryData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(value) => `R$ ${value}`} />
                  <Tooltip formatter={(value) => brl(Number(value))} />
                  <Line type="monotone" dataKey="cost" stroke="#f59e0b" dot />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center rounded-xl bg-amber-50 text-center text-sm text-amber-900">
                Inclua a coluna Data do orcamento para acompanhar historico de precos.
              </div>
            )}
          </div>
        </div>
      </section>

      <ScenarioSection scenarios={[multi, mono, restricted].filter(Boolean) as PurchaseScenario[]} />

      <section className="card">
        <h2 className="text-xl font-bold text-slate-900">Melhor preco por produto</h2>
        <div className="mt-4 overflow-auto rounded-xl border border-amber-100">
          <table className="min-w-full divide-y divide-amber-100 text-sm">
            <thead className="bg-amber-50 text-left text-xs uppercase text-amber-900">
              <tr>
                <th className="px-3 py-2">Produto</th>
                <th className="px-3 py-2">Demanda</th>
                <th className="px-3 py-2">Top 3 fornecedores</th>
                <th className="px-3 py-2">Economia vs media</th>
                <th className="px-3 py-2">Faltantes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-amber-50 bg-white">
              {analysis.products.map((product) => (
                <tr key={product.canonicalName}>
                  <td className="px-3 py-2 font-medium text-slate-900">{product.canonicalName}</td>
                  <td className="px-3 py-2">{product.demandUnits}</td>
                  <td className="px-3 py-2">
                    <div className="space-y-1">
                      {product.topOffers.map((offer) => (
                        <div key={`${product.canonicalName}-${offer.item.supplier}`}>
                          <strong>{offer.rank}. {offer.item.supplier}</strong> - {brl(offer.item.computedCostUnit)}
                          {offer.rank > 1 ? ` (+${brl(offer.differenceFromBest)} / ${offer.differenceFromBestPct.toFixed(1)}%)` : ''}
                          {offer.item.leadTimeDays !== null ? ` | lead ${offer.item.leadTimeDays}d` : ''}
                          {offer.item.moq !== null ? ` | MOQ ${offer.item.moq}` : ''}
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2">{brl(product.potentialSavingsVsAverage)}</td>
                  <td className="px-3 py-2">{product.missingSuppliers.slice(0, 3).join(', ') || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2 className="text-xl font-bold text-slate-900">Alertas e qualidade de dados</h2>
        <div className="mt-4 grid gap-2">
          {analysis.dataQualityIssues.length ? analysis.dataQualityIssues.slice(0, 120).map((issue, index) => (
            <div key={`${issue.code}-${index}`} className={`rounded-xl border px-3 py-2 text-sm ${severityClass(issue.severity)}`}>
              <strong>{issue.code}</strong> - {issue.message}
            </div>
          )) : <p className="text-sm text-slate-600">Sem alertas.</p>}
        </div>
      </section>
    </div>
  );
}

function ScenarioSection({ scenarios }: { scenarios: PurchaseScenario[] }) {
  return (
    <section className="grid gap-6 lg:grid-cols-3">
      {scenarios.map((scenario) => (
        <div key={scenario.id} className="card">
          <p className="text-sm font-semibold uppercase tracking-wide text-amber-700">{scenario.id}</p>
          <h2 className="mt-1 text-xl font-bold text-slate-900">{scenario.name}</h2>
          <p className="mt-3 text-3xl font-black text-amber-800">{brl(scenario.totalCost)}</p>
          <p className="mt-1 text-sm text-slate-600">{scenario.lines.length} itens | {scenario.supplierCount} fornecedor(es)</p>
          {scenario.notes.length ? (
            <ul className="mt-4 space-y-2 text-sm text-slate-700">
              {scenario.notes.slice(0, 4).map((note) => <li key={note} className="rounded-xl bg-amber-50 px-3 py-2">{note}</li>)}
            </ul>
          ) : null}
        </div>
      ))}
    </section>
  );
}

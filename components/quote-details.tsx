"use client";

import { useEffect, useMemo, useState } from 'react';
import type { ImportResponse, ValidationIssue } from '@/lib/types';

function storageKey(id: string) {
  return `diskcerveja:import:${id}`;
}

function severityClass(severity: ValidationIssue['severity']) {
  if (severity === 'error') return 'bg-red-50 text-red-800 border-red-200';
  if (severity === 'warning') return 'bg-yellow-50 text-yellow-800 border-yellow-200';
  return 'bg-blue-50 text-blue-800 border-blue-200';
}

export function QuoteDetails({ id }: { id: string }) {
  const [data, setData] = useState<ImportResponse | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem(storageKey(id)) ?? localStorage.getItem(storageKey('local'));
    if (raw) setData(JSON.parse(raw) as ImportResponse);
  }, [id]);

  const stats = useMemo(() => {
    const items = data?.items ?? [];
    return {
      items: items.length,
      suppliers: new Set(items.map((item) => item.supplier)).size,
      products: new Set(items.map((item) => item.canonicalName)).size,
      errors: data?.dataQualityIssues.filter((issue) => issue.severity === 'error').length ?? 0,
      warnings: data?.dataQualityIssues.filter((issue) => issue.severity === 'warning').length ?? 0
    };
  }, [data]);

  if (!data) {
    return (
      <div className="card">
        <h1 className="text-2xl font-bold text-slate-900">Base normalizada nao encontrada</h1>
        <p className="mt-2 text-slate-600">Importe um orcamento primeiro em /upload.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-amber-700">Base normalizada</p>
        <h1 className="mt-2 text-3xl font-black text-amber-950">Itens importados e validacoes</h1>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ['Itens', stats.items],
          ['Produtos canonicos', stats.products],
          ['Fornecedores', stats.suppliers],
          ['Erros', stats.errors],
          ['Alertas', stats.warnings]
        ].map(([label, value]) => (
          <div key={label} className="card p-4">
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-1 text-2xl font-black text-slate-900">{value}</p>
          </div>
        ))}
      </section>

      <section className="card space-y-4">
        <h2 className="text-xl font-bold text-slate-900">Qualidade dos dados</h2>
        <div className="grid gap-2">
          {data.dataQualityIssues.length ? data.dataQualityIssues.slice(0, 80).map((issue, index) => (
            <div key={`${issue.code}-${index}`} className={`rounded-xl border px-3 py-2 text-sm ${severityClass(issue.severity)}`}>
              <strong>{issue.code}</strong> - {issue.message}
            </div>
          )) : <p className="text-sm text-slate-600">Nenhum problema encontrado.</p>}
        </div>
      </section>

      <section className="card overflow-hidden">
        <h2 className="mb-4 text-xl font-bold text-slate-900">Itens normalizados</h2>
        <div className="max-h-[620px] overflow-auto rounded-xl border border-amber-100">
          <table className="min-w-full divide-y divide-amber-100 text-sm">
            <thead className="sticky top-0 bg-amber-50 text-left text-xs uppercase text-amber-900">
              <tr>
                <th className="px-3 py-2">Linha</th>
                <th className="px-3 py-2">Produto bruto</th>
                <th className="px-3 py-2">Canonico</th>
                <th className="px-3 py-2">Fornecedor</th>
                <th className="px-3 py-2">Pack</th>
                <th className="px-3 py-2">Qtd.</th>
                <th className="px-3 py-2">Bruto</th>
                <th className="px-3 py-2">Desc.</th>
                <th className="px-3 py-2">Frete</th>
                <th className="px-3 py-2">Taxas</th>
                <th className="px-3 py-2">Deposito</th>
                <th className="px-3 py-2">Prazo</th>
                <th className="px-3 py-2">Custo un.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-amber-50 bg-white">
              {data.items.map((item) => (
                <tr key={item.id}>
                  <td className="px-3 py-2">{item.rowNumber}</td>
                  <td className="px-3 py-2">{item.rawProductName}</td>
                  <td className="px-3 py-2 font-medium text-slate-900">{item.canonicalName}</td>
                  <td className="px-3 py-2">{item.supplier}</td>
                  <td className="px-3 py-2">{item.unitsPerPack}</td>
                  <td className="px-3 py-2">{item.quantityUnits}</td>
                  <td className="px-3 py-2">R$ {item.grossPrice.toFixed(2)}</td>
                  <td className="px-3 py-2">R$ {item.discountAmount.toFixed(2)}</td>
                  <td className="px-3 py-2">R$ {item.freightAmount.toFixed(2)}</td>
                  <td className="px-3 py-2">R$ {item.taxesAmount.toFixed(2)}</td>
                  <td className="px-3 py-2">R$ {item.returnableDepositAmount.toFixed(2)}</td>
                  <td className="px-3 py-2">{item.paymentTermDays}d</td>
                  <td className="px-3 py-2 font-semibold">R$ {item.computedCostUnit.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

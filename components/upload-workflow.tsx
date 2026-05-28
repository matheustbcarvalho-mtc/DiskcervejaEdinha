"use client";

import { useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { COLUMN_LABELS, type AnalysisResult, type ColumnKey, type ColumnMapping, type ImportOptions, type ImportResponse } from '@/lib/types';

const COLUMN_KEYS = Object.keys(COLUMN_LABELS) as ColumnKey[];
const REQUIRED_KEYS: ColumnKey[] = ['supplier', 'rawProductName'];

function parseList(value: string): string[] | undefined {
  const list = value.split(',').map((item) => item.trim()).filter(Boolean);
  return list.length ? list : undefined;
}

function storageKey(id: string, type: 'import' | 'analysis') {
  return `diskcerveja:${type}:${id}`;
}

export function UploadWorkflow() {
  const [files, setFiles] = useState<File[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [preview, setPreview] = useState<ImportResponse | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [monthlyCapitalCostPct, setMonthlyCapitalCostPct] = useState('');
  const [freightAllocation, setFreightAllocation] = useState<ImportOptions['freightAllocation']>('value');
  const [maxLeadTimeDays, setMaxLeadTimeDays] = useState('');
  const [maxSuppliers, setMaxSuppliers] = useState('');
  const [supplierAllowList, setSupplierAllowList] = useState('');
  const [supplierBlockList, setSupplierBlockList] = useState('');
  const [requireAvailable, setRequireAvailable] = useState(true);

  const headers = useMemo(() => Array.from(new Set(preview?.files.flatMap((file) => file.headers) ?? [])).sort(), [preview]);
  const criticalIssues = preview?.dataQualityIssues.filter((issue) => issue.severity === 'error') ?? [];

  function buildOptions(): ImportOptions {
    return {
      monthlyCapitalCostPct: monthlyCapitalCostPct ? Number(monthlyCapitalCostPct) : undefined,
      freightAllocation,
      maxLeadTimeDays: maxLeadTimeDays ? Number(maxLeadTimeDays) : undefined,
      maxSuppliers: maxSuppliers ? Number(maxSuppliers) : undefined,
      supplierAllowList: parseList(supplierAllowList),
      supplierBlockList: parseList(supplierBlockList),
      requireAvailable
    };
  }

  async function accessToken(): Promise<string | null> {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return null;
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }

  async function runImport(previewOnly: boolean): Promise<ImportResponse | null> {
    if (!files.length) {
      setError('Selecione ao menos um arquivo CSV ou XLSX.');
      return null;
    }
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    formData.append('mapping', JSON.stringify(mapping));
    formData.append('options', JSON.stringify(buildOptions()));
    formData.append('previewOnly', String(previewOnly));

    const token = await accessToken();
    const response = await fetch('/api/import', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: formData
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? 'Falha ao importar.');
    return payload as ImportResponse;
  }

  async function generatePreview() {
    setLoading(true);
    setError(null);
    setAnalysis(null);
    try {
      const result = await runImport(true);
      if (!result) return;
      setPreview(result);
      const mergedMapping = result.files.reduce<ColumnMapping>((current, file) => ({ ...file.autoMapping, ...current }), mapping);
      setMapping(mergedMapping);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro inesperado.');
    } finally {
      setLoading(false);
    }
  }

  async function importAndAnalyze() {
    setLoading(true);
    setError(null);
    try {
      const imported = await runImport(false);
      if (!imported) return;
      setPreview(imported);
      const errors = imported.dataQualityIssues.filter((issue) => issue.severity === 'error');
      if (errors.length) {
        setError('Ha campos criticos ausentes ou invalidos. Corrija o mapeamento/arquivo antes de prosseguir.');
        return;
      }

      const token = await accessToken();
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ items: imported.items, options: buildOptions() })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Falha na analise.');

      const result = payload.analysis as AnalysisResult;
      const id = payload.persisted?.analysisRunId ?? 'local';
      localStorage.setItem(storageKey(id, 'import'), JSON.stringify(imported));
      localStorage.setItem(storageKey(id, 'analysis'), JSON.stringify(result));
      localStorage.setItem(storageKey('local', 'import'), JSON.stringify(imported));
      localStorage.setItem(storageKey('local', 'analysis'), JSON.stringify(result));
      setAnalysis(result);
      window.location.href = `/analysis/${id}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro inesperado.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-amber-700">Upload e mapeamento</p>
        <h1 className="mt-2 text-3xl font-black text-amber-950">Importar orcamentos CSV/XLSX</h1>
        <p className="mt-2 max-w-3xl text-slate-700">
          Gere uma previa, confira o mapeamento explicito das colunas e execute a analise. Campos criticos como fornecedor,
          produto, volume, quantidade e preco precisam estar validos para a consolidacao seguir.
        </p>
      </div>

      <section className="grid gap-6 lg:grid-cols-[1fr_0.8fr]">
        <div className="card space-y-4">
          <label className="block text-sm font-semibold text-slate-800">Arquivos de orcamento</label>
          <input
            className="input"
            type="file"
            multiple
            accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
          />
          {files.length ? <p className="text-sm text-slate-600">{files.length} arquivo(s) selecionado(s).</p> : null}
          <div className="flex flex-wrap gap-3">
            <button className="btn-secondary" onClick={generatePreview} disabled={loading || !files.length}>Gerar previa</button>
            <button className="btn" onClick={importAndAnalyze} disabled={loading || !files.length || criticalIssues.length > 0}>Importar e analisar</button>
          </div>
          {criticalIssues.length > 0 ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              Existem {criticalIssues.length} erro(s) critico(s). Ajuste o mapeamento ou corrija o arquivo antes de analisar.
            </div>
          ) : null}
          {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}
          {analysis ? <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">Analise gerada com sucesso.</div> : null}
        </div>

        <div className="card space-y-4">
          <h2 className="text-lg font-bold text-slate-900">Parametros da analise</h2>
          <label className="block text-sm font-medium text-slate-700">Custo de capital mensal (%)
            <input className="input mt-1" inputMode="decimal" placeholder="ex.: 2" value={monthlyCapitalCostPct} onChange={(event) => setMonthlyCapitalCostPct(event.target.value)} />
          </label>
          <label className="block text-sm font-medium text-slate-700">Alocacao de frete
            <select className="input mt-1" value={freightAllocation} onChange={(event) => setFreightAllocation(event.target.value as ImportOptions['freightAllocation'])}>
              <option value="value">Por valor (padrao)</option>
              <option value="volume">Por volume</option>
              <option value="weight">Por peso</option>
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">Lead time maximo
              <input className="input mt-1" inputMode="numeric" value={maxLeadTimeDays} onChange={(event) => setMaxLeadTimeDays(event.target.value)} />
            </label>
            <label className="block text-sm font-medium text-slate-700">Max. fornecedores
              <input className="input mt-1" inputMode="numeric" value={maxSuppliers} onChange={(event) => setMaxSuppliers(event.target.value)} />
            </label>
          </div>
          <label className="block text-sm font-medium text-slate-700">Lista branca (separada por virgula)
            <input className="input mt-1" value={supplierAllowList} onChange={(event) => setSupplierAllowList(event.target.value)} />
          </label>
          <label className="block text-sm font-medium text-slate-700">Lista negra (separada por virgula)
            <input className="input mt-1" value={supplierBlockList} onChange={(event) => setSupplierBlockList(event.target.value)} />
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={requireAvailable} onChange={(event) => setRequireAvailable(event.target.checked)} />
            Considerar apenas itens disponiveis no cenario restrito
          </label>
        </div>
      </section>

      {preview ? (
        <section className="card space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Mapeamento explicito de colunas</h2>
              <p className="text-sm text-slate-600">Revise as sugestoes automaticas. Campos com * sao obrigatorios.</p>
            </div>
            <span className="badge bg-amber-100 text-amber-900">{preview.items.length} itens na previa</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {COLUMN_KEYS.map((key) => (
              <label key={key} className="block text-sm font-medium text-slate-700">
                {COLUMN_LABELS[key]} {REQUIRED_KEYS.includes(key) ? '*' : ''}
                <select
                  className="input mt-1"
                  value={mapping[key] ?? ''}
                  onChange={(event) => setMapping((current) => ({ ...current, [key]: event.target.value || undefined }))}
                >
                  <option value="">Nao mapear</option>
                  {headers.map((header) => <option key={header} value={header}>{header}</option>)}
                </select>
              </label>
            ))}
          </div>
        </section>
      ) : null}

      {preview ? (
        <section className="card space-y-4 overflow-hidden">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-xl font-bold text-slate-900">Previa normalizada</h2>
            <a className="btn-secondary" href="/quotes/local">Abrir base normalizada</a>
          </div>
          <div className="max-h-[520px] overflow-auto rounded-xl border border-amber-100">
            <table className="min-w-full divide-y divide-amber-100 text-sm">
              <thead className="sticky top-0 bg-amber-50 text-left text-xs uppercase text-amber-900">
                <tr>
                  <th className="px-3 py-2">Produto canonico</th>
                  <th className="px-3 py-2">Fornecedor</th>
                  <th className="px-3 py-2">Qtd.</th>
                  <th className="px-3 py-2">Custo un.</th>
                  <th className="px-3 py-2">Custo/L</th>
                  <th className="px-3 py-2">Issues</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-50 bg-white">
                {preview.items.slice(0, 80).map((item) => (
                  <tr key={item.id}>
                    <td className="px-3 py-2 font-medium text-slate-900">{item.canonicalName}</td>
                    <td className="px-3 py-2">{item.supplier}</td>
                    <td className="px-3 py-2">{item.quantityUnits}</td>
                    <td className="px-3 py-2">R$ {item.computedCostUnit.toFixed(2)}</td>
                    <td className="px-3 py-2">{item.computedCostLiter ? `R$ ${item.computedCostLiter.toFixed(2)}` : '-'}</td>
                    <td className="px-3 py-2">{item.issues.length ? item.issues.map((issue) => issue.code).join(', ') : 'ok'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}

import type { AnalysisResult, NormalizedQuoteItem } from './types';
import { getAuthenticatedOrg, getSupabaseAdmin } from './supabase/admin';

type PersistImportResult = {
  quoteIds: string[];
  skippedReason?: string;
};

export async function persistImport(request: Request, items: NormalizedQuoteItem[]): Promise<PersistImportResult> {
  const admin = getSupabaseAdmin();
  if (!admin) return { quoteIds: [], skippedReason: 'Supabase nao configurado.' };

  const context = await getAuthenticatedOrg(request);
  if (!context) return { quoteIds: [], skippedReason: 'Usuario autenticado com organizacao nao encontrado.' };

  const supplierNames = Array.from(new Set(items.map((item) => item.supplier)));
  const supplierIds = new Map<string, string>();
  for (const name of supplierNames) {
    const { data, error } = await admin
      .from('suppliers')
      .upsert({ org_id: context.orgId, name }, { onConflict: 'org_id,name' })
      .select('id,name')
      .single();
    if (!error && data) supplierIds.set(data.name as string, data.id as string);
  }

  const productIds = new Map<string, string>();
  for (const item of items) {
    if (productIds.has(item.canonicalName)) continue;
    const { data, error } = await admin
      .from('normalized_products')
      .upsert({
        org_id: context.orgId,
        brand: item.brand,
        packaging_type: item.packagingType,
        volume_ml: item.volumeMl,
        returnable: item.returnable,
        canonical_name: item.canonicalName
      }, { onConflict: 'org_id,canonical_name' })
      .select('id,canonical_name')
      .single();
    if (!error && data) productIds.set(data.canonical_name as string, data.id as string);
  }

  const quoteIds: string[] = [];
  const quoteGroups = new Map<string, NormalizedQuoteItem[]>();
  for (const item of items) {
    const key = `${item.sourceFile}::${item.supplier}::${item.quoteDate ?? ''}`;
    quoteGroups.set(key, [...(quoteGroups.get(key) ?? []), item]);
  }

  for (const [key, group] of Array.from(quoteGroups.entries())) {
    const [sourceFile, supplierName] = key.split('::');
    const supplierId = supplierIds.get(supplierName);
    if (!supplierId) continue;

    const { data: quote, error: quoteError } = await admin
      .from('quotes')
      .insert({
        org_id: context.orgId,
        supplier_id: supplierId,
        source_file_name: sourceFile,
        quote_date: group[0]?.quoteDate,
        status: 'imported'
      })
      .select('id')
      .single();

    if (quoteError || !quote) continue;
    quoteIds.push(quote.id as string);

    const rows = group.map((item: NormalizedQuoteItem) => ({
      org_id: context.orgId,
      quote_id: quote.id,
      normalized_product_id: productIds.get(item.canonicalName),
      row_number: item.rowNumber,
      raw_product_name: item.rawProductName,
      brand: item.brand,
      packaging_type: item.packagingType,
      volume_ml: item.volumeMl,
      returnable: item.returnable,
      units_per_pack: item.unitsPerPack,
      quantity_units: item.quantityUnits,
      gross_price: item.grossPrice,
      unit_price_input: item.unitPriceInput,
      discount_amount: item.discountAmount,
      freight_amount: item.freightAmount,
      taxes_amount: item.taxesAmount,
      returnable_deposit_amount: item.returnableDepositAmount,
      payment_term_days: item.paymentTermDays,
      lead_time_days: item.leadTimeDays,
      moq: item.moq,
      available: item.available,
      observations: item.observations,
      computed_cost_unit: item.computedCostUnit,
      computed_cost_liter: item.computedCostLiter,
      validation_issues: item.issues
    }));

    await admin.from('quote_items').insert(rows);
  }

  return { quoteIds };
}

export async function persistAnalysis(request: Request, analysis: AnalysisResult): Promise<{ analysisRunId?: string; skippedReason?: string }> {
  const admin = getSupabaseAdmin();
  if (!admin) return { skippedReason: 'Supabase nao configurado.' };
  const context = await getAuthenticatedOrg(request);
  if (!context) return { skippedReason: 'Usuario autenticado com organizacao nao encontrado.' };

  const { data: run, error } = await admin
    .from('analysis_runs')
    .insert({
      org_id: context.orgId,
      name: `Analise ${new Date().toLocaleString('pt-BR')}`,
      parameters: analysis.options,
      total_potential_savings: analysis.totalPotentialSavingsVsAverage
    })
    .select('id')
    .single();

  if (error || !run) return { skippedReason: error?.message ?? 'Falha ao persistir analise.' };

  await admin.from('analysis_item_results').insert(analysis.products.map((product) => ({
    org_id: context.orgId,
    analysis_run_id: run.id,
    canonical_name: product.canonicalName,
    demand_units: product.demandUnits,
    best_supplier: product.best?.item.supplier,
    best_cost_unit: product.best?.item.computedCostUnit,
    average_cost_unit: product.averageCostUnit,
    potential_savings_vs_average: product.potentialSavingsVsAverage,
    result_payload: product
  })));

  await admin.from('scenarios').insert(analysis.scenarios.map((scenario) => ({
    org_id: context.orgId,
    analysis_run_id: run.id,
    scenario_type: scenario.id,
    name: scenario.name,
    total_cost: scenario.totalCost,
    supplier_count: scenario.supplierCount,
    payload: scenario
  })));

  return { analysisRunId: run.id as string };
}

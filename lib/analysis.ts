import type {
  AnalysisResult,
  ImportOptions,
  NormalizedQuoteItem,
  ProductAnalysis,
  ProductRankingEntry,
  PurchaseScenario,
  ScenarioLine,
  SupplierRanking,
  ValidationIssue
} from './types';

function byCanonical(items: NormalizedQuoteItem[]): Map<string, NormalizedQuoteItem[]> {
  const grouped = new Map<string, NormalizedQuoteItem[]>();
  for (const item of items) {
    const group = grouped.get(item.canonicalName) ?? [];
    group.push(item);
    grouped.set(item.canonicalName, group);
  }
  return grouped;
}

function isComparable(item: NormalizedQuoteItem): boolean {
  return !item.issues.some((issue) => issue.severity === 'error');
}

function demandFor(canonicalName: string, group: NormalizedQuoteItem[], options: ImportOptions): number {
  const explicit = options.targetQuantities?.[canonicalName];
  if (explicit && explicit > 0) return explicit;
  return Math.max(...group.map((item) => item.quantityUnits), 1);
}

function rankGroup(group: NormalizedQuoteItem[]): ProductRankingEntry[] {
  return group
    .filter(isComparable)
    .sort((a, b) => a.computedCostUnit - b.computedCostUnit)
    .map((item, index, sorted) => {
      const best = sorted[0]?.computedCostUnit ?? item.computedCostUnit;
      const difference = item.computedCostUnit - best;
      return {
        item,
        rank: index + 1,
        differenceFromBest: difference,
        differenceFromBestPct: best > 0 ? (difference / best) * 100 : 0
      };
    });
}

function outliersByIqr(group: NormalizedQuoteItem[]): string[] {
  const comparable = group.filter(isComparable);
  if (comparable.length < 4) return [];
  const costs = comparable.map((item) => item.computedCostUnit).sort((a, b) => a - b);
  const q1 = costs[Math.floor((costs.length - 1) * 0.25)];
  const q3 = costs[Math.floor((costs.length - 1) * 0.75)];
  const iqr = q3 - q1;
  const upper = q3 + 1.5 * iqr;
  const lower = Math.max(0, q1 - 1.5 * iqr);
  return comparable.filter((item) => item.computedCostUnit > upper || item.computedCostUnit < lower).map((item) => item.supplier);
}

function ambiguityWarnings(group: NormalizedQuoteItem[]): string[] {
  const names = new Set(group.map((item) => item.rawProductName.trim()).filter(Boolean));
  if (names.size <= 1) return [];
  return [`${names.size} nomes brutos diferentes foram consolidados neste produto canonico.`];
}

function analyzeProducts(items: NormalizedQuoteItem[], options: ImportOptions): ProductAnalysis[] {
  const suppliers = Array.from(new Set(items.map((item) => item.supplier))).sort();
  return Array.from(byCanonical(items).entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([canonicalName, group]) => {
      const ranked = rankGroup(group);
      const demandUnits = demandFor(canonicalName, group, options);
      const averageCostUnit = ranked.length
        ? ranked.reduce((sum, offer) => sum + offer.item.computedCostUnit, 0) / ranked.length
        : null;
      const best = ranked[0] ?? null;
      const supplierSet = new Set(group.map((item) => item.supplier));
      return {
        canonicalName,
        brand: group[0]?.brand ?? '',
        packagingLabel: group[0]?.packagingLabel ?? '',
        volumeMl: group[0]?.volumeMl ?? null,
        returnable: group[0]?.returnable ?? false,
        demandUnits,
        best,
        topOffers: ranked.slice(0, 3),
        averageCostUnit,
        potentialSavingsVsAverage: best && averageCostUnit ? Math.max(0, (averageCostUnit - best.item.computedCostUnit) * demandUnits) : 0,
        missingSuppliers: suppliers.filter((supplier) => !supplierSet.has(supplier)),
        outlierSupplierNames: outliersByIqr(group),
        ambiguityWarnings: ambiguityWarnings(group)
      };
    });
}

function rankSuppliers(products: ProductAnalysis[]): SupplierRanking[] {
  const accumulator = new Map<string, SupplierRanking & { deviationCount: number }>();

  for (const product of products) {
    for (const offer of product.topOffers) {
      const current = accumulator.get(offer.item.supplier) ?? {
        supplier: offer.item.supplier,
        winnerItems: 0,
        quotedItems: 0,
        totalSpendIfChosenItems: 0,
        potentialSavingsVsAverage: 0,
        marketDeviationPct: 0,
        deviationCount: 0
      };

      current.quotedItems += 1;
      if (offer.rank === 1) {
        current.winnerItems += 1;
        current.totalSpendIfChosenItems += offer.item.computedCostUnit * product.demandUnits;
        current.potentialSavingsVsAverage += product.potentialSavingsVsAverage;
      }
      if (product.averageCostUnit && product.averageCostUnit > 0) {
        current.marketDeviationPct += ((offer.item.computedCostUnit - product.averageCostUnit) / product.averageCostUnit) * 100;
        current.deviationCount += 1;
      }
      accumulator.set(offer.item.supplier, current);
    }
  }

  return Array.from(accumulator.values())
    .map(({ deviationCount, ...supplier }) => ({
      ...supplier,
      marketDeviationPct: deviationCount ? supplier.marketDeviationPct / deviationCount : 0
    }))
    .sort((a, b) => b.potentialSavingsVsAverage - a.potentialSavingsVsAverage || b.winnerItems - a.winnerItems);
}

function scenarioFromLines(id: PurchaseScenario['id'], name: string, lines: ScenarioLine[], notes: string[]): PurchaseScenario {
  return {
    id,
    name,
    totalCost: lines.reduce((sum, line) => sum + line.totalCost, 0),
    supplierCount: new Set(lines.map((line) => line.supplier)).size,
    lines,
    notes
  };
}

function lineFromOffer(product: ProductAnalysis, offer: ProductRankingEntry): ScenarioLine {
  return {
    canonicalName: product.canonicalName,
    supplier: offer.item.supplier,
    unitCost: offer.item.computedCostUnit,
    demandUnits: product.demandUnits,
    totalCost: offer.item.computedCostUnit * product.demandUnits,
    available: offer.item.available
  };
}

function multiSupplierScenario(products: ProductAnalysis[]): PurchaseScenario {
  const lines = products.flatMap((product) => (product.best ? [lineFromOffer(product, product.best)] : []));
  const notes = products.filter((product) => !product.best).map((product) => `${product.canonicalName}: sem oferta comparavel.`);
  return scenarioFromLines('multi', 'Cenario A - multi-fornecedor (menor custo por item)', lines, notes);
}

function monoSupplierScenario(products: ProductAnalysis[]): PurchaseScenario {
  const allSuppliers = Array.from(new Set(products.flatMap((product) => product.topOffers.map((offer) => offer.item.supplier))));
  let best: PurchaseScenario | null = null;
  const notes: string[] = [];

  for (const supplier of allSuppliers) {
    const lines: ScenarioLine[] = [];
    const missing: string[] = [];

    for (const product of products) {
      const offer = product.topOffers.find((entry) => entry.item.supplier === supplier);
      if (offer) lines.push(lineFromOffer(product, offer));
      else missing.push(product.canonicalName);
    }

    if (missing.length) {
      notes.push(`${supplier}: nao cobre ${missing.length} item(ns).`);
      continue;
    }

    const scenario = scenarioFromLines('mono', `Cenario B - mono-fornecedor (${supplier})`, lines, []);
    if (!best || scenario.totalCost < best.totalCost) best = scenario;
  }

  if (best) return best;
  return scenarioFromLines('mono', 'Cenario B - mono-fornecedor', [], ['Nenhum fornecedor cobre todos os itens comparaveis.', ...notes]);
}

function passesRestrictions(offer: ProductRankingEntry, options: ImportOptions): boolean {
  const supplier = offer.item.supplier.toLowerCase();
  if (options.requireAvailable !== false && !offer.item.available) return false;
  if (options.maxLeadTimeDays && offer.item.leadTimeDays !== null && offer.item.leadTimeDays > options.maxLeadTimeDays) return false;
  if (options.supplierAllowList?.length && !options.supplierAllowList.map((name) => name.toLowerCase()).includes(supplier)) return false;
  if (options.supplierBlockList?.map((name) => name.toLowerCase()).includes(supplier)) return false;
  if (offer.item.moq && offer.item.moq > offer.item.quantityUnits) return false;
  return true;
}

function restrictedScenario(products: ProductAnalysis[], options: ImportOptions): PurchaseScenario {
  const allowedByProduct = products.map((product) => ({
    product,
    offers: product.topOffers.filter((offer) => passesRestrictions(offer, options))
  }));

  const supplierWins = new Map<string, number>();
  for (const { offers } of allowedByProduct) {
    const best = offers[0];
    if (best) supplierWins.set(best.item.supplier, (supplierWins.get(best.item.supplier) ?? 0) + 1);
  }

  const selectedSuppliers = Array.from(supplierWins.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, options.maxSuppliers ?? Number.POSITIVE_INFINITY)
    .map(([supplier]) => supplier);

  const supplierLimitActive = Boolean(options.maxSuppliers && Number.isFinite(options.maxSuppliers));
  const lines: ScenarioLine[] = [];
  const notes: string[] = [];

  for (const { product, offers } of allowedByProduct) {
    const candidates = supplierLimitActive ? offers.filter((offer) => selectedSuppliers.includes(offer.item.supplier)) : offers;
    const chosen = candidates[0];
    if (chosen) lines.push(lineFromOffer(product, chosen));
    else notes.push(`${product.canonicalName}: sem oferta que atenda as restricoes.`);
  }

  return scenarioFromLines('restricted', 'Cenario C - restricoes aplicadas', lines, notes);
}

function scenarioDeltaIssue(a: PurchaseScenario, b: PurchaseScenario): ValidationIssue | null {
  if (!a.totalCost || !b.totalCost) return null;
  return {
    severity: 'info',
    code: 'scenario_delta',
    message: `${b.name} custa R$ ${(b.totalCost - a.totalCost).toFixed(2)} a mais que o cenario multi-fornecedor.`
  };
}

export function runAnalysis(items: NormalizedQuoteItem[], options: ImportOptions = {}): AnalysisResult {
  const products = analyzeProducts(items, options);
  const supplierRankings = rankSuppliers(products);
  const multi = multiSupplierScenario(products);
  const mono = monoSupplierScenario(products);
  const restricted = restrictedScenario(products, options);
  const scenarioIssues = [scenarioDeltaIssue(multi, mono), scenarioDeltaIssue(multi, restricted)].filter(Boolean) as ValidationIssue[];

  const dataQualityIssues: ValidationIssue[] = [
    ...items.flatMap((item) => item.issues.map((issue) => ({ ...issue, message: `${item.canonicalName}: ${issue.message}` }))),
    ...products.flatMap((product) => [
      ...product.outlierSupplierNames.map((supplier) => ({
        severity: 'warning' as const,
        code: 'price_outlier',
        message: `${product.canonicalName}: ${supplier} parece outlier de preco pelo metodo IQR.`
      })),
      ...product.ambiguityWarnings.map((message) => ({
        severity: 'warning' as const,
        code: 'product_ambiguity',
        message: `${product.canonicalName}: ${message}`
      })),
      ...product.missingSuppliers.map((supplier) => ({
        severity: 'info' as const,
        code: 'missing_supplier_quote',
        message: `${supplier} nao cotou ${product.canonicalName}.`
      }))
    ]),
    ...scenarioIssues
  ];

  return {
    generatedAt: new Date().toISOString(),
    options,
    products,
    supplierRankings,
    scenarios: [multi, mono, restricted],
    dataQualityIssues,
    totalPotentialSavingsVsAverage: products.reduce((sum, product) => sum + product.potentialSavingsVsAverage, 0)
  };
}

import writeXlsxFile from 'write-excel-file/node';
import type { AnalysisResult } from './types';

function money(value: number): string {
  return value.toFixed(2);
}

export function analysisToCsv(analysis: AnalysisResult): string {
  const header = [
    'Produto', 'Fornecedor vencedor', 'Custo unitario', 'Demanda', 'Custo total', 'Economia vs media', 'Top 3'
  ];
  const rows = analysis.products.map((product) => [
    product.canonicalName,
    product.best?.item.supplier ?? '',
    product.best ? money(product.best.item.computedCostUnit) : '',
    String(product.demandUnits),
    product.best ? money(product.best.item.computedCostUnit * product.demandUnits) : '',
    money(product.potentialSavingsVsAverage),
    product.topOffers.map((offer) => `${offer.rank}. ${offer.item.supplier} R$ ${money(offer.item.computedCostUnit)}`).join(' | ')
  ]);

  return [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
}

type CellValue = string | number | boolean | Date | null;
type XlsxCell = { value: CellValue; fontWeight?: 'bold'; format?: string };

type XlsxSheet = XlsxCell[][];

function headerRow(values: string[]): XlsxCell[] {
  return values.map((value) => ({ value, fontWeight: 'bold' }));
}

function row(values: CellValue[]): XlsxCell[] {
  return values.map((value) => ({ value }));
}

export async function analysisToWorkbook(analysis: AnalysisResult): Promise<Buffer> {
  const products: XlsxSheet = [headerRow([
    'Produto', 'Fornecedor', 'Rank', 'Custo unitario', 'Diferenca R$', 'Diferenca %', 'Lead time', 'MOQ', 'Disponivel'
  ])];

  analysis.products.forEach((product) => {
    product.topOffers.forEach((offer) => {
      products.push(row([
        product.canonicalName,
        offer.item.supplier,
        offer.rank,
        offer.item.computedCostUnit,
        offer.differenceFromBest,
        offer.differenceFromBestPct / 100,
        offer.item.leadTimeDays ?? null,
        offer.item.moq ?? null,
        offer.item.available ? 'sim' : 'nao'
      ]));
    });
  });

  const scenarios: XlsxSheet = [headerRow(['Cenario', 'Produto', 'Fornecedor', 'Demanda', 'Custo unitario', 'Custo total'])];
  analysis.scenarios.forEach((scenario) => {
    scenario.lines.forEach((line) => {
      scenarios.push(row([scenario.name, line.canonicalName, line.supplier, line.demandUnits, line.unitCost, line.totalCost]));
    });
  });

  const suppliers: XlsxSheet = [headerRow([
    'Fornecedor', 'Itens vencedores', 'Itens cotados', 'Gasto vencedor', 'Economia vs media', 'Desvio vs mercado'
  ])];
  analysis.supplierRankings.forEach((supplier) => suppliers.push(row([
    supplier.supplier,
    supplier.winnerItems,
    supplier.quotedItems,
    supplier.totalSpendIfChosenItems,
    supplier.potentialSavingsVsAverage,
    supplier.marketDeviationPct / 100
  ])));

  const writeBuffer = writeXlsxFile as unknown as (
    sheets: XlsxSheet[],
    options: { sheets: string[]; buffer: true }
  ) => Promise<ArrayBuffer | Buffer>;
  const buffer = await writeBuffer([products, scenarios, suppliers], {
    sheets: ['Melhores precos', 'Cenarios', 'Fornecedores'],
    buffer: true
  });

  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(new Uint8Array(buffer));
}

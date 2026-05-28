import { randomUUID } from 'crypto';
import type {
  ColumnKey,
  ColumnMapping,
  ImportOptions,
  NormalizedQuoteItem,
  PackagingType,
  ValidationIssue
} from './types';

const COLUMN_ALIASES: Record<ColumnKey, string[]> = {
  supplier: ['fornecedor', 'supplier', 'distribuidor', 'vendedor'],
  rawProductName: ['produto', 'nome produto', 'descricao', 'descrição', 'item', 'sku', 'nome bruto'],
  brand: ['marca', 'brand', 'fabricante'],
  packagingType: ['tipo', 'embalagem', 'tipo embalagem', 'packaging'],
  volume: ['volume', 'ml', 'litro', 'litragem', 'capacidade'],
  unitsPerPack: ['unidades por pack', 'un pack', 'unidades caixa', 'qtd caixa', 'qtd pack', 'pack', 'cx'],
  quantityUnits: ['quantidade', 'qtd', 'qtde', 'quantidade unidades', 'unidades vendidas'],
  totalPrice: ['preco total', 'preço total', 'valor total', 'total', 'subtotal'],
  unitPrice: ['preco unitario', 'preço unitário', 'valor unitario', 'unitario', 'unitário'],
  discount: ['desconto', 'discount'],
  freight: ['frete', 'shipping'],
  taxes: ['impostos', 'taxas', 'impostos taxas', 'tax'],
  returnableDeposit: ['deposito', 'depósito', 'vasilhame', 'casco'],
  paymentTermDays: ['prazo', 'prazo pagamento', 'dias pagamento'],
  leadTimeDays: ['lead time', 'entrega', 'prazo entrega'],
  moq: ['moq', 'pedido minimo', 'pedido mínimo', 'minimo', 'mínimo'],
  available: ['disponivel', 'disponível', 'estoque', 'available'],
  quoteDate: ['data', 'data orcamento', 'data orçamento'],
  observations: ['observacoes', 'observações', 'obs', 'observacao', 'observação']
};

const PACKAGING_LABELS: Record<PackagingType, string> = {
  lata: 'Lata',
  garrafa: 'Garrafa',
  long_neck: 'Long Neck',
  barril: 'Barril',
  outro: 'Embalagem'
};

const KNOWN_BRANDS = [
  'Heineken', 'Amstel', 'Brahma', 'Skol', 'Antarctica', 'Original', 'Budweiser', 'Stella Artois',
  'Corona', 'Spaten', 'Becks', 'Colorado', 'Bohemia', 'Itaipava', 'Petra', 'Devassa', 'Eisenbahn',
  'Bavaria', 'Kaiser', 'Império', 'Imperio', 'Crystal', 'Schin'
];

export function normalizeText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9%$.,/ -]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function canonicalHeader(value: string): string {
  return normalizeText(value).replace(/[^a-z0-9]/g, '');
}

export function autoMapColumns(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const normalizedHeaders = headers.map((header) => ({ header, normalized: canonicalHeader(header) }));

  for (const [key, aliases] of Object.entries(COLUMN_ALIASES) as [ColumnKey, string[]][]) {
    const normalizedAliases = aliases.map(canonicalHeader);
    const match = normalizedHeaders.find(({ normalized }) =>
      normalizedAliases.some((alias) => normalized === alias || normalized.includes(alias) || alias.includes(normalized))
    );
    if (match) mapping[key] = match.header;
  }

  return mapping;
}

function readMapped(row: Record<string, unknown>, mapping: ColumnMapping, key: ColumnKey): unknown {
  const mapped = mapping[key];
  if (!mapped) return undefined;
  return row[mapped];
}

export function parseNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const raw = String(value ?? '').trim();
  if (!raw) return null;

  const onlyNumber = raw
    .replace(/R\$/gi, '')
    .replace(/[^0-9,.-]/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.');

  const parsed = Number.parseFloat(onlyNumber);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseInteger(value: unknown): number | null {
  const parsed = parseNumber(value);
  if (parsed === null) return null;
  return Math.max(0, Math.round(parsed));
}

export function parseVolumeMl(...values: unknown[]): number | null {
  const text = normalizeText(values.filter(Boolean).join(' '));
  if (!text) return null;

  const unitMatch = text.match(/(\d+(?:[,.]\d+)?)\s*(ml|m l|l|lt|litro|litros)\b/);
  if (unitMatch) {
    const amount = Number.parseFloat(unitMatch[1].replace(',', '.'));
    if (!Number.isFinite(amount)) return null;
    return unitMatch[2].startsWith('l') || unitMatch[2] === 'lt' ? Math.round(amount * 1000) : Math.round(amount);
  }

  const common = text.match(/\b(269|300|310|330|350|473|500|550|600|1000|1500)\b/);
  return common ? Number.parseInt(common[1], 10) : null;
}

function detectPackaging(...values: unknown[]): PackagingType {
  const text = normalizeText(values.filter(Boolean).join(' '));
  if (/long\s*neck|ln\b/.test(text)) return 'long_neck';
  if (/lata|latinha|can\b/.test(text)) return 'lata';
  if (/garrafa|gfa|vidro|retornavel|retornável|casco/.test(text)) return 'garrafa';
  if (/barril|keg|chope|chopp/.test(text)) return 'barril';
  return 'outro';
}

function detectReturnable(...values: unknown[]): boolean {
  const text = normalizeText(values.filter(Boolean).join(' '));
  if (/\b(nr|n\/r|nao retornavel|nao-retornavel|descartavel)\b/.test(text)) return false;
  if (/\b(r|retornavel|retorna|casco|vasilhame|engradado)\b/.test(text)) return true;
  return false;
}

function detectUnitsPerPack(...values: unknown[]): number {
  const text = normalizeText(values.filter(Boolean).join(' '));
  const packMatch = text.match(/(?:cx|caixa|fardo|pack|engradado|c\/)\s*(?:com\s*)?(\d{1,3})\s*(?:un|und|unidades)?/);
  if (packMatch) return Number.parseInt(packMatch[1], 10);

  const unitMatch = text.match(/\b(\d{1,3})\s*(?:un|und|unidades|long necks|latas|garrafas)\b/);
  if (unitMatch) return Number.parseInt(unitMatch[1], 10);

  return 1;
}

function detectBrand(rawProductName: string, mappedBrand: unknown): string {
  const explicit = String(mappedBrand ?? '').trim();
  if (explicit) return titleCase(explicit);

  const normalizedProduct = normalizeText(rawProductName);
  const known = KNOWN_BRANDS.find((brand) => normalizeText(brand) && normalizedProduct.includes(normalizeText(brand)));
  if (known) return titleCase(known);

  const firstToken = rawProductName.trim().split(/\s+/)[0];
  return titleCase(firstToken || 'Sem marca');
}

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function parseAvailability(value: unknown): boolean {
  const text = normalizeText(value);
  if (!text) return true;
  return !/\b(nao|não|n|false|indisponivel|sem estoque|0)\b/.test(text);
}

function parseDiscount(value: unknown, grossPrice: number): number {
  const text = String(value ?? '').trim();
  if (!text) return 0;
  const numeric = parseNumber(text) ?? 0;
  if (/%/.test(text)) return Math.max(0, grossPrice * (numeric / 100));
  return Math.max(0, numeric);
}

function formatCanonicalName(brand: string, packagingType: PackagingType, volumeMl: number | null, returnable: boolean): string {
  const volume = volumeMl ? `${volumeMl}ml` : 'volume pendente';
  return `${brand} ${PACKAGING_LABELS[packagingType]} ${volume} (${returnable ? 'R' : 'NR'})`;
}

function paymentTermAdjustment(netCostBeforeTerm: number, paymentTermDays: number, monthlyCapitalCostPct?: number): number {
  const monthlyRate = (monthlyCapitalCostPct ?? 0) / 100;
  if (!monthlyRate || !paymentTermDays) return 0;
  // Longer payment terms reduce the present cost. The adjustment is negative by design.
  return -netCostBeforeTerm * monthlyRate * (paymentTermDays / 30);
}

export function normalizeRows(params: {
  fileName: string;
  rows: Record<string, unknown>[];
  mapping: ColumnMapping;
  options?: ImportOptions;
}): NormalizedQuoteItem[] {
  const { fileName, rows, mapping, options } = params;

  return rows.map((row, index) => {
    const rawProductName = String(readMapped(row, mapping, 'rawProductName') ?? '').trim();
    const supplier = titleCase(String(readMapped(row, mapping, 'supplier') ?? 'Fornecedor nao informado').trim());
    const brand = detectBrand(rawProductName, readMapped(row, mapping, 'brand'));
    const packagingType = detectPackaging(rawProductName, readMapped(row, mapping, 'packagingType'));
    const volumeMl = parseVolumeMl(readMapped(row, mapping, 'volume'), rawProductName);
    const returnable = detectReturnable(rawProductName, readMapped(row, mapping, 'packagingType'), readMapped(row, mapping, 'returnableDeposit'));
    const unitsPerPack = parseInteger(readMapped(row, mapping, 'unitsPerPack')) ?? detectUnitsPerPack(rawProductName);
    const quantityUnits = parseInteger(readMapped(row, mapping, 'quantityUnits')) ?? unitsPerPack;
    const unitPriceInput = parseNumber(readMapped(row, mapping, 'unitPrice'));
    const mappedTotalPrice = parseNumber(readMapped(row, mapping, 'totalPrice'));
    const grossPrice = mappedTotalPrice ?? ((unitPriceInput ?? 0) * Math.max(quantityUnits, 1));
    const discountAmount = parseDiscount(readMapped(row, mapping, 'discount'), grossPrice);
    const freightAmount = parseNumber(readMapped(row, mapping, 'freight')) ?? 0;
    const taxesAmount = parseNumber(readMapped(row, mapping, 'taxes')) ?? 0;
    const returnableDepositAmount = parseNumber(readMapped(row, mapping, 'returnableDeposit')) ?? 0;
    const paymentTermDays = parseInteger(readMapped(row, mapping, 'paymentTermDays')) ?? 0;
    const leadTimeDays = parseInteger(readMapped(row, mapping, 'leadTimeDays'));
    const moq = parseInteger(readMapped(row, mapping, 'moq'));
    const available = parseAvailability(readMapped(row, mapping, 'available'));
    const quoteDateValue = readMapped(row, mapping, 'quoteDate');
    const observations = String(readMapped(row, mapping, 'observations') ?? '').trim() || null;
    const canonicalName = formatCanonicalName(brand, packagingType, volumeMl, returnable);
    const netBeforeTerm = grossPrice - discountAmount + freightAmount + taxesAmount + returnableDepositAmount;
    const termAdjustment = paymentTermAdjustment(netBeforeTerm, paymentTermDays, options?.monthlyCapitalCostPct);
    const effectiveTotal = netBeforeTerm + termAdjustment;
    const computedCostUnit = quantityUnits > 0 ? effectiveTotal / quantityUnits : 0;
    const computedCostLiter = volumeMl && computedCostUnit > 0 ? computedCostUnit / (volumeMl / 1000) : null;

    const issues: ValidationIssue[] = [];
    if (!rawProductName) issues.push({ severity: 'error', code: 'missing_product', field: 'rawProductName', message: 'Produto ausente; revise o mapeamento da coluna.' });
    if (!supplier || supplier === 'Fornecedor Nao Informado') issues.push({ severity: 'error', code: 'missing_supplier', field: 'supplier', message: 'Fornecedor ausente; revise o mapeamento.' });
    if (!volumeMl) issues.push({ severity: 'error', code: 'missing_volume', field: 'volume', message: 'Volume ausente ou ambiguo. Corrija antes de comparar o produto.' });
    if (grossPrice <= 0) issues.push({ severity: 'error', code: 'invalid_price', field: 'totalPrice', message: 'Preco bruto zerado ou negativo.' });
    if (quantityUnits <= 0) issues.push({ severity: 'error', code: 'invalid_quantity', field: 'quantityUnits', message: 'Quantidade em unidades deve ser maior que zero.' });
    if (unitsPerPack <= 0 || unitsPerPack > 240) issues.push({ severity: 'warning', code: 'pack_incoherent', field: 'unitsPerPack', message: 'Unidades por pack parecem incoerentes.' });
    if (returnable && returnableDepositAmount <= 0) issues.push({ severity: 'warning', code: 'missing_deposit', field: 'returnableDeposit', message: 'Produto retornavel sem deposito de vasilhame informado.' });
    if (!available) issues.push({ severity: 'warning', code: 'not_available', field: 'available', message: 'Oferta marcada como indisponivel.' });
    if (computedCostUnit <= 0) issues.push({ severity: 'error', code: 'invalid_effective_cost', message: 'Custo efetivo unitario ficou zerado ou negativo.' });

    return {
      id: randomUUID(),
      sourceFile: fileName,
      rowNumber: index + 2,
      supplier,
      rawProductName,
      brand,
      packagingType,
      packagingLabel: PACKAGING_LABELS[packagingType],
      volumeMl,
      returnable,
      unitsPerPack,
      quantityUnits,
      grossPrice,
      unitPriceInput,
      discountAmount,
      freightAmount,
      taxesAmount,
      returnableDepositAmount,
      paymentTermDays,
      leadTimeDays,
      moq,
      available,
      quoteDate: quoteDateValue ? String(quoteDateValue) : null,
      observations,
      canonicalName,
      computedCostUnit,
      computedCostLiter,
      paymentTermAdjustment: termAdjustment,
      issues
    };
  });
}

export function collectDataQualityIssues(items: NormalizedQuoteItem[]): ValidationIssue[] {
  return items.flatMap((item) =>
    item.issues.map((issue) => ({
      ...issue,
      message: `${item.sourceFile} linha ${item.rowNumber}: ${issue.message}`
    }))
  );
}

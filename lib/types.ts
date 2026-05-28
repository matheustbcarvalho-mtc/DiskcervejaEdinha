export type PackagingType = 'lata' | 'garrafa' | 'long_neck' | 'barril' | 'outro';

export type ColumnKey =
  | 'supplier'
  | 'rawProductName'
  | 'brand'
  | 'packagingType'
  | 'volume'
  | 'unitsPerPack'
  | 'quantityUnits'
  | 'totalPrice'
  | 'unitPrice'
  | 'discount'
  | 'freight'
  | 'taxes'
  | 'returnableDeposit'
  | 'paymentTermDays'
  | 'leadTimeDays'
  | 'moq'
  | 'available'
  | 'quoteDate'
  | 'observations';

export type ColumnMapping = Partial<Record<ColumnKey, string>>;

export type FreightAllocationMethod = 'value' | 'volume' | 'weight';

export type ImportOptions = {
  monthlyCapitalCostPct?: number;
  freightAllocation?: FreightAllocationMethod;
  targetQuantities?: Record<string, number>;
  requireAvailable?: boolean;
  maxLeadTimeDays?: number;
  maxSuppliers?: number;
  supplierAllowList?: string[];
  supplierBlockList?: string[];
};

export type ParsedImportFile = {
  fileName: string;
  headers: string[];
  rows: Record<string, unknown>[];
  autoMapping: ColumnMapping;
};

export type ValidationSeverity = 'error' | 'warning' | 'info';

export type ValidationIssue = {
  severity: ValidationSeverity;
  code: string;
  message: string;
  field?: ColumnKey | string;
};

export type NormalizedQuoteItem = {
  id: string;
  sourceFile: string;
  rowNumber: number;
  supplier: string;
  rawProductName: string;
  brand: string;
  packagingType: PackagingType;
  packagingLabel: string;
  volumeMl: number | null;
  returnable: boolean;
  unitsPerPack: number;
  quantityUnits: number;
  grossPrice: number;
  unitPriceInput: number | null;
  discountAmount: number;
  freightAmount: number;
  taxesAmount: number;
  returnableDepositAmount: number;
  paymentTermDays: number;
  leadTimeDays: number | null;
  moq: number | null;
  available: boolean;
  quoteDate: string | null;
  observations: string | null;
  canonicalName: string;
  computedCostUnit: number;
  computedCostLiter: number | null;
  paymentTermAdjustment: number;
  issues: ValidationIssue[];
};

export type ProductRankingEntry = {
  item: NormalizedQuoteItem;
  rank: number;
  differenceFromBest: number;
  differenceFromBestPct: number;
};

export type ProductAnalysis = {
  canonicalName: string;
  brand: string;
  packagingLabel: string;
  volumeMl: number | null;
  returnable: boolean;
  demandUnits: number;
  best: ProductRankingEntry | null;
  topOffers: ProductRankingEntry[];
  averageCostUnit: number | null;
  potentialSavingsVsAverage: number;
  missingSuppliers: string[];
  outlierSupplierNames: string[];
  ambiguityWarnings: string[];
};

export type SupplierRanking = {
  supplier: string;
  winnerItems: number;
  quotedItems: number;
  totalSpendIfChosenItems: number;
  potentialSavingsVsAverage: number;
  marketDeviationPct: number;
};

export type ScenarioLine = {
  canonicalName: string;
  supplier: string;
  unitCost: number;
  demandUnits: number;
  totalCost: number;
  available: boolean;
};

export type PurchaseScenario = {
  id: 'multi' | 'mono' | 'restricted';
  name: string;
  totalCost: number;
  supplierCount: number;
  lines: ScenarioLine[];
  notes: string[];
};

export type AnalysisResult = {
  generatedAt: string;
  options: ImportOptions;
  products: ProductAnalysis[];
  supplierRankings: SupplierRanking[];
  scenarios: PurchaseScenario[];
  dataQualityIssues: ValidationIssue[];
  totalPotentialSavingsVsAverage: number;
};

export type ImportResponse = {
  files: ParsedImportFile[];
  items: NormalizedQuoteItem[];
  dataQualityIssues: ValidationIssue[];
  persisted?: {
    quoteIds: string[];
    skippedReason?: string;
  };
};

export const COLUMN_LABELS: Record<ColumnKey, string> = {
  supplier: 'Fornecedor',
  rawProductName: 'Produto (nome bruto)',
  brand: 'Marca',
  packagingType: 'Tipo/Embalagem',
  volume: 'Volume',
  unitsPerPack: 'Unidades por pack',
  quantityUnits: 'Quantidade (unidades)',
  totalPrice: 'Preco total',
  unitPrice: 'Preco unitario',
  discount: 'Desconto (%/R$)',
  freight: 'Frete',
  taxes: 'Impostos/Taxas',
  returnableDeposit: 'Deposito de vasilhame',
  paymentTermDays: 'Prazo de pagamento (dias)',
  leadTimeDays: 'Lead time',
  moq: 'MOQ',
  available: 'Disponivel',
  quoteDate: 'Data do orcamento',
  observations: 'Observacoes'
};

export const REQUIRED_COLUMN_KEYS: ColumnKey[] = ['supplier', 'rawProductName'];

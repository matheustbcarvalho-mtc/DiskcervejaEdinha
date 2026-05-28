import readXlsxFile from 'read-excel-file/node';
import Papa from 'papaparse';
import { autoMapColumns } from './normalization';
import type { ParsedImportFile } from './types';

function normalizeCell(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value ?? '';
}

export async function parseBudgetFile(file: File): Promise<ParsedImportFile> {
  const extension = file.name.split('.').pop()?.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());

  if (extension === 'csv' || file.type.includes('csv')) {
    return parseCsv(file.name, buffer.toString('utf-8'));
  }

  if (extension === 'xlsx' || extension === 'xls') {
    return parseWorkbook(file.name, buffer);
  }

  throw new Error(`${file.name}: formato nao suportado. Envie CSV ou XLSX.`);
}

function parseCsv(fileName: string, content: string): ParsedImportFile {
  const parsed = Papa.parse<Record<string, unknown>>(content, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim()
  });

  if (parsed.errors.length) {
    const firstError = parsed.errors[0];
    throw new Error(`${fileName}: erro no CSV na linha ${firstError.row ?? '?'} - ${firstError.message}`);
  }

  const rows = parsed.data.filter((row) => Object.values(row).some((value) => String(value ?? '').trim()));
  const headers = parsed.meta.fields ?? Object.keys(rows[0] ?? {});
  return { fileName, headers, rows, autoMapping: autoMapColumns(headers) };
}

async function parseWorkbook(fileName: string, buffer: Buffer): Promise<ParsedImportFile> {
  const sheetRows = (await readXlsxFile(buffer)) as unknown as unknown[][];
  const headerValues = sheetRows[0] ?? [];
  const headers = headerValues.map((value: unknown) => String(normalizeCell(value)).trim()).filter(Boolean);
  if (!headers.length) throw new Error(`${fileName}: planilha sem cabecalho.`);

  const rows = sheetRows.slice(1).map((row) => {
    const record: Record<string, unknown> = {};
    headers.forEach((header: string, index: number) => {
      record[header] = normalizeCell(row[index]);
    });
    return record;
  }).filter((row) => Object.values(row).some((value) => String(value ?? '').trim()));

  return { fileName, headers, rows, autoMapping: autoMapColumns(headers) };
}

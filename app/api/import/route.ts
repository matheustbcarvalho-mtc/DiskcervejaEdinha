import { NextResponse } from 'next/server';
import { parseBudgetFile } from '@/lib/importers';
import { collectDataQualityIssues, normalizeRows } from '@/lib/normalization';
import { persistImport } from '@/lib/persistence';
import type { ColumnMapping, ImportOptions } from '@/lib/types';

export const runtime = 'nodejs';

function parseJsonField<T>(value: FormDataEntryValue | null, fallback: T): T {
  if (!value || typeof value !== 'string') return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('files').filter((entry): entry is File => entry instanceof File && entry.size > 0);
    const explicitMapping = parseJsonField<ColumnMapping>(formData.get('mapping'), {});
    const options = parseJsonField<ImportOptions>(formData.get('options'), {});
    const previewOnly = formData.get('previewOnly') === 'true';

    if (!files.length) {
      return NextResponse.json({ error: 'Envie ao menos um arquivo CSV ou XLSX.' }, { status: 400 });
    }

    const parsedFiles = await Promise.all(files.map(parseBudgetFile));
    const items = parsedFiles.flatMap((file) => {
      const mapping = { ...file.autoMapping, ...explicitMapping };
      return normalizeRows({ fileName: file.fileName, rows: file.rows, mapping, options });
    });
    const dataQualityIssues = collectDataQualityIssues(items);
    const persisted = previewOnly ? undefined : await persistImport(request, items);

    return NextResponse.json({ files: parsedFiles, items, dataQualityIssues, persisted });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Falha ao importar orcamentos.' },
      { status: 500 }
    );
  }
}

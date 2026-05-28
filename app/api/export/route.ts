import { NextResponse } from 'next/server';
import { analysisToCsv, analysisToWorkbook } from '@/lib/exporters';
import type { AnalysisResult } from '@/lib/types';

export const runtime = 'nodejs';

type ExportPayload = {
  analysis?: AnalysisResult;
  format?: 'csv' | 'xlsx';
};

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as ExportPayload;
    if (!payload.analysis) return NextResponse.json({ error: 'Analise ausente.' }, { status: 400 });

    if (payload.format === 'xlsx') {
      const buffer = await analysisToWorkbook(payload.analysis);
      const body = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
      return new NextResponse(body, {
        headers: {
          'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'content-disposition': 'attachment; filename="analise-diskcerveja.xlsx"'
        }
      });
    }

    const csv = analysisToCsv(payload.analysis);
    return new NextResponse(csv, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="analise-diskcerveja.csv"'
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Falha ao exportar relatorio.' },
      { status: 500 }
    );
  }
}

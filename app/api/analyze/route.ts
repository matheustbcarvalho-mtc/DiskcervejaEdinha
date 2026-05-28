import { NextResponse } from 'next/server';
import { runAnalysis } from '@/lib/analysis';
import { persistAnalysis } from '@/lib/persistence';
import type { ImportOptions, NormalizedQuoteItem } from '@/lib/types';

export const runtime = 'nodejs';

type AnalyzePayload = {
  items?: NormalizedQuoteItem[];
  options?: ImportOptions;
  persist?: boolean;
};

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as AnalyzePayload;
    if (!payload.items?.length) {
      return NextResponse.json({ error: 'Nao ha itens normalizados para analisar.' }, { status: 400 });
    }

    const analysis = runAnalysis(payload.items, payload.options ?? {});
    const persisted = payload.persist === false ? undefined : await persistAnalysis(request, analysis);
    return NextResponse.json({ analysis, persisted });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Falha ao executar analise.' },
      { status: 500 }
    );
  }
}

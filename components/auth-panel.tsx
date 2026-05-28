"use client";

import { useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

export function AuthPanel() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);
  const supabase = createSupabaseBrowserClient();

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => setSignedInEmail(data.user?.email ?? null));
  }, [supabase]);

  async function signIn() {
    if (!supabase) {
      setMessage('Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY para habilitar auth.');
      return;
    }
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined }
    });
    setMessage(error ? error.message : 'Link magico enviado. Verifique seu e-mail.');
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setSignedInEmail(null);
    setMessage('Sessao encerrada.');
  }

  return (
    <aside className="card">
      <h2 className="text-lg font-bold text-slate-900">Acesso Supabase</h2>
      <p className="mt-2 text-sm text-slate-600">
        O fluxo funciona localmente sem login. Com Supabase configurado, uploads e analises sao persistidos por organizacao.
      </p>
      {signedInEmail ? (
        <div className="mt-4 space-y-3">
          <p className="rounded-xl bg-green-50 px-3 py-2 text-sm text-green-800">Logado como {signedInEmail}</p>
          <button className="btn-secondary" onClick={signOut}>Sair</button>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <input className="input" type="email" placeholder="email@empresa.com" value={email} onChange={(event) => setEmail(event.target.value)} />
          <button className="btn" onClick={signIn} disabled={!email}>Enviar link magico</button>
        </div>
      )}
      {message ? <p className="mt-3 text-sm text-amber-800">{message}</p> : null}
    </aside>
  );
}

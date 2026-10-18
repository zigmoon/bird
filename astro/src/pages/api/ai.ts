import type { APIRoute } from 'astro';

export const prerender = false;

/**
 * Proxy OpenRouter optionnel.
 * - La clé peut venir de l'environnement (OPENROUTER_API_KEY) ou de l'en-tête
 *   x-openrouter-key envoyé par le client.
 * - Aucun log du prompt ni de la clé. Aucun stockage.
 * - Limitation simple en mémoire : 30 requêtes / minute / IP.
 */
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 30;
const hits = new Map<string, { count: number; reset: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || entry.reset < now) {
    hits.set(ip, { count: 1, reset: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_REQUESTS;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const ip = clientAddress || request.headers.get('x-forwarded-for') || 'local';
  if (rateLimited(ip)) return json({ error: 'Trop de requêtes, réessayez dans une minute.' }, 429);

  const runtimeEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env?.OPENROUTER_API_KEY;
  const key = request.headers.get('x-openrouter-key') ||
    runtimeEnv ||
    import.meta.env.OPENROUTER_API_KEY ||
    '';
  if (!key) {
    return json({
      error: 'Clé OpenRouter absente. Renseignez-la dans l’atelier IA ou configurez OPENROUTER_API_KEY.'
    }, 401);
  }

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Corps JSON invalide.' }, 400);
  }

  // On ne laisse pas le client choisir une URL arbitraire.
  const body = {
    model: typeof payload.model === 'string' ? payload.model : 'openrouter/free',
    messages: Array.isArray(payload.messages) ? payload.messages : [],
    temperature: typeof payload.temperature === 'number' ? payload.temperature : 0.7,
    max_tokens: typeof payload.max_tokens === 'number' ? Math.min(payload.max_tokens, 8192) : 2048,
    stream: false
  };

  try {
    const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://app.zigmoon.com/bird/',
        'X-Title': 'Bird — éditeur vectoriel'
      },
      body: JSON.stringify(body)
    });

    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
      }
    });
  } catch {
    return json({ error: 'OpenRouter injoignable.' }, 502);
  }
};

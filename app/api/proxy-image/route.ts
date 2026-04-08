/**
 * GET /api/proxy-image?url=<encodedURL>
 *
 * Proxy server-side para imágenes de Google.
 * Permite que el browser haga canvas.drawImage() sobre fotos de Google
 * sin restricciones CORS, necesario para la migración automática de avatares.
 *
 * Seguridad: solo se permiten URLs de lh3.googleusercontent.com.
 */

const ALLOWED_HOSTNAMES = ["lh3.googleusercontent.com"];

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const imageUrl = searchParams.get("url");

  if (!imageUrl) {
    return new Response("Parámetro 'url' requerido", { status: 400 });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(imageUrl);
  } catch {
    return new Response("URL inválida", { status: 400 });
  }

  if (!ALLOWED_HOSTNAMES.includes(parsedUrl.hostname)) {
    return new Response("Dominio no permitido", { status: 403 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(parsedUrl.toString());
  } catch {
    return new Response("Error al obtener la imagen", { status: 502 });
  }

  if (!upstream.ok) {
    return new Response("Error al obtener la imagen", { status: 502 });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") ?? "image/jpeg",
      "Cache-Control": "public, max-age=300",
    },
  });
}

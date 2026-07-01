import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const error = req.nextUrl.searchParams.get('error');

  if (error || !code) {
    console.error('Google OAuth callback error:', error);
    return new NextResponse(
      '<html><body><h1>Error al conectar con Google</h1><p>No se concedieron permisos. Puedes cerrar esta ventana.</p></body></html>',
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
  const redirectUri = `${req.nextUrl.origin}/api/auth/callback/google`;

  try {
    // Intercambiar código de Google por tokens de acceso
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      })
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) {
      throw new Error(tokenData.error_description || 'Error al obtener token de Google.');
    }

    // Obtener información del perfil del usuario para obtener su nombre/email
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
    });
    const userData = await userRes.json();

    const responseHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Google Drive Conectado</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            background: #f7f9fc;
            color: #041627;
          }
          .card {
            background: white;
            padding: 2.5rem;
            border-radius: 4px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
            text-align: center;
            max-width: 400px;
          }
          .icon {
            font-size: 3rem;
            color: #006d37;
            margin-bottom: 1rem;
          }
          h1 {
            font-size: 1.25rem;
            margin: 0 0 0.5rem 0;
          }
          p {
            font-size: 0.875rem;
            color: #4a5d6e;
            margin: 0 0 1.5rem 0;
          }
          .btn {
            background: #006d37;
            color: white;
            border: none;
            padding: 0.625rem 1.25rem;
            font-size: 0.875rem;
            font-weight: bold;
            border-radius: 4px;
            cursor: pointer;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="icon">✓</div>
          <h1>Google Drive Conectado</h1>
          <p>La cuenta <strong>${userData.email || 'Google'}</strong> ha sido vinculada correctamente con Balance AI.</p>
          <button class="btn" onclick="window.close()">Cerrar Ventana</button>
        </div>
        <script>
          // Transmitir tokens y perfil al frontend que abrió la ventana/popup
          if (window.opener) {
            window.opener.postMessage({
              type: 'GOOGLE_AUTH_SUCCESS',
              payload: {
                accessToken: '${tokenData.access_token}',
                refreshToken: '${tokenData.refresh_token || ''}',
                expiresIn: ${tokenData.expires_in},
                userEmail: '${userData.email || ''}',
                userName: '${userData.name || ''}'
              }
            }, window.location.origin);
          }
          // Cerrar automáticamente después de 3 segundos por si acaso
          setTimeout(() => { window.close(); }, 4000);
        </script>
      </body>
      </html>
    `;

    return new NextResponse(responseHtml, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });

  } catch (err: any) {
    console.error('OAuth Callback Error:', err);
    return new NextResponse(
      `<html><body><h1>Error de autenticación</h1><p>${err.message}</p></body></html>`,
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
}

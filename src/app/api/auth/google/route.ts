import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';
  const redirectUri = `${req.nextUrl.origin}/api/auth/callback/google`;
  
  // Solicitamos acceso únicamente a drive.file (para crear y leer solo los archivos de la app) y perfil básico
  const scope = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email';
  
  const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${clientId}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(scope)}` +
    `&access_type=offline` + // offline para poder renovar tokens si es necesario
    `&prompt=consent`;

  return NextResponse.redirect(googleAuthUrl);
}

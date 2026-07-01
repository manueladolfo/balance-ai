import { NextRequest, NextResponse } from 'next/server';

/**
 * Endpoint para subir un archivo contable directamente a Google Drive
 * utilizando el Access Token de OAuth2 provisto por el cliente.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Falta Google Access Token.' }, { status: 401 });
    }
    const googleToken = authHeader.substring(7);

    const formData = await req.formData();
    const file = formData.get('file') as File;
    const userName = formData.get('userName') as string || 'default-user';

    if (!file) {
      return NextResponse.json({ error: 'No se envió ningún archivo.' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 1. Buscar o crear la carpeta raíz "balance-ai" en Google Drive
    const rootFolderId = await getOrCreateFolder(googleToken, 'balance-ai');

    // 2. Buscar o crear la subcarpeta del usuario "{userName}" dentro de "balance-ai"
    const userFolderId = await getOrCreateFolder(googleToken, userName, rootFolderId);

    // 3. Subir el archivo dentro de la carpeta del usuario
    const driveFileId = await uploadFileToDrive(googleToken, userFolderId, file.name, file.type, buffer);

    return NextResponse.json({
      success: true,
      driveFileId,
      fileName: file.name
    });

  } catch (err: any) {
    console.error('Error al subir a Google Drive:', err);
    return NextResponse.json({ error: err.message || 'Fallo interno al subir a Google Drive.' }, { status: 500 });
  }
}

// --- Funciones auxiliares para Google Drive API v3 (REST) ---

async function getOrCreateFolder(token: string, folderName: string, parentId?: string): Promise<string> {
  let query = `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  if (parentId) {
    query += ` and '${parentId}' in parents`;
  } else {
    query += ` and 'root' in parents`;
  }

  // Buscar si ya existe la carpeta
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)`;
  const res = await fetch(searchUrl, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (!res.ok) {
    const errData = await res.json();
    throw new Error(`Error buscando carpeta ${folderName}: ${errData.error?.message || res.statusText}`);
  }

  const searchData = await res.json();
  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  // Si no existe, crear la carpeta
  const createUrl = 'https://www.googleapis.com/drive/v3/files';
  const metadata: any = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder'
  };
  if (parentId) {
    metadata.parents = [parentId];
  }

  const createRes = await fetch(createUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(metadata)
  });

  if (!createRes.ok) {
    const errData = await createRes.json();
    throw new Error(`Error creando carpeta ${folderName}: ${errData.error?.message || createRes.statusText}`);
  }

  const newFolder = await createRes.json();
  return newFolder.id;
}

async function uploadFileToDrive(token: string, folderId: string, fileName: string, mimeType: string, fileBuffer: Buffer): Promise<string> {
  const metadata = {
    name: fileName,
    parents: [folderId]
  };

  // Usamos multipart upload para subir metadatos y binario juntos de forma eficiente
  const boundary = 'balance_ai_multipart_boundary';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const requestBody = Buffer.concat([
    Buffer.from(delimiter + 'Content-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(metadata)),
    Buffer.from(delimiter + `Content-Type: ${mimeType || 'application/octet-stream'}\r\nContent-Transfer-Encoding: base64\r\n\r\n` + fileBuffer.toString('base64')),
    Buffer.from(closeDelimiter)
  ]);

  const uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`
    },
    body: requestBody
  });

  if (!res.ok) {
    const errData = await res.json();
    throw new Error(`Fallo al subir archivo a Drive: ${errData.error?.message || res.statusText}`);
  }

  const fileData = await res.json();
  return fileData.id; // Retorna el ID del archivo en Google Drive
}

const DB_NAME = 'balance-ai-local-store';
const DB_VERSION = 1;
const STORE_NAME = 'documents-blob';

/**
 * Inicializa y abre la base de datos de IndexedDB de forma asíncrona.
 */
export function openLocalDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('IndexedDB solo está disponible en el entorno del navegador (cliente).'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(request.error);
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

/**
 * Guarda un documento en base64 de forma local.
 * @param id Identificador único del documento (generalmente el UUID de Supabase).
 * @param name Nombre del archivo.
 * @param base64 Contenido en base64.
 * @param mimeType Tipo MIME del archivo.
 */
export async function saveLocalDocument(
  id: string,
  name: string,
  base64: string,
  mimeType: string
): Promise<void> {
  const db = await openLocalDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    const record = {
      id,
      name,
      base64,
      mimeType,
      savedAt: new Date().toISOString(),
    };

    const request = store.put(record);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

/**
 * Recupera un documento de IndexedDB por su ID.
 */
export async function getLocalDocument(
  id: string
): Promise<{ id: string; name: string; base64: string; mimeType: string } | null> {
  const db = await openLocalDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);

    const request = store.get(id);

    request.onsuccess = () => {
      resolve(request.result || null);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

/**
 * Elimina un documento del almacenamiento IndexedDB.
 */
export async function deleteLocalDocument(id: string): Promise<void> {
  const db = await openLocalDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    const request = store.delete(id);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

/**
 * Exporta todos los documentos de IndexedDB en un único objeto serializado (Backup).
 */
export async function exportAllLocalDocuments(): Promise<string> {
  const db = await openLocalDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const jsonString = JSON.stringify(request.result);
      resolve(jsonString);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

/**
 * Importa y restaura una lista de documentos a IndexedDB de forma masiva.
 * @param jsonBackup Cadena JSON generada previamente por exportAllLocalDocuments.
 */
export async function importLocalDocuments(jsonBackup: string): Promise<void> {
  const db = await openLocalDB();
  const records = JSON.parse(jsonBackup);

  if (!Array.isArray(records)) {
    throw new Error('Formato de copia de seguridad inválido. Debe ser una lista.');
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    transaction.oncomplete = () => {
      resolve();
    };

    transaction.onerror = () => {
      reject(transaction.error);
    };

    for (const record of records) {
      if (record && record.id && record.base64) {
        store.put({
          id: record.id,
          name: record.name || 'Sin nombre',
          base64: record.base64,
          mimeType: record.mimeType || 'application/octet-stream',
          savedAt: record.savedAt || new Date().toISOString(),
        });
      }
    }
  });
}

import fs from 'fs';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'src/lib/mock_db.json');

export interface MockDocument {
  id: string;
  name: string;
  storage_path: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  type: 'Factura' | 'Recibo' | 'Ticket' | 'Extracto' | 'Otro';
  ia_description?: string;
  created_at: string;
}

export interface MockEntryLine {
  id: string;
  entry_id: string;
  line_type: 'debe' | 'haber';
  subaccount_code: string;
  subaccount_desc: string;
  amount: number;
}

export interface MockAccountingEntry {
  id: string;
  document_id: string;
  entry_date: string;
  entry_number: number;
  reference: string;
  concept: string;
  is_balanced: boolean;
  lines: MockEntryLine[];
  created_at: string;
}

export interface MockPgcAccount {
  code: string;
  description: string;
  is_operational: boolean;
}

interface MockSchema {
  documents: MockDocument[];
  entries: MockAccountingEntry[];
  pgc_accounts: MockPgcAccount[];
}

const defaultSchema: MockSchema = {
  documents: [
    {
      id: 'doc-1',
      name: 'FAC_2026_001_Iberdrola.pdf',
      storage_path: '/mock-uploads/FAC_2026_001_Iberdrola.pdf',
      status: 'completed',
      type: 'Factura',
      ia_description: 'Factura de luz Iberdrola - Junio 2026, Sede Central',
      created_at: new Date(Date.now() - 3600000 * 2).toISOString()
    },
    {
      id: 'doc-2',
      name: 'REC_Taxi_Airport.jpg',
      storage_path: '/mock-uploads/REC_Taxi_Airport.jpg',
      status: 'completed',
      type: 'Recibo',
      ia_description: 'Gasto de taxi corporativo - Traslado aeropuerto Barajas',
      created_at: new Date(Date.now() - 3600000 * 24).toISOString()
    }
  ],
  entries: [
    {
      id: 'entry-1',
      document_id: 'doc-1',
      entry_date: '2026-06-15',
      entry_number: 1,
      reference: 'FAC_2026_001',
      concept: 'Suministro eléctrico Iberdrola',
      is_balanced: true,
      created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
      lines: [
        {
          id: 'line-1',
          entry_id: 'entry-1',
          line_type: 'debe',
          subaccount_code: '628.0001',
          subaccount_desc: 'Suministros de energía eléctrica',
          amount: 202.73
        },
        {
          id: 'line-2',
          entry_id: 'entry-1',
          line_type: 'debe',
          subaccount_code: '472.0021',
          subaccount_desc: 'Hacienda Pública, IVA Soportado 21%',
          amount: 42.57
        },
        {
          id: 'line-3',
          entry_id: 'entry-1',
          line_type: 'haber',
          subaccount_code: '410.0055',
          subaccount_desc: 'Acreedores por prestaciones de servicios - Iberdrola',
          amount: 245.30
        }
      ]
    },
    {
      id: 'entry-2',
      document_id: 'doc-2',
      entry_date: '2026-06-14',
      entry_number: 2,
      reference: 'REC_5521',
      concept: 'Gasto de locomoción - Taxi Aeropuerto',
      is_balanced: true,
      created_at: new Date(Date.now() - 3600000 * 24).toISOString(),
      lines: [
        {
          id: 'line-4',
          entry_id: 'entry-2',
          line_type: 'debe',
          subaccount_code: '629.0042',
          subaccount_desc: 'Gastos de viaje - Taxi y transporte',
          amount: 35.00
        },
        {
          id: 'line-5',
          entry_id: 'entry-2',
          line_type: 'haber',
          subaccount_code: '570.0000',
          subaccount_desc: 'Caja, euros',
          amount: 35.00
        }
      ]
    }
  ],
  pgc_accounts: [
    { code: '628.0000', description: 'Suministros', is_operational: false },
    { code: '628.0001', description: 'Suministros de energía eléctrica', is_operational: true },
    { code: '472.0021', description: 'Hacienda Pública, IVA Soportado 21%', is_operational: true },
    { code: '410.0000', description: 'Acreedores por prestaciones de servicios', is_operational: false },
    { code: '410.0055', description: 'Acreedores por prestaciones de servicios - Iberdrola', is_operational: true },
    { code: '629.0000', description: 'Otros servicios (Gastos diversos)', is_operational: false },
    { code: '629.0042', description: 'Gastos de viaje - Taxi y transporte', is_operational: true },
    { code: '570.0000', description: 'Caja, euros', is_operational: true },
    { code: '400.0000', description: 'Proveedores (pesetas/euros)', is_operational: false },
    { code: '477.0021', description: 'Hacienda Pública, IVA Repercutido 21%', is_operational: true },
    { code: '700.0000', description: 'Ventas de mercaderías', is_operational: true }
  ]
};

// Ensure db file exists
const initDb = () => {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(defaultSchema, null, 2), 'utf-8');
  }
};

const readDb = (): MockSchema => {
  initDb();
  try {
    const data = fs.readFileSync(DB_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    return defaultSchema;
  }
};

const writeDb = (data: MockSchema) => {
  initDb();
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
};

export const mockDb = {
  getDocuments: () => {
    return readDb().documents.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  },
  
  addDocument: (name: string, storagePath: string, type: 'Factura' | 'Recibo' | 'Ticket' | 'Extracto' | 'Otro' = 'Factura') => {
    const db = readDb();
    const doc: MockDocument = {
      id: 'doc_' + Math.random().toString(36).substr(2, 9),
      name,
      storage_path: storagePath,
      status: 'pending',
      type,
      created_at: new Date().toISOString()
    };
    db.documents.push(doc);
    writeDb(db);
    return doc;
  },

  updateDocumentStatus: (id: string, status: 'pending' | 'processing' | 'completed' | 'error', iaDescription?: string) => {
    const db = readDb();
    const doc = db.documents.find(d => d.id === id);
    if (doc) {
      doc.status = status;
      if (iaDescription) doc.ia_description = iaDescription;
      writeDb(db);
    }
    return doc;
  },

  getEntries: () => {
    return readDb().entries;
  },

  getEntryByDocumentId: (docId: string) => {
    return readDb().entries.find(e => e.document_id === docId);
  },

  addEntry: (documentId: string, reference: string, concept: string, lines: Omit<MockEntryLine, 'id' | 'entry_id'>[]) => {
    const db = readDb();
    const entryId = 'entry_' + Math.random().toString(36).substr(2, 9);
    
    // Sum amounts to check if balanced
    const debeSum = lines.filter(l => l.line_type === 'debe').reduce((sum, l) => sum + l.amount, 0);
    const haberSum = lines.filter(l => l.line_type === 'haber').reduce((sum, l) => sum + l.amount, 0);
    const isBalanced = Math.abs(debeSum - haberSum) < 0.01;

    const entryLines: MockEntryLine[] = lines.map((l, index) => ({
      id: `line_${entryId}_${index}`,
      entry_id: entryId,
      ...l
    }));

    const newEntry: MockAccountingEntry = {
      id: entryId,
      document_id: documentId,
      entry_date: new Date().toISOString().split('T')[0],
      entry_number: db.entries.length + 1,
      reference,
      concept,
      is_balanced: isBalanced,
      lines: entryLines,
      created_at: new Date().toISOString()
    };

    db.entries.push(newEntry);
    writeDb(db);
    return newEntry;
  },

  getPgcAccounts: () => {
    return readDb().pgc_accounts;
  },

  setPgcAccounts: (accounts: MockPgcAccount[]) => {
    const db = readDb();
    db.pgc_accounts = accounts;
    writeDb(db);
  },

  addPgcAccount: (code: string, description: string, isOperational: boolean = true) => {
    const db = readDb();
    if (!db.pgc_accounts.some(a => a.code === code)) {
      db.pgc_accounts.push({ code, description, is_operational: isOperational });
      writeDb(db);
    }
  }
};

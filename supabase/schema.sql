-- Balance AI: Database Schema for Supabase

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 0. Create companies table
CREATE TABLE IF NOT EXISTS public.companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    cif TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 1. Create documents table
CREATE TABLE IF NOT EXISTS public.documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'error')),
    type TEXT NOT NULL DEFAULT 'Factura' CHECK (type IN ('Factura', 'Recibo', 'Ticket', 'Extracto', 'Otro')),
    ia_description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Create accounting_entries table
CREATE TABLE IF NOT EXISTS public.accounting_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES public.documents(id) ON DELETE CASCADE,
    entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
    entry_number SERIAL,
    reference TEXT,
    concept TEXT,
    is_balanced BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Create entry_lines table
CREATE TABLE IF NOT EXISTS public.entry_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_id UUID REFERENCES public.accounting_entries(id) ON DELETE CASCADE,
    line_type TEXT NOT NULL CHECK (line_type IN ('debe', 'haber')),
    subaccount_code TEXT NOT NULL,
    subaccount_desc TEXT NOT NULL,
    amount NUMERIC(15, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Create pgc_accounts (General Accounting Plan) table
CREATE TABLE IF NOT EXISTS public.pgc_accounts (
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
    code TEXT NOT NULL,
    description TEXT NOT NULL,
    is_operational BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    PRIMARY KEY (company_id, code)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_documents_company_id ON public.documents(company_id);
CREATE INDEX IF NOT EXISTS idx_entries_document_id ON public.accounting_entries(document_id);
CREATE INDEX IF NOT EXISTS idx_lines_entry_id ON public.entry_lines(entry_id);
CREATE INDEX IF NOT EXISTS idx_pgc_company_id ON public.pgc_accounts(company_id);

-- Enable RLS (Row Level Security) on all tables
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entry_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pgc_accounts ENABLE ROW LEVEL SECURITY;

-- Create Public Access Policies (for testing and MVP purposes)
CREATE POLICY "Allow public read companies" ON public.companies FOR SELECT USING (true);
CREATE POLICY "Allow public insert companies" ON public.companies FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update companies" ON public.companies FOR UPDATE USING (true);
CREATE POLICY "Allow public delete companies" ON public.companies FOR DELETE USING (true);

CREATE POLICY "Allow public read documents" ON public.documents FOR SELECT USING (true);
CREATE POLICY "Allow public insert documents" ON public.documents FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update documents" ON public.documents FOR UPDATE USING (true);
CREATE POLICY "Allow public delete documents" ON public.documents FOR DELETE USING (true);

CREATE POLICY "Allow public read entries" ON public.accounting_entries FOR SELECT USING (true);
CREATE POLICY "Allow public insert entries" ON public.accounting_entries FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update entries" ON public.accounting_entries FOR UPDATE USING (true);
CREATE POLICY "Allow public delete entries" ON public.accounting_entries FOR DELETE USING (true);

CREATE POLICY "Allow public read lines" ON public.entry_lines FOR SELECT USING (true);
CREATE POLICY "Allow public insert lines" ON public.entry_lines FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update lines" ON public.entry_lines FOR UPDATE USING (true);
CREATE POLICY "Allow public delete lines" ON public.entry_lines FOR DELETE USING (true);

CREATE POLICY "Allow public read pgc_accounts" ON public.pgc_accounts FOR SELECT USING (true);
CREATE POLICY "Allow public insert pgc_accounts" ON public.pgc_accounts FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update pgc_accounts" ON public.pgc_accounts FOR UPDATE USING (true);
CREATE POLICY "Allow public delete pgc_accounts" ON public.pgc_accounts FOR DELETE USING (true);

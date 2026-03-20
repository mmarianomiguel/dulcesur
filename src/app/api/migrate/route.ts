import { NextRequest, NextResponse } from 'next/server'
import pg from 'pg'

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-pull-secret')
  if (secret !== (process.env.PULL_SECRET || 'enexpro-pull-secret')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const ref = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace('https://', '').replace('.supabase.co', '')
  const client = new pg.Client({
    host: `db.${ref}.supabase.co`,
    port: 5432,
    user: 'postgres',
    password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  })

  try {
    await client.connect()
    await client.query('ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS codigo_cliente TEXT')
    await client.end()
    return NextResponse.json({ status: 'ok', message: 'codigo_cliente column added' })
  } catch (e: any) {
    try { await client.end() } catch {}
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

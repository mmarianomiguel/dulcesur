import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
// @ts-ignore
import pg from 'pg'

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-pull-secret')
  if (secret !== (process.env.PULL_SECRET || 'enexpro-pull-secret')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { db: { schema: 'public' } }
  )

  // Check if column exists by trying to select it
  const { error: checkErr } = await sb.from('clientes').select('codigo_cliente').limit(1)

  if (checkErr && checkErr.message.includes('does not exist')) {
    try {
      const ref = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace('https://', '').replace('.supabase.co', '')
      const client = new pg.Client({
        host: `db.${ref}.supabase.co`,
        port: 5432,
        user: 'postgres',
        password: process.env.SUPABASE_DB_PASSWORD,
        database: 'postgres',
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 10000,
      })
      await client.connect()
      await client.query('ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS codigo_cliente TEXT')
      await client.end()
      return NextResponse.json({ status: 'ok', message: 'Column created via pg' })
    } catch (pgErr: any) {
      return NextResponse.json({
        error: 'pg failed: ' + pgErr.message,
        hint: 'Run in Supabase SQL Editor: ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS codigo_cliente TEXT;'
      }, { status: 500 })
    }
  }

  if (checkErr) {
    return NextResponse.json({ error: checkErr.message }, { status: 500 })
  }

  return NextResponse.json({ status: 'ok', message: 'Column already exists' })
}

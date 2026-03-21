import { NextRequest, NextResponse } from 'next/server'
import { writeFileSync } from 'fs'

const SECRET = process.env.PULL_SECRET

export async function POST(req: NextRequest) {
  if (!SECRET) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  const secret = req.headers.get('x-pull-secret')
  if (secret !== SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { title, description, cardId } = await req.json()
  console.log(`[fix-bug] Bug recibido: ${title}`)

  // Escribir el bug a un archivo que bug-agent.sh lee
  const bug = { title, description, cardId, timestamp: Date.now() }
  writeFileSync('/tmp/pending-bug.json', JSON.stringify(bug))

  return NextResponse.json({ status: 'queued', title })
}

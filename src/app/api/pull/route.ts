import { exec } from 'child_process'
import { NextRequest, NextResponse } from 'next/server'

const SECRET = process.env.PULL_SECRET || 'enexpro-pull-secret'

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-pull-secret')

  if (secret !== SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return new Promise<NextResponse>((resolve) => {
    exec(
      'git -C /Users/santiago/Desktop/enexpro/cuenca pull origin main',
      (err, stdout, stderr) => {
        if (err) {
          resolve(NextResponse.json({ error: stderr }, { status: 500 }))
        } else {
          resolve(NextResponse.json({ ok: true, output: stdout.trim() }))
        }
      }
    )
  })
}

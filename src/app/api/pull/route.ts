import { execFile } from 'child_process'
import { NextRequest, NextResponse } from 'next/server'

const SECRET = process.env.PULL_SECRET

export async function POST(req: NextRequest) {
  if (!SECRET) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  const secret = req.headers.get('x-pull-secret')

  if (secret !== SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const repoPath = process.env.REPO_PATH || process.cwd()

  return new Promise<NextResponse>((resolve) => {
    execFile(
      'git',
      ['-C', repoPath, 'pull', 'origin', 'main'],
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

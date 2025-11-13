// Node 18+ / ESM

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join, dirname, relative, sep, basename, extname } from 'node:path'
import { existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

// ---- 入力の決定（npm run build:all --md=src/foo.md）
const inMdPath = process.env.npm_config_md || process.argv[2] || 'src/sample.md'

// ---- 出力の決定：個別名 + 固定名（current）
const outDir    = 'dist'
const assetsDir = 'dist/assets'
const baseName  = basename(inMdPath, extname(inMdPath))
const outMd     = join(outDir, `${baseName}.marp.md`)
const currentMd = join(outDir, 'current.marp.md')

// ---- 生成ディレクトリ
await mkdir(outDir, { recursive: true })
await mkdir(assetsDir, { recursive: true })

// ---- 使う Python 実行ファイルを決定（優先: $PYTHON > .venv/bin/python > .venv/Scripts/python.exe > python3）
const venvPyUnix = join(process.cwd(), '.venv', 'bin', 'python')
const venvPyWin  = join(process.cwd(), '.venv', 'Scripts', 'python.exe')
const PYTHON = process.env.PYTHON
  || (existsSync(venvPyUnix) ? venvPyUnix
  :  existsSync(venvPyWin)  ? venvPyWin
  :  'python3')

// ---- ユーティリティ
const toRel = (absPath) => relative(dirname(outMd), absPath).split(sep).join('/')
const parseOpts = (jsonLike) => {
  if (!jsonLike) return {}
  try { return JSON.parse(jsonLike.replace(/(\w+)\s*:/g, '"$1":')) } catch { return {} }
}

// ---- 入力読込
let md = await readFile(inMdPath, 'utf8')

// ---- フェンス検出
const RE_MERMAID  = /```mermaid\s*(\{[\s\S]*?\})?\s*\n([\s\S]*?)\n```/g
const RE_DIAGRAMS = /```(?:diagrams|python\s+diagrams)\s*(\{[\s\S]*?\})?\s*\n([\s\S]*?)\n```/g

// ---- Mermaid は Kroki（KROKI_URL 未設定なら https://kroki.io）
async function renderMermaid(body, opts) {
  const fmt  = (opts?.format || 'svg').toLowerCase()  // svg|png
  const hash = createHash('sha1').update('mmd'+body+fmt).digest('hex').slice(0,10)
  const outAbs = join(assetsDir, `mmd-${hash}.${fmt}`)

  const kroki = process.env.KROKI_URL || 'https://kroki.io'
  const res = await fetch(`${kroki}/mermaid/${fmt}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body
  })

  if (!res.ok) {
    const svgFallback = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="960" height="540" viewBox="0 0 960 540" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="white"/>
  <text x="50%" y="50%" text-anchor="middle" font-family="sans-serif" font-size="24" fill="#d00">
    Mermaid rendering failed (${res.status})
  </text>
</svg>`
    const fallbackPath = fmt === 'svg' ? outAbs : outAbs.replace(/\.png$/i, '.svg')
    await writeFile(fallbackPath, svgFallback, 'utf8')
    return toRel(fallbackPath)
  }

  if (fmt === 'svg') {
    await writeFile(outAbs, await res.text(), 'utf8')
  } else {
    const buf = Buffer.from(await res.arrayBuffer())
    await writeFile(outAbs, buf)
  }
  return toRel(outAbs)
}

// ---- Python Diagrams は PNG 既定（PDFで安定）
async function renderDiagrams(body, opts) {
  const fmt   = ((opts?.format || 'png') + '').toLowerCase()
  const title = opts?.title || 'diagram'
  const hash  = createHash('sha1').update('pydiag'+body+fmt+title).digest('hex').slice(0,10)
  const outBaseAbs = join(assetsDir, `diag-${hash}`)   // 拡張子なし
  const outAbs     = `${outBaseAbs}.${fmt}`

  await execFileAsync(PYTHON, [
    'scripts/diagrams_runner.py',
    '--title', title,
    '--format', fmt,
    '--outfile', outBaseAbs,
  ], { env: { ...process.env, DIAGRAMS_BODY: body }, stdio: 'inherit' })

  return toRel(outAbs)
}

// ---- プレースホルダ収集
const tasks = []
md = md.replace(RE_MERMAID, (m, o, b) => {
  const i = tasks.length
  tasks.push({ kind: 'mmd', opts: parseOpts(o), body: b, ph: `<!--__MMD_${i}__-->` })
  return tasks.at(-1).ph
})
md = md.replace(RE_DIAGRAMS, (m, o, b) => {
  const i = tasks.length
  tasks.push({ kind: 'pydiag', opts: parseOpts(o), body: b, ph: `<!--__PYD_${i}__-->` })
  return tasks.at(-1).ph
})

// ---- 実レンダ → 相対パス埋め込み
for (const t of tasks) {
  const relPath = t.kind === 'mmd'
    ? await renderMermaid(t.body, t.opts)
    : await renderDiagrams(t.body, t.opts)
  t.repl = `![](${relPath})`
}
for (const t of tasks) md = md.replace(t.ph, t.repl)

// ---- Frontmatter 無ければ付与
if (!/^---\n[\s\S]*?\n---/m.test(md)) {
  md = `---\nmarp: true\npaginate: true\n---\n\n${md}`
}

// ---- 書き出し（個別名 + 固定名）
await writeFile(outMd, md, 'utf8')
await writeFile(currentMd, md, 'utf8')

console.log(`✓ Preprocessed: ${outMd} (and dist/current.marp.md)`)

// Node 18+ / ESM
import { spawn } from "node:child_process"
import { mkdir, access } from "node:fs/promises"
import { basename, extname, join } from "node:path"
import { constants as fsconst } from "node:fs"

const run = (cmd, args = []) =>
  new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: "inherit", shell: false })
    p.on("error", reject)
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))))
  })

async function fileExists(p) {
  try { await access(p, fsconst.R_OK); return true } catch { return false }
}

// ---- 引数解析：env, --md=..., --md <val>, 最初の非フラグ の順で採用
function parseInputMd(argv) {
  const envVal = process.env.npm_config_md
  if (envVal) return envVal

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith("--md=")) return a.slice(5)
    if (a === "--md" && argv[i + 1] && !argv[i + 1].startsWith("--")) return argv[i + 1]
  }
  // 最初の非フラグを位置引数として許可
  const firstPos = argv.find(a => !a.startsWith("--"))
  return firstPos || null
}

// 入力決定（--md 優先、無ければ既定ファイルを自動検出）
let inMd = parseInputMd(process.argv.slice(2)) || null
if (!inMd) {
  if (await fileExists("src/sample.md")) inMd = "src/sample.md"
  else if (await fileExists("sample.md")) inMd = "sample.md"
  else {
    console.error("❌ No input markdown. Use --md=src/xxx.md or add src/sample.md")
    process.exit(1)
  }
}

const name   = basename(inMd, extname(inMd))
const outDir = "dist"
const outMd  = join(outDir, `${name}.marp.md`)
const curMd  = join(outDir, "current.marp.md")
const curHtml= join(outDir, "current.html")
const curPdf = join(outDir, "current.pdf")

await mkdir(outDir, { recursive: true })

console.log(`==> [1] preprocess: ${inMd} -> ${outMd} & ${curMd}`)
await run("node", ["scripts/preprocess.mjs", inMd, outMd, join(outDir,"assets")])

// フラグ処理（省略時は HTML+PDF）
const htmlOnly = process.argv.includes("--html-only")
const pdfOnly  = process.argv.includes("--pdf-only")
const doHTML = htmlOnly || (!htmlOnly && !pdfOnly)
const doPDF  = pdfOnly  || (!htmlOnly && !pdfOnly)

if (doHTML) {
  console.log(`==> [2] html: ${curMd} -> ${curHtml}`)
  await run("npx", ["--yes","@marp-team/marp-cli","--allow-local-files",curMd,"-o",curHtml])
}
if (doPDF) {
  console.log(`==> [3] pdf: ${curMd} -> ${curPdf}`)
  await run("npx", ["--yes","@marp-team/marp-cli","--allow-local-files","--pdf",curMd,"-o",curPdf])
}

console.log(`✅ Done: ${doHTML ? curHtml : ""}${doHTML && doPDF ? " & " : ""}${doPDF ? curPdf : ""}`)

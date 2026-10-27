// Armazenamento local da ponte: arquivos simples na pasta "dados".
// - linhas.json      → números conectados (sem QR, sem credenciais)
// - mensagens.jsonl  → uma mensagem por linha, com número sequencial (seq)
// - estado.json      → batimento da ponte (para saber se está ligada)
// As credenciais de cada número ficam em dados/sessoes/<id> e NUNCA saem do computador.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
export const DADOS = process.env.DADOS_DIR ? path.resolve(process.env.DADOS_DIR) : path.join(AQUI, 'dados')
export const SESSOES = path.join(DADOS, 'sessoes')
const ARQ_LINHAS = path.join(DADOS, 'linhas.json')
const ARQ_MSGS = path.join(DADOS, 'mensagens.jsonl')
const ARQ_ESTADO = path.join(DADOS, 'estado.json')

export function garantirPastas() {
  fs.mkdirSync(SESSOES, { recursive: true })
}

function lerJson(arq, padrao) {
  try { return JSON.parse(fs.readFileSync(arq, 'utf8')) } catch { return padrao }
}
function gravarJson(arq, obj) {
  const tmp = arq + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2))
  fs.renameSync(tmp, arq)
}

export const lerLinhas = () => lerJson(ARQ_LINHAS, [])
export const gravarLinhas = linhas => gravarJson(ARQ_LINHAS, linhas)
export const lerEstado = () => lerJson(ARQ_ESTADO, null)
export const gravarEstado = estado => gravarJson(ARQ_ESTADO, estado)

/** Lê todas as mensagens (o volume de um time de marketing cabe tranquilamente em memória). */
export function lerMensagens() {
  let txt = ''
  try { txt = fs.readFileSync(ARQ_MSGS, 'utf8') } catch { return [] }
  const out = []
  for (const linha of txt.split('\n')) {
    if (!linha.trim()) continue
    try { out.push(JSON.parse(linha)) } catch { /* linha corrompida: ignora */ }
  }
  return out
}

/** Gravador com deduplicação e número sequencial crescente. */
export function criarGravador() {
  const existentes = lerMensagens()
  let seq = existentes.reduce((m, x) => Math.max(m, x.seq || 0), 0)
  const vistos = new Set(existentes.map(x => x.linhaId + ':' + x.id))
  return {
    gravar(msg) {
      const chave = msg.linhaId + ':' + msg.id
      if (vistos.has(chave)) return null
      vistos.add(chave)
      const reg = { seq: ++seq, ...msg }
      fs.appendFileSync(ARQ_MSGS, JSON.stringify(reg) + '\n')
      return reg
    },
    ultimoSeq: () => seq,
  }
}

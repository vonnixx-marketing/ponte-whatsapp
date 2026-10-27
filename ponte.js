// Ponte WhatsApp → Central de Conversas MKT (SOMENTE LEITURA)
// Conecta cada número como "aparelho conectado" (igual ao WhatsApp Web) e copia as
// mensagens 1:1 enviadas e recebidas A PARTIR DA CONEXÃO. Nunca envia mensagens,
// nunca marca como lida e não aparece "online" — o celular continua funcionando normalmente.
//
// Modo computador: npm start  →  abra http://localhost:3777
// Modo online (Railway etc.): defina CHAVE_SECRETA e DADOS_DIR. O painel pede senha
// (usuário "admin" + CHAVE_SECRETA) e o conector do Claude responde em /mcp com
// o cabeçalho "Authorization: Bearer CHAVE_SECRETA".
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import makeWASocket, { useMultiFileAuthState, DisconnectReason, Browsers, fetchLatestBaileysVersion } from '@whiskeysockets/baileys'
import QRCode from 'qrcode'
import pino from 'pino'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { criarServidorMcp } from './ferramentas.js'
import { SESSOES, DADOS, garantirPastas, lerLinhas, gravarLinhas, gravarEstado, criarGravador } from './armazem.js'

const CHAVE = (process.env.CHAVE_SECRETA || '').trim()
const ONLINE = !!CHAVE
const PORTA = Number(process.env.PORT || process.env.PORTA || 3777)
if (ONLINE && CHAVE.length < 24) { console.error('CHAVE_SECRETA precisa ter pelo menos 24 caracteres.'); process.exit(1) }
const logger = pino({ level: process.env.LOG || 'warn' })

garantirPastas()
const gravador = criarGravador()
/** Estado em memória: id → { ...linha, qr, sock, erro } */
const linhas = new Map(lerLinhas().map(l => [l.id, { ...l, status: 'iniciando', qr: null }]))
let versaoWA = undefined

function salvarLinhas() {
  gravarLinhas([...linhas.values()].map(({ id, nome, telefone, nomePerfil, conectadoEm, ultimaMsgEm, status }) =>
    ({ id, nome, telefone, nomePerfil, conectadoEm, ultimaMsgEm, status })))
}
function batimento() {
  gravarEstado({
    atualizadoEm: Date.now(),
    ultimoSeq: gravador.ultimoSeq(),
    linhas: [...linhas.values()].map(({ id, nome, telefone, nomePerfil, status, conectadoEm, ultimaMsgEm }) =>
      ({ id, nome, telefone, nomePerfil, status, conectadoEm, ultimaMsgEm })),
  })
}
const soNumero = jid => String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '')

/* ---------- extração de texto ---------- */
function desembrulhar(msg) {
  let m = msg || {}
  for (let i = 0; i < 4; i++) {
    const dentro = m.ephemeralMessage?.message || m.viewOnceMessage?.message || m.viewOnceMessageV2?.message ||
      m.viewOnceMessageV2Extension?.message || m.documentWithCaptionMessage?.message
    if (!dentro) break
    m = dentro
  }
  return m
}
function extrairTexto(msg) {
  const m = desembrulhar(msg)
  if (m.conversation) return m.conversation
  if (m.extendedTextMessage?.text) return m.extendedTextMessage.text
  const leg = c => (c ? ' ' + c : '')
  if (m.imageMessage) return '[Imagem]' + leg(m.imageMessage.caption)
  if (m.videoMessage) return (m.videoMessage.gifPlayback ? '[GIF]' : '[Vídeo]') + leg(m.videoMessage.caption)
  if (m.audioMessage) return m.audioMessage.ptt ? '[Áudio de voz]' : '[Áudio]'
  if (m.documentMessage) return '[Documento] ' + (m.documentMessage.fileName || '') + leg(m.documentMessage.caption)
  if (m.stickerMessage) return '[Figurinha]'
  if (m.locationMessage || m.liveLocationMessage) return '[Localização]'
  if (m.contactMessage) return '[Contato] ' + (m.contactMessage.displayName || '')
  if (m.contactsArrayMessage) return '[Contatos]'
  if (m.pollCreationMessage || m.pollCreationMessageV3) return '[Enquete] ' + ((m.pollCreationMessage || m.pollCreationMessageV3).name || '')
  if (m.buttonsResponseMessage) return m.buttonsResponseMessage.selectedDisplayText || '[Resposta de botão]'
  if (m.listResponseMessage) return m.listResponseMessage.title || '[Resposta de lista]'
  return null // reações, confirmações, edições e mensagens de sistema são ignoradas
}

/* ---------- captura ---------- */
async function registrar(linha, sock, m) {
  const k = m.key || {}
  const jid = k.remoteJid || ''
  if (!jid || jid.endsWith('@g.us') || jid.endsWith('@broadcast') || jid.endsWith('@newsletter')) return
  const texto = extrairTexto(m.message)
  if (texto == null || !texto.trim()) return
  const ts = Number(m.messageTimestamp?.toNumber ? m.messageTimestamp.toNumber() : m.messageTimestamp) * 1000 || Date.now()
  if (linha.conectadoEm && ts < linha.conectadoEm - 60_000) return // só conversas a partir da conexão

  let telefone = ''
  if (jid.endsWith('@s.whatsapp.net')) telefone = soNumero(jid)
  else if (k.remoteJidAlt?.endsWith('@s.whatsapp.net')) telefone = soNumero(k.remoteJidAlt)
  else if (jid.endsWith('@lid')) {
    try { const pn = await sock.signalRepository?.lidMapping?.getPNForLID?.(jid); if (pn) telefone = soNumero(pn) } catch {}
  }
  if (telefone && telefone === linha.telefone) return // conversa consigo mesmo

  const reg = gravador.gravar({
    id: k.id,
    linhaId: linha.id,
    linhaNome: linha.nome,
    linhaTelefone: linha.telefone,
    contatoId: telefone || soNumero(jid) || jid,
    contatoTelefone: telefone,
    contatoNome: k.fromMe ? '' : (m.pushName || ''),
    direcao: k.fromMe ? 'out' : 'in',
    texto: texto.slice(0, 4000),
    em: ts,
  })
  if (reg) {
    linha.ultimaMsgEm = Date.now()
    console.log(`[${linha.nome}] ${reg.direcao === 'in' ? '←' : '→'} ${reg.contatoTelefone || reg.contatoId}: ${reg.texto.slice(0, 60)}`)
  }
}

/* ---------- conexão de cada número ---------- */
async function iniciar(id) {
  const linha = linhas.get(id)
  if (!linha) return
  if (!versaoWA) {
    try { versaoWA = (await fetchLatestBaileysVersion()).version } catch { /* usa a versão embutida */ }
  }
  const { state, saveCreds } = await useMultiFileAuthState(path.join(SESSOES, id))
  const sock = makeWASocket({
    ...(versaoWA ? { version: versaoWA } : {}),
    auth: state,
    logger,
    browser: Browsers.ubuntu('Central MKT'),
    markOnlineOnConnect: false,
    syncFullHistory: false, // o histórico antigo não é gravado: registrar() descarta mensagens anteriores à conexão
    generateHighQualityLinkPreview: false,
    getMessage: async () => undefined,
  })
  linha.sock = sock
  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async u => {
    if (linha.sock !== sock) return
    if (u.qr) {
      linha.status = 'aguardando_qr'
      linha.qr = await QRCode.toDataURL(u.qr, { margin: 1, width: 264 })
    }
    if (u.connection === 'open') {
      linha.status = 'conectado'
      linha.qr = null
      linha.erro = null
      linha.telefone = soNumero(sock.user?.id)
      linha.nomePerfil = sock.user?.name || linha.nomePerfil || ''
      if (!linha.conectadoEm) linha.conectadoEm = Date.now()
      salvarLinhas()
      console.log(`✔ ${linha.nome} conectado (${linha.telefone})`)
    }
    if (u.connection === 'close') {
      const codigo = u.lastDisconnect?.error?.output?.statusCode
      if (!linhas.has(id)) return
      if (codigo === DisconnectReason.loggedOut) {
        linha.status = 'desconectado'
        linha.erro = 'O aparelho foi desconectado pelo celular. Conecte de novo pelo QR.'
        linha.conectadoEm = null
        fs.rmSync(path.join(SESSOES, id), { recursive: true, force: true })
        salvarLinhas()
        console.log(`✖ ${linha.nome} desconectado pelo celular`)
      } else {
        linha.status = 'reconectando'
        const espera = codigo === DisconnectReason.restartRequired ? 500 : 5000
        setTimeout(() => { if (linhas.has(id) && linha.sock === sock) iniciar(id) }, espera)
      }
    }
  })

  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const m of messages || []) {
      try { await registrar(linha, sock, m) } catch (e) { logger.warn(e, 'falha ao registrar mensagem') }
    }
  })
}

async function novaLinha(nome) {
  const id = 'w' + crypto.randomBytes(5).toString('hex')
  linhas.set(id, { id, nome: nome.slice(0, 60), telefone: '', status: 'iniciando', qr: null })
  salvarLinhas()
  await iniciar(id)
}
async function reconectar(id) {
  const linha = linhas.get(id)
  if (!linha) return
  try { linha.sock?.end?.(undefined) } catch {}
  linha.sock = null
  linha.status = 'iniciando'
  await iniciar(id)
}
async function removerLinha(id) {
  const linha = linhas.get(id)
  if (!linha) return
  linhas.delete(id)
  try { await linha.sock?.logout() } catch {}
  try { linha.sock?.end?.(undefined) } catch {}
  fs.rmSync(path.join(SESSOES, id), { recursive: true, force: true })
  salvarLinhas()
}

/* ---------- painel local (http://localhost:3777) ---------- */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const ROTULO = { conectado: 'Conectado', aguardando_qr: 'Escaneie o QR', reconectando: 'Reconectando…', iniciando: 'Iniciando…', desconectado: 'Desconectado' }
function fmt(tel) { const d = String(tel || ''); return d.startsWith('55') && d.length >= 12 ? `+55 (${d.slice(2, 4)}) ${d.slice(4, -4)}-${d.slice(-4)}` : (d ? '+' + d : '—') }

function pagina() {
  const itens = [...linhas.values()].map(l => `
    <div class="linha ${l.status}">
      <div class="info"><b>${esc(l.nome)}</b><span>${esc(fmt(l.telefone))}</span>
        <span class="st">${esc(ROTULO[l.status] || l.status)}${l.ultimaMsgEm ? ' · última msg ' + new Date(l.ultimaMsgEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
        ${l.erro ? `<span class="erro">${esc(l.erro)}</span>` : ''}</div>
      ${l.qr ? `<div class="qr"><img src="${l.qr}" alt="QR code"><small>WhatsApp Business → ⋮ → Aparelhos conectados → Conectar aparelho</small></div>` : ''}
      <div class="acoes">
        ${l.status === 'desconectado' ? `<form method="post" action="/reconectar/${esc(l.id)}"><button>Gerar novo QR</button></form>` : ''}
        <form method="post" action="/remover/${esc(l.id)}" onsubmit="return confirm('Desconectar ${esc(l.nome)} da ponte?')"><button class="sec">Remover</button></form>
      </div>
    </div>`).join('') || '<p class="vazio">Nenhum número conectado ainda.</p>'
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ponte WhatsApp · Central MKT</title><meta http-equiv="refresh" content="4">
<style>body{font:15px system-ui,sans-serif;background:#eef1f3;color:#141b22;margin:0;padding:24px}main{max-width:760px;margin:auto;display:grid;gap:14px}
h1{font-size:22px;margin:0}p{margin:0;color:#5a6672}.linha{background:#fff;border-radius:10px;padding:14px 16px;display:flex;gap:16px;align-items:center;flex-wrap:wrap;border-left:4px solid #c9d1d8}
.linha.conectado{border-left-color:#1f7a4d}.linha.aguardando_qr{border-left-color:#c98500}.linha.desconectado{border-left-color:#b3261e}
.info{display:flex;flex-direction:column;gap:2px;flex:1;min-width:200px}.st{font-size:13px;color:#5a6672}.erro{font-size:13px;color:#b3261e}
.qr{display:flex;flex-direction:column;align-items:center;gap:4px}.qr img{width:220px;height:220px}.qr small{max-width:240px;text-align:center;color:#5a6672}
.acoes{display:flex;gap:8px}button{font:inherit;padding:8px 12px;border-radius:7px;border:1px solid #1c4e9e;background:#1c4e9e;color:#fff;cursor:pointer}
button.sec{background:#fff;color:#b3261e;border-color:#e3c2bf}form.add{display:flex;gap:8px;background:#fff;padding:14px 16px;border-radius:10px}
form.add input{flex:1;font:inherit;padding:8px 10px;border:1px solid #c9d1d8;border-radius:7px}.vazio{background:#fff;padding:16px;border-radius:10px}
.aviso{font-size:13px;background:#fbebcf;color:#7a4600;padding:10px 12px;border-radius:8px}</style></head><body><main>
<h1>Ponte WhatsApp · Central MKT</h1>
<p>Somente leitura: copia mensagens 1:1 a partir da conexão. Não envia, não marca como lida e não fica online. Mantenha esta janela aberta.</p>
<form class="add" method="post" action="/adicionar"><input name="nome" required placeholder="Nome da linha (ex.: Isadora Marques)"><button>Conectar número</button></form>
${itens}
<p class="aviso">Pasta de dados: ${esc(DADOS)} · ${gravador.ultimoSeq()} mensagens capturadas</p>
</main></body></html>`
}

function iguais(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b))
  return x.length === y.length && crypto.timingSafeEqual(x, y)
}
/** Painel: no modo online exige usuário "admin" e senha = CHAVE_SECRETA. */
function painelAutorizado(req) {
  if (!ONLINE) return true
  const h = req.headers.authorization || ''
  if (!h.startsWith('Basic ')) return false
  const [u, ...resto] = Buffer.from(h.slice(6), 'base64').toString().split(':')
  return u === 'admin' && iguais(resto.join(':'), CHAVE)
}
/** Conector: aceita "Authorization: Bearer CHAVE" ou "X-Api-Key: CHAVE". */
function mcpAutorizado(req) {
  if (!ONLINE) return true
  const h = req.headers.authorization || ''
  const k = h.startsWith('Bearer ') ? h.slice(7).trim() : String(req.headers['x-api-key'] || '')
  return !!k && iguais(k, CHAVE)
}
function lerJsonCorpo(req) {
  return new Promise((res, rej) => {
    let b = ''
    req.on('data', c => { b += c; if (b.length > 1e6) { rej(new Error('corpo grande demais')); req.destroy() } })
    req.on('end', () => { try { res(b ? JSON.parse(b) : undefined) } catch (e) { rej(e) } })
  })
}
async function atenderMcp(req, res) {
  if (!mcpAutorizado(req)) { res.writeHead(401, { 'Content-Type': 'application/json' }); return res.end('{"error":"chave inválida"}') }
  if (req.method !== 'POST') { res.writeHead(405, { Allow: 'POST' }); return res.end() }
  const corpo = await lerJsonCorpo(req)
  const servidor = criarServidorMcp()
  const transporte = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
  res.on('close', () => { transporte.close(); servidor.close() })
  await servidor.connect(transporte)
  await transporte.handleRequest(req, res, corpo)
}

function lerCorpo(req) {
  return new Promise(res => { let b = ''; req.on('data', c => { b += c; if (b.length > 1e4) req.destroy() }); req.on('end', () => res(new URLSearchParams(b))) })
}
const servidor = http.createServer(async (req, res) => {
  const voltar = () => { res.writeHead(303, { Location: '/' }); res.end() }
  try {
    const rota = req.url.split('?')[0]
    if (rota === '/saude') { res.writeHead(200); return res.end('ok') }
    if (rota === '/mcp') return await atenderMcp(req, res)
    if (!painelAutorizado(req)) {
      res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Ponte WhatsApp", charset="UTF-8"', 'Content-Type': 'text/plain; charset=utf-8' })
      return res.end('Acesso restrito. Usuário: admin · Senha: a CHAVE_SECRETA configurada.')
    }
    if (req.method === 'GET' && req.url === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(pagina()) }
    if (req.method === 'POST' && req.url === '/adicionar') { const f = await lerCorpo(req); const nome = (f.get('nome') || '').trim(); if (nome) await novaLinha(nome); return voltar() }
    const m = req.url.match(/^\/(remover|reconectar)\/(w[0-9a-f]+)$/)
    if (req.method === 'POST' && m) { await (m[1] === 'remover' ? removerLinha(m[2]) : reconectar(m[2])); return voltar() }
    res.writeHead(404); res.end('Não encontrado')
  } catch (e) { logger.error(e); if (!res.headersSent) { res.writeHead(500); res.end('Erro: ' + e.message) } }
})
servidor.listen(PORTA, process.env.HOST || (ONLINE ? '0.0.0.0' : '127.0.0.1'), () => console.log(ONLINE
  ? `Ponte online na porta ${PORTA}. Painel em / (usuário admin) e conector em /mcp.`
  : `Ponte ligada. Abra http://localhost:${PORTA} para conectar os números.`))

setInterval(batimento, 20_000)
batimento()
for (const id of linhas.keys()) iniciar(id).catch(e => logger.error(e))

for (const sinal of ['SIGINT', 'SIGTERM']) process.on(sinal, () => {
  linhas.forEach(l => { if (l.status === 'conectado') l.status = 'reconectando' })
  gravarEstado({ atualizadoEm: 0, ultimoSeq: gravador.ultimoSeq(), linhas: [] })
  salvarLinhas(); process.exit(0)
})

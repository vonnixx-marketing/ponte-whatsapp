// Conector local (MCP) da ponte WhatsApp para o Claude — SOMENTE LEITURA.
// O app Claude desktop inicia este arquivo; ele só lê a pasta "dados" gravada pela ponte.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { lerEstado, lerMensagens, lerLinhas } from './armazem.js'

const servidor = new McpServer({ name: 'whatsapp-bridge', version: '1.0.0' })
const json = obj => ({ content: [{ type: 'text', text: JSON.stringify(obj) }] })

servidor.registerTool('status_ponte', {
  title: 'Status da ponte WhatsApp',
  description: 'Mostra se a ponte está ligada, quais números estão conectados e o último número sequencial de mensagem.',
  inputSchema: {},
  annotations: { readOnlyHint: true },
}, async () => {
  const estado = lerEstado()
  const online = !!estado && Date.now() - (estado.atualizadoEm || 0) < 60_000
  return json({
    online,
    atualizadoEm: estado?.atualizadoEm || null,
    ultimoSeq: estado?.ultimoSeq ?? 0,
    linhas: (online ? estado.linhas : lerLinhas()).map(l => ({ ...l, status: online ? l.status : 'ponte_desligada' })),
  })
})

servidor.registerTool('listar_mensagens', {
  title: 'Listar mensagens capturadas',
  description: 'Lista as mensagens 1:1 capturadas pela ponte com número sequencial maior que apos_seq, em ordem. Use next_seq como próximo apos_seq.',
  inputSchema: {
    apos_seq: z.number().int().min(0).default(0).describe('Retorna mensagens com seq maior que este valor'),
    limite: z.number().int().min(1).max(500).default(300).describe('Máximo de mensagens por chamada'),
  },
  annotations: { readOnlyHint: true },
}, async ({ apos_seq = 0, limite = 300 }) => {
  const todas = lerMensagens().filter(m => m.seq > apos_seq).sort((a, b) => a.seq - b.seq)
  const lote = todas.slice(0, limite)
  return json({
    mensagens: lote,
    next_seq: lote.length ? lote[lote.length - 1].seq : apos_seq,
    tem_mais: todas.length > lote.length,
  })
})

await servidor.connect(new StdioServerTransport())

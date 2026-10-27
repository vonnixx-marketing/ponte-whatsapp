// Conector LOCAL (modo computador): o app Claude desktop inicia este arquivo.
// No modo online ele não é usado — a própria ponte responde em /mcp.
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { criarServidorMcp } from './ferramentas.js'

await criarServidorMcp().connect(new StdioServerTransport())

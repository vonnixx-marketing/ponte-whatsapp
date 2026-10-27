# Ponte WhatsApp · Central de Conversas MKT

Captura automática, **somente leitura**, das conversas 1:1 das linhas do time de marketing para o quadro **Central de Conversas MKT** no Claude.

```
Celular (WhatsApp/WhatsApp Business)
   └─ "Aparelho conectado" (QR code)
        └─ PONTE  (este programa, roda no computador da empresa)  → pasta dados/
             └─ CONECTOR LOCAL (mcp.js, iniciado pelo app Claude desktop)
                  └─ QUADRO Central de Conversas MKT (cria cards e mensagens sozinho)
```

## O que a ponte faz e não faz

| Faz | Não faz |
|---|---|
| Copia mensagens enviadas e recebidas em conversas individuais, **a partir do momento da conexão** | Não envia mensagens |
| Registra texto e o tipo de anexo ([Imagem], [Áudio], [Documento]…) | Não baixa fotos, áudios ou arquivos |
| Funciona com o celular ligado normalmente | Não marca mensagens como lidas e não deixa o número "online" |
| Guarda tudo só neste computador até o quadro sincronizar | Não captura grupos, status nem histórico anterior à conexão |

## Requisitos

- Um computador da empresa (Windows ou Mac) que fique **ligado em horário comercial**.
- **Node.js 20 ou superior** — baixe a versão LTS em https://nodejs.org
- **App Claude desktop** instalado nesse computador, com a conta dona do quadro.
- Os 5 celulares em mãos para escanear o QR uma vez.

## Instalação (uma vez, ~15 min)

1. Descompacte esta pasta em um local fixo, por exemplo `C:\ponte-whatsapp` ou `~/ponte-whatsapp`.
2. **Windows:** dê dois cliques em `instalar.bat`.
   **Mac:** abra o Terminal na pasta e rode `npm install`.
3. **Windows:** dê dois cliques em `iniciar-ponte.bat`. **Mac:** dois cliques em `iniciar-ponte.command` (ou `npm start`).
   Deixe a janela aberta.
4. Abra **http://localhost:3777** no navegador.
5. Para cada pessoa: digite o nome (ex.: *Isadora Marques*) → **Conectar número** → no celular dela abra o WhatsApp → **⋮ / Configurações → Aparelhos conectados → Conectar aparelho** → escaneie o QR. Quando aparecer **Conectado**, passe para a próxima.

## Ligar o conector ao Claude (uma vez)

1. No app Claude desktop: **Configurações → Desenvolvedor → Editar configuração** (abre o arquivo `claude_desktop_config.json`).
2. Inclua o bloco abaixo, trocando o caminho pelo da sua pasta:

**Windows**
```json
{
  "mcpServers": {
    "whatsapp-bridge": {
      "command": "node",
      "args": ["C:\\ponte-whatsapp\\mcp.js"]
    }
  }
}
```

**Mac**
```json
{
  "mcpServers": {
    "whatsapp-bridge": {
      "command": "node",
      "args": ["/Users/SEU_USUARIO/ponte-whatsapp/mcp.js"]
    }
  }
}
```

> O nome `whatsapp-bridge` precisa ser exatamente este — é o nome que o quadro procura.
> Se já existir um bloco `mcpServers`, adicione só a entrada `"whatsapp-bridge": {...}` dentro dele.

3. Feche e abra o app Claude desktop.
4. Abra o quadro **Central de Conversas MKT** pelo app Claude desktop **nesse mesmo computador**. Na primeira vez, autorize o acesso à ponte. O topo do quadro passa a mostrar **"Captura automática ativa · 5/5 números conectados"**.

## Rotina

- Deixe **a ponte** e **o quadro aberto no app Claude desktop** rodando nesse computador durante o expediente. O quadro verifica mensagens novas a cada 30 segundos.
- Se o computador ficar desligado, a ponte captura ao religar o que o WhatsApp ainda entregar ao aparelho conectado, e o quadro grava tudo assim que for aberto de novo.
- O restante do time vê os cards atualizados em qualquer navegador ou celular — não precisa instalar nada.
- Contato que manda mensagem nova depois de estar em **Concluído** volta sozinho para **Novas mensagens**.

## Riscos e boas práticas

- **Não é a API oficial.** O WhatsApp pode desconectar ou restringir números que usam programas não oficiais. A ponte reduz o risco (não envia, não fica online, não lê grupos), mas não elimina. Use **chips corporativos**.
- **Aparelho conectado expira.** Se o celular ficar ~14 dias sem internet, o WhatsApp desconecta os aparelhos conectados. O painel mostra **Desconectado** → clique em **Gerar novo QR**.
- **LGPD e transparência.** Avise formalmente as pessoas cujas linhas são monitoradas e restrinja o acesso ao quadro a quem precisa.
- **Proteja a pasta `dados/`.** Ela contém as credenciais de conexão e as mensagens. Não compartilhe nem coloque em pasta sincronizada pública.
- **Atualizações.** Se o WhatsApp mudar o protocolo e a conexão parar, atualize a biblioteca: `npm install @whiskeysockets/baileys@latest` e reinicie a ponte.

## Problemas comuns

| Sintoma | Solução |
|---|---|
| Quadro mostra "abra este quadro no app Claude desktop" | Você abriu no navegador ou em outro computador. Abra pelo app desktop no computador da ponte. |
| Quadro mostra "Ponte desligada" | A janela da ponte foi fechada. Rode `iniciar-ponte` de novo. |
| QR não aparece | Espere 10 s e recarregue http://localhost:3777. Verifique a internet do computador. |
| Linha fica "Reconectando…" por muito tempo | Feche a ponte, abra de novo. Persistindo, remova a linha e conecte de novo. |
| Contato aparece como "Número oculto pelo WhatsApp" | O WhatsApp escondeu o número desse contato (privacidade). Edite o card e preencha o nome manualmente. |

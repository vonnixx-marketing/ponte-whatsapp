# Ponte WhatsApp · Central de Conversas MKT

Captura automática, **somente leitura**, das conversas 1:1 das linhas do time de marketing para o quadro **Central de Conversas MKT** no Claude.

```
Celulares (WhatsApp)  →  PONTE na nuvem (Oracle grátis, ligada 24h)  →  conector "Ponte WhatsApp MKT" no claude.ai  →  QUADRO
```

## O que a ponte faz e não faz

| Faz | Não faz |
|---|---|
| Copia mensagens enviadas e recebidas em conversas individuais, **a partir da conexão** | Não envia mensagens |
| Registra texto e o tipo de anexo ([Imagem], [Áudio], [Documento]…) | Não baixa fotos, áudios ou arquivos |
| Funciona com o celular ligado normalmente | Não marca como lida e não deixa o número "online" |
| Protege o painel com senha e o conector com chave | Não captura grupos, status nem histórico anterior |

---

## Instalação gratuita e 100% online (≈45 min, sem TI)

Custo: **R$ 0**. Você vai precisar de um e-mail, um cartão de crédito só para a verificação do Oracle (não é cobrado no plano gratuito) e os 5 celulares.

### Etapa 1 · Publicar o código no GitHub (grátis, 10 min)

1. Crie uma conta em **github.com**.
2. **+ → New repository** → nome `ponte-whatsapp` → marque **Public** → **Create repository**.
   (Público porque o servidor baixa o código sozinho. O código não tem senhas nem mensagens: a chave fica só no servidor.)
3. Clique em **uploading an existing file**, arraste **todos os arquivos de dentro da pasta** descompactada e clique **Commit changes**.

### Etapa 2 · Criar o servidor gratuito no Oracle Cloud (20 min)

1. Crie a conta em **oracle.com/cloud/free** (escolha a região **Brazil East (São Paulo)**). O cartão é só verificação.
2. Abra o arquivo **oracle-cloud-init.sh** (está no zip) em um editor de texto e troque as duas linhas do topo:
   - `GITHUB_USUARIO="..."` → seu usuário do GitHub
   - `CHAVE_SECRETA="..."` → a chave secreta que o Claude te passou
3. No painel do Oracle: **☰ → Compute → Instances → Create instance**.
   - **Image:** clique *Change image* → **Ubuntu** → **Canonical Ubuntu 24.04**.
   - **Shape:** clique *Change shape* → **Specialty and previous generation** → **VM.Standard.E2.1.Micro** (tem o selo *Always Free-eligible*).
   - **Networking:** deixe o padrão, com **Assign a public IPv4 address** marcado.
   - **SSH keys:** escolha *No SSH keys* (não vamos precisar).
   - Clique **Show advanced options → Management → Paste cloud-init script** e **cole o conteúdo inteiro** do `oracle-cloud-init.sh` editado.
   - Clique **Create**.
4. Libere o acesso pela internet: na página da instância, clique no nome da **Subnet** → **Security Lists** → **Default Security List** → **Add Ingress Rules**:
   - Source CIDR: `0.0.0.0/0` · IP Protocol: **TCP** · Destination Port Range: `80,443` → **Add Ingress Rules**.
5. Copie o **Public IP address** da instância (ex.: `150.230.10.20`). Seu endereço é o IP **trocando pontos por traços** + `.sslip.io`:
   `https://150-230-10-20.sslip.io`
6. Espere **10 minutos** (o servidor instala tudo sozinho) e abra `https://SEU-ENDERECO/saude`. Deve aparecer **ok**.

### Etapa 3 · Conectar os 5 números (2 min por pessoa)

1. Abra `https://SEU-ENDERECO/` → usuário **admin** · senha: a **CHAVE_SECRETA**.
2. Para cada pessoa: digite o nome → **Conectar número** → no celular dela **WhatsApp → Aparelhos conectados → Conectar aparelho** → escaneie o QR.

### Etapa 4 · Ligar ao Claude (5 min)

1. claude.ai → **Configurações → Conectores → + Adicionar → Adicionar conector personalizado**.
2. **Nome:** `Ponte WhatsApp MKT` (exatamente assim) · **URL:** `https://SEU-ENDERECO/mcp` · **Autenticação:** Sem login ·
   **Cabeçalho (Request header):** nome `Authorization`, valor `Bearer ` + a CHAVE_SECRETA.
3. Abra o quadro e **permita** o acesso ao conector. O topo mostra **"Captura automática ativa"**.

### Etapa 5 · Testar

Mande uma mensagem para o número de uma das 5 pessoas. Em ~30 s o card aparece em **Novas mensagens**.

### Atualizar a ponte no futuro

Substitua os arquivos no GitHub e, no Oracle, **reinicie a instância** (Instance → *Reboot*): o script não roda de novo sozinho, então peça ao Claude o comando de atualização quando precisar.

### Alternativa paga e mais simples: Railway (~US$ 5/mês)

Em vez da Etapa 2: railway.com → Login with GitHub → plano Hobby → **New Project → Deploy from GitHub repo** → variáveis `CHAVE_SECRETA` e `DADOS_DIR=/data` → **Volume** em `/data` → **Settings → Networking → Generate Domain**. O resto é igual.

---

## Como funciona no dia a dia

- A ponte fica ligada 24h na nuvem e **guarda tudo**, mesmo com ninguém olhando.
- **Quando você abre o quadro** (de qualquer lugar), ele puxa tudo o que chegou desde a última vez e continua atualizando a cada 30 s enquanto estiver aberto.
- O restante do time vê os cards atualizados pelo link do quadro. Só a sua conta precisa do conector.
- Contato que manda mensagem nova depois de estar em **Concluído** volta sozinho para **Novas mensagens**.

## Riscos e boas práticas

- **Não é a API oficial.** O WhatsApp pode desconectar ou restringir números que usam aparelhos conectados não oficiais — e servidores em nuvem chamam mais atenção que um computador comum. A ponte reduz o risco (não envia, não fica online, ignora grupos), mas não elimina. Use **chips corporativos**.
- **Aparelho conectado expira** se o celular ficar ~14 dias sem internet. O painel mostra **Desconectado** → **Gerar novo QR**.
- **Guarde a CHAVE_SECRETA** como uma senha. Quem tiver a chave e o endereço lê as mensagens. Para trocar: mude a variável no Railway e atualize o cabeçalho no conector do claude.ai.
- **LGPD.** Avise formalmente as pessoas cujas linhas são monitoradas e restrinja o acesso ao quadro.
- **Atualizações.** Se o WhatsApp mudar algo e a conexão parar, peça ao Claude uma versão atualizada e substitua os arquivos no GitHub — o Railway publica sozinho.

## Problemas comuns

| Sintoma | Solução |
|---|---|
| `/saude` não abre (Oracle) | Espere 15 min. Confira a regra de entrada 80,443 (Etapa 2, item 4) e se o IP foi digitado com traços. |
| `/saude` não abre (Railway) | Aba **Deployments** → veja o log e mande um print ao Claude. |
| Painel pede senha e não aceita | Usuário é `admin` (minúsculo). Senha = CHAVE_SECRETA exatamente, sem espaços. |
| Quadro: "conecte o conector Ponte WhatsApp MKT" | Nome do conector diferente ou não adicionado. Confira o nome exato na Etapa 4. |
| Quadro: "Reconecte o conector" | Configurações → Conectores → Ponte WhatsApp MKT → reconectar. |
| Quadro: "Falha ao ler a ponte" | Cabeçalho `Authorization` errado (falta `Bearer `) ou ponte fora do ar. |
| Números somem após reiniciar (Railway) | Volume `/data` não criado ou `DADOS_DIR` diferente de `/data`. |
| Oracle avisou que a instância está "ociosa" | O Oracle pode recuperar máquinas gratuitas com uso muito baixo. Para evitar, faça o upgrade da conta para **Pay As You Go**: continua grátis dentro dos limites Always Free. |

---

## Alternativa: rodar em um computador (sem nuvem)

`npm install` → `npm start` → abra http://localhost:3777. No app Claude desktop, Configurações → Desenvolvedor → Editar configuração:

```json
{ "mcpServers": { "whatsapp-bridge": { "command": "node", "args": ["C:\\ponte-whatsapp\\mcp.js"] } } }
```

O quadro usa o conector online quando existe e cai para este modo local automaticamente.

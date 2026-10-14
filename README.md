# MimicDice VTT

![Versão](https://img.shields.io/badge/vers%C3%A3o-1.1.0-blue) ![Status](https://img.shields.io/badge/status-est%C3%A1vel-brightgreen) ![Plataforma](https://img.shields.io/badge/plataforma-Windows-0078D6) ![Licença](https://img.shields.io/badge/licen%C3%A7a-MIT-green)

> **Versão atual: 1.1.0.** Veja o que mudou em [PATCHNOTES.md](PATCHNOTES.md).

Mesa virtual (VTT) para jogar RPG com os amigos. Você hospeda a mesa no seu próprio computador, envia o link de convite e os jogadores entram pelo navegador, sem precisar de assinatura nem de servidor na nuvem.

O MimicDice inclui uma camada de compatibilidade com a API do Foundry VTT, então dá para instalar sistemas e módulos feitos para ele.

## Funcionalidades

- **App desktop para o mestre (Windows):** instalador em português que deixa escolher a pasta e se quer o atalho na Área de Trabalho; inicia o servidor local, mostra os links de convite da rede (Wi-Fi/LAN e Radmin VPN), ocultos até você clicar no olho, e libera a porta no Firewall do Windows com um clique.
- **Sessão da mesa:** o mestre inicia e fecha a sessão; fechada, os jogadores ficam congelados na última visão (ficha e dados continuam). Fecha sozinha após 1 hora parada.
- **Controlar boneco:** o mestre vê e joga exatamente como um personagem, e escolhe quais jogadores controlam cada boneco ou NPC.
- **Jogadores pelo navegador:** quem foi convidado só precisa abrir o link, sem instalar nada.
- **Mundos:** crie e alterne entre campanhas, cada uma com seus próprios dados.
- **Sistemas e módulos:** instale pelo link do manifesto, com download e extração em ambiente controlado.
- **Mesa:** canvas com mapas e tokens (PixiJS), rolagem de dados, fichas, chat e sidebar de documentos.
- **Movimento com caminho:** segure Ctrl ao arrastar um token para ver a distância e confirmar antes de andar. Todos veem o token andando em tempo real, e WASD move um quadrado por vez.
- **Desenhos:** jogadores desenham numa camada acima do mapa; o mestre apaga e trava qualquer desenho.
- **Tutorial:** botão ? no topo e Shift + clique em qualquer opção para ver a ajuda dela.
- **Portas com chave:** portas animadas, que podem ser trancadas ou exigir um item carregado pelo personagem.
- **Ferramentas do mestre:** modo jogo e modo edição, pausar a cena, objetos travados no lugar e "Mostrar minha visão" (mesma cena, posição e zoom para todos).
- **Puxar jogadores:** botão direito num ponto vazio do mapa para trazer o token de todos os jogadores, ou de um só, até ali.
- **Limite de visão:** o mestre define até quantos metros os jogadores enxergam a partir dos seus tokens.
- **Tradução automática:** textos em inglês de sistemas e módulos aparecem em português, sem internet.
- **Pings no mapa:** aperte P para destacar um ponto para todos; o mestre, com Shift + P, leva a câmera de todos até lá.
- **Rastreador de iniciativa:** aba Combate com rodada, de quem é a vez (também num aviso no topo, para todos) e quanto o personagem da vez já andou. O mestre reordena arrastando ou com as setas e manda alguém para o fim da fila (ficou tonto, atrasou a ação).
- **Painel de status:** janela arrastável com vida, PE e sanidade. O mestre escolhe quem aparece (jogadores, combate, cena ou um por um); cada jogador vê só os próprios personagens.
- **Controle do mestre:** aba nas Configurações para escolher quais barras existem (e com quais nomes da ficha), o que os jogadores veem e quem pode arrastar tokens de outros.
- **Barra lateral recolhível:** esconda chat, combate e atores para ver o mapa inteiro.
- **Chat com sussurros:** mensagens públicas ou privadas para um jogador, com o mestre vendo todas as conversas, além de rolagens secretas.
- **Configurações e atalhos:** preferências por usuário e teclas trocáveis, salvas na conta.
- **Salas no launcher:** crie, abra, entre e exclua suas mesas direto pelo app desktop.
- **Usuários e permissões:** senha do mestre por sala (opcional), "lembrar minha senha", banimento de jogadores, papéis por jogador e presença em tempo real via Socket.IO.

## Segurança

- Senhas com hash Argon2 e sessões com expiração configurável.
- "Lembrar minha senha" sem guardar a senha: token aleatório em cookie httpOnly, apenas o hash no disco, rotacionado a cada uso.
- Rate limiting no login, nos uploads, nas instalações de pacotes e nos eventos de socket.
- Validação de todas as entradas com Zod, sanitização de HTML e cabeçalhos de segurança com Helmet.
- Extração de ZIP protegida contra path traversal, com tipos de arquivo de upload restritos.
- Banimento por nome e por impressão HMAC do endereço (nunca o endereço em texto); o PC que hospeda nunca é banido.
- Sessão fechada, mapa travado e pausa são aplicados no servidor, não só na tela.
- O app desktop isola o renderer e restringe as permissões do Electron e os canais IPC.

## Estrutura do projeto

Monorepo com npm workspaces:

| Pasta | Conteúdo |
| --- | --- |
| `apps/server` | Servidor HTTP + Socket.IO (Express, LevelDB) |
| `apps/client` | Interface web da mesa (Vite) |
| `apps/desktop` | App Electron que hospeda o servidor e o launcher |
| `packages/api` | Runtime da mesa e camada de compatibilidade com a API do Foundry |
| `packages/common` | Lógica compartilhada entre cliente e servidor |
| `packages/protocol` | Contratos e schemas de comunicação (Zod) |
| `scripts` | Ferramentas de desenvolvimento |

## Como rodar

Requer [Node.js](https://nodejs.org/) 24 ou superior.

```bash
npm install
```

### Desenvolvimento

Em dois terminais:

```bash
npm run dev:server   # servidor em http://localhost:30000
npm run dev:client   # cliente com hot reload em http://localhost:5173
```

### Produção (navegador)

```bash
npm run build
npm start
```

Acesse `http://localhost:30000`.

### App desktop

```bash
npm run build                          # compila o cliente
npm run start -w @tabbletop/desktop    # abre o app em modo de desenvolvimento
npm run package -w @tabbletop/desktop  # gera o instalador em apps/desktop/release
```

### Testes e checagem de tipos

```bash
npm test
npm run typecheck
```

## Configuração

O servidor lê estas variáveis de ambiente (todas opcionais):

| Variável | Padrão | Descrição |
| --- | --- | --- |
| `TABBLETOP_PORT` | `30000` | Porta do servidor |
| `TABBLETOP_HOST` | `0.0.0.0` | Interface de rede |
| `TABBLETOP_DATA_PATH` | `./data` | Pasta de mundos, sistemas, módulos e configurações |
| `TABBLETOP_CLIENT_DIST` | `./apps/client/dist` | Build do cliente servido pelo servidor |
| `TABBLETOP_SESSION_HOURS` | `12` | Duração da sessão de login (1 a 168 horas) |
| `TABBLETOP_LOG_LEVEL` | — | Nível de log do servidor |
| `TABBLETOP_LAUNCHER_TOKEN` | — | Chave interna do launcher (o app desktop gera uma aleatória a cada execução; não defina manualmente) |

## Jogando com amigos fora da sua rede

O servidor roda no seu computador, então os jogadores precisam alcançá-lo pela rede. As opções mais simples são:

- **Mesma rede (Wi-Fi/LAN):** use o link de convite mostrado no launcher.
- **Radmin VPN** (ou similar): todos entram na mesma rede virtual e usam o link do Radmin mostrado no launcher.
- **Redirecionamento de porta** no roteador para a porta `30000`.

Se o Windows bloquear a conexão, use o botão **Liberar porta no firewall** no launcher.

## Licença

Distribuído sob a licença [MIT](LICENSE).

Foundry Virtual Tabletop é marca da Foundry Gaming LLC. O MimicDice VTT é um projeto independente, sem afiliação nem endosso da Foundry Gaming.

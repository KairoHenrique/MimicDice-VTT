# Notas de versão

## 0.2.0

### Pings no mapa

- **Pingar:** aperte **P** com o mouse sobre o mapa para destacar aquele ponto para todos, com o nome e a cor de quem pingou.
- **Pingar e levar todos (mestre):** com **Shift + P**, a câmera de todos os jogadores vai até o ponto, inclusive de quem estava em outra cena.
- A tecla pode ser trocada em Configurações > Atalhos.

### Rastreador de iniciativa

- Nova aba **Combate** na barra lateral.
- O mestre seleciona os tokens e clica em "Criar combate com os selecionados", ou usa "Entrar em combate" no botão direito do token.
- **Só o mestre define a iniciativa:** ele digita o número de cada um e a lista se ordena sozinha. Os jogadores só veem a ordem.
- Botões para iniciar o combate, avançar e voltar turnos e rodadas, limpar as iniciativas e encerrar o combate.
- O mestre pode esconder um combatente dos jogadores ou marcá-lo como derrotado.
- Quando chega a sua vez, aparece o aviso "É o seu turno" e a câmera vai até o seu token.

### Chat e sussurros

- **Mensagens de texto:** o que não for rolagem vira mensagem normal no chat. Rolagens continuam funcionando com `/r 1d20` ou só `1d20`.
- **Escolher para quem enviar:** Todos, Só o mestre ou Privado para um jogador específico.
- **Comando de sussurro:** `/w Nome mensagem` (também aceita `/w [Ana, Bruno] mensagem`, `/w mestre ...` e `/w jogadores ...`).
- **O mestre vê todas as conversas privadas**, inclusive as que os jogadores trocam entre si.
- **Rolagens secretas do mestre:** os modos "Só o mestre", "Às cegas" e "Só eu" continuam disponíveis no seletor de rolagem.

### Segurança

- Pings validados com Zod (cena existente e coordenadas limitadas) e com limite de frequência por jogador. Só o mestre pode levar a câmera de todos.
- Mensagens privadas só são entregues aos destinatários, ao autor e aos mestres. O texto é escapado no navegador e o HTML é sanitizado no servidor.
- Jogadores não conseguem alterar a iniciativa, entrar ou sair do combate, nem avançar turnos: essas regras são validadas no servidor.

## 0.1.1

### Mapa e movimento

- **Caminho do movimento:** segure **Ctrl** enquanto arrasta um token para ver o caminho e a distância (em quadrados e metros) e só andar depois de confirmar. Sem Ctrl, o token anda direto. Em Configurações dá para escolher "só com a tecla", "sempre" ou "nunca".
- **Animação de caminhada:** o token desliza até o destino em vez de teleportar.
- **Paredes não somem** ao trocar para a camada de Tokens: o mestre continua vendo as paredes (mais apagadas), e os jogadores veem as portas.
- **Travar posição:** clique com o botão direito em um token ou tile e use "Travar posição". Os jogadores não conseguem mais arrastar o objeto.
- **Modo jogo e modo edição (mestre):** no modo jogo ficam só tokens, desenhos e notas, para não arrastar paredes sem querer. O modo edição libera paredes, luzes e tiles.

### Portas e chaves

- **Animação de porta:** a porta gira ao abrir e fechar.
- **Porta secreta removida** das ferramentas.
- **Portas com chave:** no botão direito da porta, use "Exigir item para abrir". Só abre quem tiver o item (por exemplo, "Chave de ferro") em um personagem seu. A regra também é validada no servidor.
- **Trancar e destrancar** portas pelo botão direito.
- **Carregar itens na ficha:** campo rápido para adicionar um item ao personagem só pelo nome.

### Mestre

- **Mostrar minha visão:** leva todos para a sua cena, com a mesma posição e o mesmo zoom da sua tela.
- **Puxar todos:** leva todos os jogadores para a cena que você está vendo.
- **Salas no launcher:** criar e abrir mesas (RPGs) agora fica no app desktop, protegido por uma chave interna aleatória a cada execução.
- **Senha do mestre:** sem tamanho mínimo, com botão de olho para mostrar ou esconder o que foi digitado.
- **Lembrar minha senha neste computador:** entra sem digitar por 30 dias. A senha não é guardada: o navegador guarda uma chave aleatória (cookie httpOnly), o servidor guarda só o hash dela, e a chave é trocada a cada uso. O link "Esquecer" apaga essa memória.

### Interface

- **Configurações** (botão de engrenagem): aba **Geral** com as preferências e aba **Atalhos** para trocar as teclas, inclusive as dos módulos. Os atalhos ficam salvos na conta e acompanham o jogador em qualquer navegador.
- **Barra do topo recolhível:** a seta no canto esconde os botões, e a escolha fica salva.
- **A barra do topo não sobrepõe mais** a barra de cenas nem os controles.
- **Jogadores só veem o que podem usar:** a aba Cenas e as ferramentas sem permissão somem. As abas Itens e Diário só aparecem quando há algo compartilhado ou permissão para criar.

### Segurança

- Rotas do launcher aceitam apenas chamadas locais com a chave interna (comparação em tempo constante).
- Abrir porta valida a permissão e a chave no servidor, e objetos travados não podem ser movidos por jogadores.
- O pedido de "mostrar minha visão" é validado com Zod (coordenadas e zoom limitados).

## 0.1.0

- Primeira versão pública: app desktop para o mestre, jogadores pelo navegador, mundos, sistemas e módulos compatíveis com o Foundry VTT, mapas, tokens, fichas, dados e chat.

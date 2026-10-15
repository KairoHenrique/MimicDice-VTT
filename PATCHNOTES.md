# Notas de versão

## 1.4.6

- **Ficha de jogador definitiva:** PV e PE com as fórmulas da mesa (o PE arredonda para baixo) e pontos de atributo livres crescendo com `nível ^ 1.2`. Para fichas já criadas, aplique o modelo de novo em **Modelos**.

## 1.4.5

- **Máximo das barras só pelo mestre:** o jogador não muda mais o máximo de PV, PE e outras barras, nem na ficha nem no painel de status, e não vê o campo de fórmula do máximo no editor. O mestre continua mudando o valor e a fórmula.
- **Fórmulas de PV e PE:** escritas como o SE da planilha (`if(eq(@classe_n, 1), ...)`) para Brutamonte, Sagaz e Erudito. Os valores não mudam. Para fichas já criadas, aplique o modelo de novo em **Modelos**.

## 1.4.4

- **Nova ficha de jogador:** "Agente (jogador)" é o único modelo de jogador que vem com o app, com sanidade, PV e PE lado a lado e o novo arranjo da página de perícias.
  - O máximo de PV e de PE é calculado direto na barra pela classe, vigor, presença e nível, e muda sozinho. Barra cheia continua cheia quando o máximo sobe.
  - O nome de cada perícia rola `1d20 + pontos da perícia`.
- **Modelos de NPC e inimigos:** NPC padrão, Inimigo rápido e Chefe voltaram, até cada um ganhar a sua ficha.
- **Correção:** barras cujo máximo usava um cálculo que não existe mais na ficha ficavam travadas em 0. Para fichas já criadas, aplique o modelo de novo em **Modelos**.

## 1.4.3

- **Paredes e segredos:** a ferramenta Paredes mudou de nome e ganhou botões para o que antes ficava escondido no clique direito:
  - **Percepção dos jogadores:** anote quanto cada personagem tirou no teste. As notas são de cada cena: uma cena nova começa sem notas, e voltar a uma cena traz as notas dela;
  - **Criar baú:** cria um baú no centro da tela e abre a janela para guardar itens, cada um com sua DT;
  - **Criar armadilha:** cria uma armadilha invisível e abre a configuração dela;
  - **Segredos desta cena:** lista os baús, as armadilhas e os objetos escondidos, com botões para revelar, achar no mapa e editar.
- **Revelar segredos:** o mestre pode mostrar a todos, a qualquer momento, um objeto ou nota escondida, ou uma armadilha ainda armada (ela continua armada). Use o olho na lista de segredos ou **Revelar para todos** no clique direito. **Esconder de novo** volta a usar a DT. Dentro do baú, o olho ao lado de cada item revela só aquele item.
- **Baús:**
  - **Imagem:** o mestre troca a imagem do baú na própria janela, como nos itens.
  - **Capacidade:** cada baú pode ter um máximo de itens. Baú cheio não aceita mais itens, nem do mestre nem dos jogadores, e o servidor também confere.
- **Ícones:** "Imagens do mapa" ganhou um ícone de pasta, para não confundir com o de Camadas. Baús e armadilhas criados pelos botões têm imagens próprias.
- **Editar com dois cliques:** o mestre abre um baú ou uma armadilha clicando duas vezes nele no mapa.
- **Borracha:** a lixeira das ferramentas virou borracha. Ative e clique em cada objeto que quer apagar (tiles, baús, armadilhas, desenhos, paredes, portas, luzes, notas ou áreas). Ctrl+Z desfaz.
- **Dados:**
  - A animação da rolagem mostra os bônus (o +5 de 1d20+5) e o total no fim.
  - Na bandeja de dados do chat: **Somar valores**, **Pegar maior dado** ou **Pegar menor dado** (só um por vez).
- **Efeitos:**
  - A duração aceita dados (1d4 turnos); o mestre vê no chat quanto saiu.
  - Efeitos positivos: **Recupera** em vez de **Perde** cura por turno, e **Bônus nas rolagens** soma um valor ou dado (1d4) nas rolagens da ficha. Novos efeitos prontos: **Regenerando** e **Abençoado**.
- **Ficha padrão:** a ficha "Agente (planilha)" é agora o único modelo que vem com o app e o padrão de personagens, NPCs e inimigos. Os modelos antigos (d20, d100, 2d6, inimigo, chefe, NPC e em branco) saíram; fichas já criadas não mudam, e os modelos salvos pelo mestre continuam.
- **Fórmulas na ficha:**
  - **Barras (PV, PE):** o máximo pode ser uma fórmula (ex.: `@pv_maximo`) e muda sozinho. Barra cheia continua cheia quando o máximo sobe. Na ficha padrão, PV e PE já vêm ligados ao PV máximo e ao PE máximo.
  - **Bolinhas:** a quantidade pode ser uma fórmula (ex.: `@nivel`).
  - **Perícias:** os pontos máximos podem ser uma fórmula (ex.: `(@intelecto + 6) * 5`).

## 1.4.2

- **Menu das salas:** cada sala do launcher tem um botão **⋯** com **Trocar nome** e **Excluir**. As duas opções pedem a senha do mestre daquela sala, e o servidor confere a senha antes de mudar qualquer coisa.
- **Launcher:** a caixa azul vazia que aparecia abaixo do status sumiu, e o "VTT" da abertura agora é azul.
- **Atalho na atualização:** o ícone do atalho não some mais depois de atualizar, e quem não quis atalho na Área de Trabalho não ganha um a cada atualização.

## 1.4.1

- **Montar o mapa arrastando:** na ferramenta Tiles, o painel **Imagens do mapa** mostra as pastas enviadas. Arraste as imagens direto para o mapa e monte como um quebra-cabeça: elas encaixam em 1/4 de quadrado (Shift solta livre). O campo **px/quadrado** ajusta peças feitas para outra grade. Arquivos do computador podem ser soltos no painel ou direto no mapa.
- **Prévia ao vivo:** o tamanho de tiles (pelo canto), a opacidade das camadas e as janelas de token, luz e desenho mostram a mudança enquanto você mexe. Cancelar volta ao que era.
- **Procurar atualização:** o launcher tem um botão visível para conferir se há versão nova.

## 1.4.0

- **Baús:** clique direito num tile (mestre) e escolha **Transformar em baú**. O mestre guarda itens da aba Itens ou arrasta itens até o baú, e cada item pode ter sua **DT de percepção**. O jogador abre o baú com o clique direito quando o personagem está perto, vê só os itens que notou, pega e guarda itens do inventário. O servidor confere a distância e a DT.
- **Percepção:** tiles e notas podem ter uma **DT de percepção**. O mestre anota a percepção de cada personagem e só quem alcança a DT vê o objeto no mapa.
- **Armadilhas:** um tile pode virar armadilha invisível. Dispara quando um token pisa nela ou quando o mestre ativa, aparece com a imagem do tile (GIF também), avisa no chat e aplica um efeito em quem pisou. O mestre pode rearmar.
- **Memória da névoa:** fora da visão, o jogador vê os tiles e notas transparentes como estavam da última vez que viu. Mudanças só aparecem quando ele vê o lugar de novo.
- **Itens:** arraste um item para o token ou a ficha de um personagem; do inventário, para outro personagem ou para o chão. Clique direito pega o item do chão mesmo com o token em cima. Na aba Itens, o mestre vê onde está cada cópia (com quem, no chão ou em baús).
- **Itens escondidos:** itens no chão fora da visão não aparecem para os jogadores.
- **Grupos de tokens:** selecione vários tokens e escolha **Agrupar** no clique direito. Eles andam juntos mantendo a distância e param em paredes.
- **Objetos do mapa:** tiles não precisam ocupar o quadrado inteiro (a partir de 1/4) e podem ser redimensionados pelo canto no modo edição. Paredes e movimento continuam no grid.
- **GIFs e vídeos:** imagens GIF, webm e mp4 ficam animadas em tiles e tokens.
- **Desfazer e apagar:** Ctrl+Z desfaz movimentos, edições e exclusões no mapa; Delete apaga os objetos selecionados no modo edição.
- **Efeitos com dados:** o dano por turno aceita fórmulas como 1d6+2.
- **Portas com chave:** portas trancadas a chave aparecem em vermelho como as trancadas pelo mestre, com o texto certo para cada caso.
- **Auditoria de habilidades:** quando um jogador muda as habilidades da ficha, o mestre recebe uma mensagem privada dizendo o que mudou.

## 1.3.1

- **Atualização automática:** o app procura uma versão nova ao abrir (e a cada 4 horas) e baixa sozinho em segundo plano. Quando terminar, aparece o aviso **Reiniciar e atualizar** na tela inicial. Se preferir não reiniciar na hora, a atualização é instalada quando você fechar o app. O rodapé tem o botão **Procurar atualização**. O download vem das releases oficiais no GitHub e o app confere o código de verificação (SHA-512) do instalador antes de instalar. Quem está na 1.3.0 ou anterior precisa instalar esta versão manualmente uma vez; daqui pra frente é automático.

## 1.3.0

- **Habilidades:** a aba **Rolagens** da ficha virou **Habilidades**. Cada habilidade tem nome, descrição (a caixa de texto cresce e pode ser aumentada arrastando o canto) e quantas rolagens quiser, cada uma com o nome que o jogador ou o mestre escolher, por exemplo **Acerto** e **Efeito**. No chat a rolagem aparece como "Habilidade: Rolagem". As rolagens antigas viram habilidades automaticamente. Quem só vê a ficha lê as habilidades sem rolar.
- **Modelo "Agente (planilha)":** a ficha da planilha da mesa, com todas as fórmulas, agora é o modelo padrão de personagem (o Aventureiro d20 continua em **Modelos**). Classes Brutamonte, Sagaz e Erudito; agilidade, força, intelecto, presença e vigor; pontos de atributo e de perícia livres; máximo por perícia pelo nível; PV e PE máximos por classe e nível; defesa, bloqueio, esquiva e inventário máximo; armaduras (DEF, RDM, RDF); dano e DT de milagres, arcanismo e magias ocultas; arma equipada com teste de acerto e dano; bônus, inventário, itens especiais e notas.
- **Fórmulas com condições:** os cálculos e rolagens da ficha aceitam `if`, `choose` e comparações (`eq`, `gt`, `gte`, `lt`, `lte`, `neq`, `and`, `or`, `not`), como o SE da planilha. Caixas valem 1 ou 0, `@chave_n` dá a posição da opção escolhida e `@pericias_total` soma as perícias.

- **Compartilhar fichas:** o botão **Compartilhar** no topo da ficha (só o mestre) escolhe quais jogadores, ou todos, podem **ver** ou **ver e editar** aquela ficha. Serve para um inventário da base que todos usam, para mostrar a ficha de outro personagem ou de um NPC. Compartilhar não dá controle do token nem a visão do personagem, e o jogador não pode apagar a ficha nem mudar o compartilhamento.
- **Fichas vinculadas:** na ficha do personagem do jogador aparece a linha **Fichas vinculadas**, com um botão para cada ficha que o mestre compartilhou com ele (lápis: pode editar; olho: só leitura). O mestre vê a mesma linha na ficha do jogador. A lista se atualiza sozinha quando o compartilhamento muda.
- **Aviso de mensagem privada:** quando alguém manda uma mensagem privada, toca um som curto e aparece um aviso no canto com quem mandou, o começo da mensagem e o botão **Abrir chat**. Rolagens privadas não disparam o aviso.
- **Cortar paredes:** clique duplo numa parede (mestre, na camada de paredes) corta ela em duas naquele ponto, encaixando no canto do grid mais perto. As duas partes mantêm as configurações da original. Ajuda a abrir espaço para uma porta.
- **Portas fora da visão:** com a visão por token ligada, o jogador só vê as portas que algum personagem dele enxerga.
- **Abrir porta só na visão:** o jogador só abre ou fecha uma porta que algum personagem dele esteja vendo. O servidor também confere isso.

## 1.2.2

- **Apagar notas:** clique direito numa nota abre um menu com **Abrir nota**, **Editar nota** e **Apagar nota**. O mestre apaga qualquer nota; o jogador, as que forem dele.
- **Visão do mestre pelo token:** quando o mestre entra na visão de um token, o que o token não vê fica **escurecido, mas visível**, com tokens e objetos aparecendo por baixo. Assim o mestre sabe onde está cada coisa e ainda tem uma ideia de como o jogador vê. A visão dos jogadores continua igual.
- **Quem está movendo:** enquanto alguém arrasta um token, aparece embaixo dele o nome de quem está movendo (na cor do jogador), para todos da mesa e para quem está arrastando.
- **Portas na seleção:** com a ferramenta de seleção das paredes, as portas podem ser selecionadas e arrastadas (Shift soma à seleção). Clique duplo abre ou fecha a porta.
- **Ficha: vários componentes de uma vez:** Shift/Ctrl+clique ou um retângulo arrastado no espaço vazio seleciona vários componentes, que podem ser movidos, duplicados ou apagados juntos.
- **Ficha: lista de perícias:** novo componente **Perícias**, com cabeçalho de total e pontos máximos. O mestre define os nomes (um por linha), quantas colunas, se o valor é número ou bolinhas, e uma fórmula de rolagem com `@valor`.
- **Minhas pastas para o jogador:** botão de pasta na barra do jogador abre os arquivos dele.
- **Notas, PDFs e imagens nas pastas:** o botão **Nova nota** cria uma anotação de texto na pasta. Clique duplo abre a nota para editar (só leitura em pastas compartilhadas por outros); PDFs e imagens abrem em outra janela. Agora também é possível enviar PDFs.
- **Guia de fórmulas:** novo tópico **Fórmulas da ficha** no tutorial (botão ?) e no README, com atalhos `@`, dados, manter/descartar, resultado da rolagem, funções de cálculo, tabelas e perícias.

## 1.2.1

### Arquivos e pastas

- Jogadores **não veem mais** os uploads e as pastas do mestre.
- Cada jogador tem a **sua pasta**, onde pode criar subpastas. Cada subpasta pode ficar **só para ele** ou **visível para o grupo** (o mestre sempre vê).
- O mestre vê a pasta **Pastas dos jogadores**, com a pasta de cada jogador, e pode abrir, editar e colocar arquivos nelas.
- Pastas que um jogador libera para o grupo aparecem para os outros em **Pastas compartilhadas**.

### Combate

- Quem entra num combate **já iniciado** vai para o **fim da rodada atual** e, na rodada seguinte, passa a seguir a iniciativa.
- NPCs e inimigos entram **ocultos** dos jogadores. O botão **Mostrar todos** revela todos de uma vez.

### Mapa

- **Itens no mapa:** o mestre arrasta um item para o mapa e ele vira um objeto. Um jogador perto dele pega com o botão direito e o item vai para o inventário.
- **Paredes:** só são criadas **segurando e arrastando** (clique solto não cria mais paredes sem querer), e ao editar as pontas encaixam no grid.
- **Fog do mestre:** quando o mestre entra na visão de um token, o que está fora da visão fica **totalmente preto**, como para o jogador.
- **Notas:** o mestre (e o dono) consegue arrastar as notas de qualquer ferramenta. Clicar no ícone abre uma **janela com o texto da nota** (e as páginas do diário ligado).

### Desenhos e textos

- O **preview** mostra a forma certa (retângulo, elipse, mão livre, texto e moldes) na cor de quem desenha, sem a reta seguindo o mouse.
- **Linhas a mão livre** agora podem ser selecionadas e apagadas clicando na própria linha.
- **Paleta de cor** na barra de desenhos (abaixo do texto): escolhe a cor dos próximos desenhos e textos. Com um desenho selecionado (clique nele), a paleta muda a cor dele na hora.
- **Cor:** clique direito ou duplo clique muda a cor, a espessura e o preenchimento do desenho, ou o texto, a cor e o tamanho da letra.
- **Textos** podem ser editados. Só o criador mexe neles, além de quem o mestre liberar em **Quem pode editar e mover**.
- O cadeado da barra de desenhos trava **só os desenhos selecionados**, não todos.

### Fichas e inventário

- **Inventário sincronizado:** arrastar um item para a ficha ou o token dá o item ao personagem, a ficha atualiza na hora para todos e editar o item na aba Itens atualiza as cópias (mantendo a quantidade de cada um).
- Tabelas da ficha podem **mostrar os itens do personagem** (opção no editor da ficha).
- **Resultado da rolagem:** cada campo rolável escolhe entre **somar todos os dados**, **só o maior** ou **só o menor**.
- Rolagens pela ficha de **NPCs e inimigos ficam escondidas** dos jogadores. O botão **Rolagens: só o mestre / todos veem** na ficha muda isso.
- **Modelo de ficha do zero:** dá para criar um modelo sem precisar de um personagem (botão na ficha ou nas configurações).

### Chat e janelas

- Os dados no chat aparecem do **maior para o menor**. Um filtro no topo do chat troca para a **ordem da rolagem**.
- As janelas pop-up podem ser **redimensionadas** pelo canto inferior direito.

## 1.2.0

### Mapa em camadas (estilo Owlbear + editor de imagem)

- O mapa agora é montado em **4 grupos fixos**, de baixo para cima: **Mapa (chão)**, **Props (objetos)**, **Personagens (tokens)** e **Notas** (notas e desenhos ficam sempre por cima).
- Dentro de **Mapa** e **Props** o mestre cria **várias camadas** (até 20 por grupo), como no Photoshop:
  - a ordem do painel é a ordem no mapa, e as setas **sobem ou descem** a camada;
  - **esconder** (some para todos), **travar** (ninguém seleciona nem arrasta nada nela) e **opacidade** de 0 a 100%;
  - **mesclar** junta a camada na de baixo sem perder nenhum objeto, mantendo a ordem;
  - renomear (duplo clique no nome) e apagar (pede confirmação se a camada tiver objetos).
- A **camada ativa** recebe os novos objetos. Se ela estiver travada, o app avisa em vez de colocar o objeto.
- **Botão direito num tile:** trazer para a frente, subir um, descer um, enviar para trás ou **mover para outra camada**.
- O painel **Camadas** abre sozinho na ferramenta Tiles (ou pelo botão de camadas), pode ser arrastado e lembra a posição. Só o mestre edita as camadas.
- Mapas antigos continuam iguais: os tiles existentes entram na camada "Chão".

## 1.1.1

### Idiomas: português, inglês e espanhol

- O app inteiro (mesa, launcher e tela de entrada) agora existe em **português, inglês e espanhol**.
- O idioma segue o do computador: português abre em português, inglês em inglês, espanhol em espanhol. **Qualquer outro idioma abre em inglês.**
- Dá para trocar na tela de entrada (canto superior direito) ou em **Configurações > Idioma**. A escolha fica salva.
- O **instalador** também está nos três idiomas e já vem com o do Windows selecionado.

### Instalador

- Ao instalar por cima de uma versão antiga, os arquivos antigos do programa são apagados antes de copiar os novos, inclusive restos de instalações que deram erro. **Mundos, fichas e mapas não são tocados.**

### Combate

- "Rodada" virou **"Turno"** no combate.
- **Efeitos criados pelo mestre** (envenenado, tonto, cego, sangrando ou qualquer outro):
  - cada efeito tem nome, ícone ou emoji, cor e descrição;
  - pode **tirar (ou dar) vida por turno**, fazer o personagem **agir por último** ou **limitar a visão** dele a alguns metros;
  - o mestre aplica pelo botão direito no token (vale para todos os selecionados) ou pelo painel de status, com busca, e escolhe **quantos turnos** dura e o dano;
  - o efeito aparece no token, no painel de status e na lista do combate, e o chat avisa o dano e quando acaba;
  - gerenciados em **Configurações > Controle do mestre > Efeitos**.

### Fichas e status

- O valor das barras de status agora também pode ser **digitado** (além dos botões - e +), e o bug que impedia alterar alguns status foi corrigido.
- O mestre escolhe **quais campos da ficha aparecem no painel de status**.
- **Jogadores não trocam mais o modelo da ficha.** O mestre define a ficha padrão de todos os jogadores e pode liberar outros modelos para um jogador específico.
- **Aparências:** cada personagem pode ter até **5 aparências** (imagens), trocadas pelo dono ou pelo mestre na ficha ou no botão direito do token.

## 1.1.0

### Combate e turnos

- O topo da aba Combate mostra a **rodada**, o **turno atual** ("Turno 2 de 3") e **de quem é a vez**.
- **Quanto andou:** enquanto é a vez de alguém, aparece quanto o token dele já andou neste turno (ex.: "Andou 6 m (4 quadrados)"). É só um indicativo e zera quando o turno passa.
- **Aviso no topo da tela para todos:** "Rodada 1 · Vez de Goblin", ou "Sua vez" para quem controla o personagem. Clicar leva a câmera até ele.
- **Ordem manual do mestre:**
  - arraste a alça de um combatente para mudar a posição dele, ou use as setas do teclado na alça;
  - **Mandar para o fim** (ficou tonto, atrasou a ação): se for a vez dele, a vez passa para o próximo;
  - **Ordenar pela iniciativa** volta à ordem normal, sem perder de quem é a vez.

### Painel de status

- Novo botão **Status** na barra do topo abre um painel arrastável com **vida, PE e sanidade** (atual e máximo).
- **Mestre:** escolhe quem aparece: personagens dos jogadores, quem está no combate, todos os tokens da cena ou um por um (inimigos incluídos).
- **Jogadores:** veem só os personagens que controlam.
- Botões de **- e +** ajustam o valor sem passar do mínimo nem do máximo da ficha. Clicar no nome abre a ficha.
- O painel lembra a posição, pode ser recolhido e fechado.

### Controle do mestre

Nova aba em **Configurações > Controle do mestre**:

- **Quais barras existem:**
  - ligar ou desligar (ex.: desligue a sanidade se a mesa não usa);
  - trocar nome e cor;
  - dizer quais nomes de campo da ficha valem para cada barra (ex.: vida, hp, pv);
  - até 6 barras.
- **O que os jogadores veem:** painel de status e "quanto andou" no combate.
- **Quem pode arrastar tokens:** só quem controla, ou jogadores arrastam os personagens uns dos outros (útil para carregar um aliado caído). Inimigos e NPCs continuam protegidos.
- No botão direito de um token, **Qualquer jogador pode arrastar** libera um objeto ou NPC específico (uma carroça, um baú). O servidor confere tudo: liberar só permite mover, nunca editar, esconder ou apagar.

### Barra lateral

- Novo botão para **esconder a barra lateral** (chat, combate, atores) e ver o mapa inteiro. Um botão na borda da tela traz ela de volta, e a escolha fica salva.

## 1.0.0

### Sessão da mesa

- Novo botão **Iniciar sessão / Fechar sessão** na barra do mestre.
- Com a sessão fechada, cada jogador fica **congelado na última imagem que viu do mapa**, mesmo que o mestre mude de cena ou puxe ele para outro lugar. A ficha e os dados continuam funcionando.
- Quem entra com a sessão fechada vê o aviso "Aguarde o mestre iniciar a sessão".
- A sessão **fecha sozinha depois de 1 hora** sem ninguém mexer em nada.
- A mesa sempre começa com a sessão fechada: os jogadores esperam o mestre clicar em Iniciar sessão.

### Controlar boneco

- Botão direito num token: **Controlar boneco**. O mestre passa a ver exatamente o que o personagem vê (alcance de visão, paredes, tokens escondidos), a ficha abre e as rolagens saem no nome dele. Também funciona pelo botão direito no nome do jogador na lista.
- Mova o boneco com o mouse ou com WASD. Para sair: **Esc** ou botão direito > **Sair do controle**.
- **Quem pode controlar:** o mestre escolhe quais jogadores controlam cada boneco, ou libera para todos (bom para NPCs).

### Movimento e mapa

- **Movimento em tempo real:** todos veem o token andando enquanto ele é arrastado.
- **WASD** move o token selecionado um quadrado por vez, respeitando paredes, mapa travado e pausa.
- **Pings limitados** a 3 a cada 5 segundos por pessoa, com aviso de quanto tempo esperar.
- A área colorida das luzes só aparece para o mestre no modo edição.

### Desenhos

- Os jogadores podem desenhar numa camada acima de tudo.
- O mestre pode **apagar qualquer desenho** (um por um ou todos os dos jogadores de uma vez) e **travar desenhos** para ninguém mexer, um a um ou todos da cena.

### Senha do mestre e banimento

- A **senha do mestre agora é por sala** e é opcional: deixar vazia significa entrar sem senha.
- Nova aba **Senha do mestre** em Configurações para trocar ou remover a senha.
- O mestre pode **banir** um jogador (ele é desconectado e não volta pelo mesmo nome nem pelo mesmo aparelho) e **desbanir** depois, na janela Jogadores.

### Tutorial

- Botão **?** na barra do topo abre o tutorial.
- **Shift + clique** em qualquer botão ou opção mostra a ajuda daquela opção.

### Aplicativo

- Nova logo e ícone do aplicativo, com uma animação de abertura no launcher.
- Os links de convite ficam **ocultos por padrão**, com um olho para mostrar; o botão de copiar funciona mesmo oculto.
- Instalador para Windows, em português: escolhe a pasta de instalação, cria o atalho no Menu Iniciar, pergunta se você quer um ícone na Área de Trabalho, abre o app ao terminar e tem desinstalador. As campanhas ficam guardadas fora da pasta de instalação, então atualizar ou desinstalar não apaga nada. O instalador já traz tudo que o app precisa; não é preciso baixar mais nada.

### Segurança

- Com a sessão fechada, o servidor recusa qualquer mudança dos jogadores no mapa, além dos pings.
- Banimento guarda só uma impressão criptográfica (HMAC) do endereço, nunca o endereço em texto. O PC que hospeda nunca é banido.
- Troca de senha limitada a 10 tentativas a cada 15 minutos e só pelo mestre, conferindo a senha atual.
- Só o mestre muda quem controla cada personagem.

## 0.2.1

### Puxar jogadores pelo botão direito

- O botão "Puxar todos" saiu da barra do topo. Agora o mestre clica com o **botão direito num ponto vazio do mapa** e escolhe **Todos os jogadores** ou um jogador específico.
- O **token do personagem vai para o ponto clicado**: se ele já está na cena, só se move; se está em outra cena, é trazido para esta; se ainda não existe, é criado. Vários tokens ficam lado a lado, sem empilhar.
- A tela dos jogadores puxados vai junto para a cena e para o ponto escolhido.

### Limite de visão dos jogadores

- Novo botão **Visão** na barra do mestre: digite até quantos metros os jogadores enxergam a partir dos seus tokens (vazio ou 0 = sem limite).
- Vale para todas as cenas e todos os jogadores. Paredes continuam bloqueando a visão, e o mestre sempre vê tudo.

### Mesa

- **Pausar cena:** o mestre cobre o mapa dos jogadores enquanto prepara algo. Dados, chat e fichas continuam funcionando.
- A barra de cenas do topo foi removida. A barra recolhida mostra o nome da sala, e os grupos de botões ficaram alinhados.

### Salas no launcher

- **Excluir sala** direto no menu (os arquivos da pasta `rpgs` são mantidos).
- A sala que já está aberta ganhou o botão **Entrar**, sem precisar digitar o endereço.

### Tradução

- Textos em inglês de sistemas e módulos (como Custom System Builder e Monk's Little Details) agora aparecem em português, sem precisar de internet.

### Visual e usabilidade

- Avisos repetidos se juntam num só (com contador ×N), no máximo 3 na tela.
- Chat reorganizado: mensagem em cima, destinatário e modo de rolagem embaixo.
- Botões do combate com nome, coroa para identificar o mestre na lista de jogadores e horário das mensagens no formato brasileiro.

### Segurança

- Exclusão de sala só pelo launcher local (token + limite de frequência) e nunca da sala aberta.
- O pedido de puxar jogadores é validado com Zod (lista limitada de jogadores existentes) e só o mestre pode enviá-lo.

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

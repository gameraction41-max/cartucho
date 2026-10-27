# Cartucho

Launcher de jogos em tela cheia, no estilo console. Você liga o PC, o Cartucho abre sozinho e tudo funciona com o controle, como um videogame.

Ele junta num lugar só:

- **Steam:** biblioteca, horas jogadas, conquistas e capas, pela Steam Web API.
- **Minecraft:** cada instância do Prism Launcher aparece como um jogo próprio e abre direto, sem passar pela janela do Prism.
- **Hytale:** abre o executável e conta o tempo de jogo sozinho.

## Instalar

Baixe o `Cartucho-Setup-x.y.z.exe` mais novo em [Releases](https://github.com/gameraction41-max/cartucho/releases) e instale. Não precisa de Node.js nem de comandos.

Para gerar uma versão nova do instalador, aumente a `version` no `package.json` e rode **Actions > Release > Run workflow** aqui no GitHub. O workflow cria a tag (`v0.2.0`, por exemplo), e em alguns minutos o `.exe` aparece em Releases.

## Rodar pelo código

Você precisa do [Node.js](https://nodejs.org) 20 ou mais novo.

```bash
npm install
npm start          # abre em tela cheia
npm run dev        # abre em janela, melhor para testar
```

Para gerar o instalador do Windows (fica na pasta `dist/`):

```bash
npm run dist
```

A opção "Abrir quando o Windows iniciar" só funciona no app instalado por esse instalador.

Para mexer só no visual, dá para abrir a interface no navegador com dados de exemplo:

```bash
npx http-server -p 8080 .
# e abra http://localhost:8080/src/renderer/index.html
```

## Primeira configuração

Abra a aba **Configurações** (aperte E ou RB algumas vezes).

1. **Chave da Steam Web API:** gere em <https://steamcommunity.com/dev/apikey>. Em "domínio" pode colocar qualquer coisa, como `localhost`. A chave fica guardada só no seu PC, criptografada pelo Windows.
2. **SteamID64:** é o número de 17 dígitos do seu perfil. Dá para descobrir colando o link do perfil em <https://steamid.io>.
3. **Privacidade da Steam:** em Perfil > Editar perfil > Privacidade, deixe "Detalhes de jogo" como **Público**. Sem isso a Steam não entrega horas nem conquistas.
4. **Prism Launcher:** normalmente é achado sozinho em `%APPDATA%\PrismLauncher`. Se você usa a versão portátil, indique a pasta.
5. **Hytale:** escolha o `.exe` que abre o jogo. Se esse `.exe` for só o launcher, preencha também o nome do processo do jogo para o tempo ser contado direito.

## O que dá para fazer

- **Página do jogo:** jogar, abrir na loja, ver conquistas e trocar a capa e o fundo por imagens suas ("Restaurar" volta a arte original). Também dá para escolher uma música para o jogo: ela toca no lugar da música tema enquanto o jogo está selecionado.
- **Capas do Minecraft:** instâncias sem capa ganham um bloco de grama com a cor do loader (Fabric, Forge, NeoForge, Quilt ou Vanilla) e a versão no canto.
- **Tempo da semana:** a aba Conquistas mostra quanto você jogou em cada um dos últimos 7 dias e os jogos mais jogados. Conta também o que foi jogado fora do Cartucho, comparando os totais da Steam, do Prism e do Hytale.
- **Minecraft:** na página de cada instância, "Preset gráfico" alterna entre Desempenho, Equilibrado e Qualidade. O Cartucho muda só as opções de vídeo do `options.txt` da instância e guarda uma cópia do original em `options.txt.cartucho-backup`. Troque com o jogo fechado.
- **PC:** uso do processador e da memória, placa de vídeo e espaço nos discos. Com base nesse hardware, o Cartucho recomenda um preset gráfico e aplica em todas as instâncias do Minecraft de uma vez.
- **Menu por cima do jogo:** com um jogo aberto, o botão do Xbox abre só o menu lateral, com o jogo em destaque no topo e o jogo continuando visível atrás. Fechar o menu volta para o jogo.
- **Amigos:** quem dos seus amigos da Steam está jogando agora (e o quê), quem está online e quando os outros foram vistos. Precisa da lista de amigos pública no perfil da Steam.
- **Atualização automática:** o Cartucho instalado procura versões novas nas Releases do GitHub, baixa sozinho e instala quando você fecha o app (ou na hora, pelo menu rápido).
- **Conquistas:** quando você desbloqueia uma conquista na Steam, o Cartucho mostra um aviso na tela ao voltar do jogo.

## Controles

| Ação | Controle | Teclado |
| --- | --- | --- |
| Mover | Direcional ou analógico | Setas |
| Confirmar / Jogar | A | Enter |
| Voltar | B | Esc |
| Detalhes | Y | I |
| Filtrar / Ordenar | X | F |
| Trocar de aba | LB / RB | Q / E |
| Menu rápido | Start, Select ou Guide | M |
| Tela cheia | | F11 |

O indicador no topo mostra se você está usando teclado ou controle, e as dicas de botões no canto mudam junto.

O botão Guide (o do meio, do Xbox) costuma ser capturado pela Game Bar do Windows. Se ele não abrir o menu rápido, use o Start ou desative a Game Bar no controle em Configurações do Windows > Jogos.

## Como funciona

```
src/
  main/        processo principal (Node): arquivos, Steam, abrir jogos
    main.js      janela em tela cheia e comunicação com a interface
    steam.js     chamadas à Steam Web API
    library.js   junta Steam, Prism e Hytale e guarda cache em disco
    art.js       capas e fundos personalizados
    mcoptions.js presets gráficos do Minecraft
    system.js    desligar/reiniciar, hardware e preset recomendado
    overlay.js   janela transparente do menu por cima do jogo
    prism.js     lê as instâncias do Prism (instance.cfg e mmc-pack.json)
    watch.js     percebe quando o jogo abriu e fechou
    config.js    configurações (chave da Steam criptografada)
  renderer/    interface (HTML, CSS e JavaScript puro)
    app.js       estado, troca de telas e ações do controle
    views/       uma tela por arquivo
    lib/         controle e teclado, foco, sons e música
test/          testes (npm test)
```

Os dados ficam em `%APPDATA%\Cartucho`: `config.json`, `steam-cache.json` (biblioteca e conquistas, para abrir rápido e funcionar offline) `playtime.json` (tempo do Hytale), `custom-art.json` e a pasta `art` (capas, fundos e músicas personalizados) e `history.json` (tempo jogado por dia).

Quando um jogo fecha, o Cartucho volta para a frente sozinho. Na Steam ele percebe isso pelo registro do Windows (`RunningAppID`). No Minecraft, pelo processo do Java, e no Hytale pelo processo do jogo.

A música tema é gerada na hora pelo próprio app. Você pode trocar por um arquivo seu em Configurações > Som.

### Botão do Xbox

O navegador não enxerga o botão do Xbox, então o Cartucho lê esse botão direto do driver do controle (XInput). Com isso ele abre o menu rápido. Se um jogo estiver aberto, o menu aparece sozinho por cima do jogo, numa janela transparente. Jogos em tela cheia exclusiva podem minimizar quando o menu abre; nesses, use o modo "tela cheia sem bordas" nas opções de vídeo do jogo.

Para o Windows não abrir a Game Bar junto, vá em Configurações do Windows > Jogos > Game Bar e desligue "Abrir a Game Bar usando este botão em um controle". Se a Steam estiver aberta, ela também pode reagir ao botão. Para evitar isso, na Steam vá em Configurações > Controle e desative a opção do botão Guia.

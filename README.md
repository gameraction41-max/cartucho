# Cartucho

Launcher de jogos em tela cheia, no estilo console. Você liga o PC, o Cartucho abre sozinho e tudo funciona com o controle, como um videogame.

Ele junta num lugar só:

- **Steam:** biblioteca, horas jogadas, conquistas e capas, pela Steam Web API.
- **Minecraft:** cada instância do Prism Launcher aparece como um jogo próprio e abre direto, sem passar pela janela do Prism.
- **Hytale:** abre o executável e conta o tempo de jogo sozinho.

## Como rodar

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
    prism.js     lê as instâncias do Prism (instance.cfg e mmc-pack.json)
    watch.js     percebe quando o jogo abriu e fechou
    config.js    configurações (chave da Steam criptografada)
  renderer/    interface (HTML, CSS e JavaScript puro)
    app.js       estado, troca de telas e ações do controle
    views/       uma tela por arquivo
    lib/         controle e teclado, foco, sons e música
test/          testes (npm test)
```

Os dados ficam em `%APPDATA%\Cartucho`: `config.json`, `steam-cache.json` (biblioteca e conquistas, para abrir rápido e funcionar offline) e `playtime.json` (tempo do Hytale).

Quando um jogo fecha, o Cartucho volta para a frente sozinho. Na Steam ele percebe isso pelo registro do Windows (`RunningAppID`). No Minecraft, pelo processo do Java, e no Hytale pelo processo do jogo.

A música tema é gerada na hora pelo próprio app. Você pode trocar por um arquivo seu em Configurações > Som.

# Adivinhando

Jogo semântico para lives em que cada comentário recebido pelo conector LIVE+ vira uma tentativa de descobrir a palavra secreta.

## Estado atual

A versão do jogo é definida exclusivamente em `version.json`. O bootstrap lê esse arquivo com `cache: no-store` e usa o campo `build` para versionar os arquivos CSS e JavaScript carregados no navegador.

## Estrutura

```text
Adivinhando/
├── .github/workflows/
│   ├── ci.yml
│   ├── qa.yml
│   └── visual-ai.yml
├── assets/
│   └── styles.css
├── data/
│   └── words.js
├── js/
│   ├── bootstrap.js
│   ├── app.js
│   ├── game.js
│   ├── semantic.js
│   ├── liveplus.js
│   ├── mobile.js
│   └── cache.js
├── scripts/
│   └── test-runner.mjs
├── index.html
├── version.json
└── README.md
```

### Responsabilidades

- `index.html`: somente a estrutura visual da página.
- `assets/styles.css`: estilos e layout responsivo.
- `js/bootstrap.js`: lê `version.json`, carrega CSS, SDK LIVE+ e o aplicativo com cache-busting.
- `js/app.js`: integra interface, jogo e LIVE+.
- `js/game.js`: rodada, palavra secreta, tentativas, vencedor e histórico anti-repetição.
- `js/semantic.js`: modelo de embeddings, similaridade e rank semântico; possui modo determinístico `?qa=1` usado apenas pelos testes.
- `js/liveplus.js`: conexão com o Painel Universal, ticket LIVEPLUS1, código de 8 caracteres, troca de sessão, transporte e reconexão.
- `js/mobile.js`: bloqueio de zoom/gestos acidentais no celular.
- `js/cache.js`: atualizar página e limpar caches/service workers.
- `data/words.js`: banco de palavras por categoria.
- `scripts/test-runner.mjs`: motor comum dos testes CI, QA e Visual AI.

## LIVE+

O jogo usa o SDK v1 do Projeto Daniel e aceita código de 8 caracteres, ticket completo `LIVEPLUS1` e reconexão automática usando o código salvo localmente.

Ao informar um código diferente do código ativo, `liveplus.js` descarta a sessão cliente anterior e cria uma nova sessão. Reconexões automáticas não fecham o modal de configuração; somente uma conexão iniciada manualmente pelo usuário pode fechá-lo após sucesso.

Manifesto atual do jogo:

- `gameId`: `adivinhando`
- ações: iniciar rodada, próxima palavra e parar rodadas.

Os comentários recebidos como `comment`, `chat`, `tiktok-comment` ou `tiktok_comment` são convertidos automaticamente em tentativas.

Também permanece disponível a API JavaScript:

```js
window.Adivinhando.comment('usuario', 'palpite');
window.Adivinhando.start({ category: 'animais' });
window.Adivinhando.next();
window.Adivinhando.stop();
```

## Testes automáticos

O repositório possui três sistemas independentes no GitHub Actions:

1. **CI** (`ci.yml`): verifica estrutura, arquivos obrigatórios, fonte única de versão, separação do `index.html`, sincronização LIVE+ e proteção para troca de sessão.
2. **QA** (`qa.yml`): abre o jogo em Chromium com um SDK LIVE+ simulado e testa inicialização, conexão, troca de código, descarte da sessão anterior, reconexão automática sem fechar o modal e acerto de uma rodada.
3. **Visual AI** (`visual-ai.yml`): agente visual de regressão baseado em navegador e geometria da interface. Ele captura evidências e procura automaticamente overflow, zoom indevido, HUD/cabeçalho cortado, palavra secreta fora da tela, botão do painel, versão e modal em quatro tamanhos de tela: iPhone 13, Android pequeno, tablet e desktop. Screenshots e `visual-report.json` são enviados como artifact por 14 dias.

O Visual AI atual é um agente visual determinístico/heurístico, sem depender de API externa ou chave secreta. Isso evita custo e deixa o teste obrigatório em todo push/PR. Ele foi desenhado para detectar regressões de layout; não substitui revisão humana de estética.

## Ranking semântico

`#1` representa a palavra exata. Os demais números são atualmente uma escala estimada derivada da similaridade dos embeddings do modelo `Xenova/paraphrase-multilingual-MiniLM-L12-v2`.

Ainda não é um rank lexical global igual ao Contexto. A próxima evolução prevista é criar um vocabulário de referência PT-BR e pré-calcular a ordenação semântica por palavra-alvo.

## Publicação

O projeto é servido pelo GitHub Pages. Para uma nova versão pública, altere `version` e `build` em `version.json`; o carregador propaga o novo build para os recursos da aplicação.

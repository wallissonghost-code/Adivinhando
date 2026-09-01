# Adivinhando

Jogo semântico para lives em que cada comentário recebido pelo conector LIVE+ vira uma tentativa de descobrir a palavra secreta.

## Estado atual

A versão do jogo é definida exclusivamente em `version.json`. O bootstrap lê esse arquivo com `cache: no-store` e usa o campo `build` para versionar os arquivos CSS e JavaScript carregados no navegador.

## Estrutura

```text
Adivinhando/
├── index.html
├── version.json
├── README.md
├── assets/
│   └── styles.css
├── data/
│   └── words.js
└── js/
    ├── bootstrap.js
    ├── app.js
    ├── game.js
    ├── semantic.js
    ├── liveplus.js
    ├── mobile.js
    └── cache.js
```

### Responsabilidades

- `index.html`: somente a estrutura visual da página.
- `assets/styles.css`: estilos e layout responsivo.
- `js/bootstrap.js`: lê `version.json`, carrega CSS, SDK LIVE+ e o aplicativo com cache-busting.
- `js/app.js`: integra interface, jogo e LIVE+.
- `js/game.js`: rodada, palavra secreta, tentativas, vencedor e histórico anti-repetição.
- `js/semantic.js`: modelo de embeddings, similaridade e rank semântico.
- `js/liveplus.js`: conexão com o Painel Universal, ticket LIVEPLUS1, código de 8 caracteres, estado de transporte e reconexão.
- `js/mobile.js`: bloqueio de zoom/gestos acidentais no celular.
- `js/cache.js`: atualizar página e limpar caches/service workers.
- `data/words.js`: banco de palavras por categoria.

## LIVE+

O jogo usa o SDK v1 do Projeto Daniel e aceita:

- código de 8 caracteres, por exemplo `ABCD-EFGH`;
- ticket completo `LIVEPLUS1`, incluindo configuração de relay;
- reconexão automática usando o código salvo localmente.

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

## Ranking semântico

`#1` representa a palavra exata. Os demais números são atualmente uma escala estimada derivada da similaridade dos embeddings do modelo `Xenova/paraphrase-multilingual-MiniLM-L12-v2`.

Ainda não é um rank lexical global igual ao Contexto. A próxima evolução prevista é criar um vocabulário de referência PT-BR e pré-calcular a ordenação semântica por palavra-alvo.

## Publicação

O projeto é servido pelo GitHub Pages. Para uma nova versão, altere `version` e `build` em `version.json`; o carregador propaga o novo build para os recursos da aplicação.

# Adivinhando

Jogo semântico para live em que os comentários dos espectadores viram tentativas automaticamente.

## Como funciona

- O host define uma palavra secreta, por exemplo `uva`.
- Cada comentário recebido vira uma tentativa.
- `uva` é sempre `#1` e encerra a rodada.
- As demais palavras recebem uma posição de proximidade semântica.
- As 10 melhores tentativas aparecem no placar.
- Tentativas repetidas do mesmo usuário são ignoradas.
- O jogo usa Transformers.js no navegador e um modelo multilíngue para embeddings; não é necessário cadastrar milhares de palavras manualmente.

> Nesta primeira versão, o número exibido é uma **escala de distância semântica para live**, e não a posição exata da palavra dentro de um dicionário português completo. Para um ranking lexical global real, a próxima etapa é pré-calcular um vocabulário PT-BR e consultar esse índice.

## Teste manual

Abra `index.html`, informe a palavra secreta e use o simulador de comentários no painel lateral.

## Integração com o conector

O jogo aceita comentários de três formas.

### JavaScript direto

```js
window.Adivinhando.comment('joao', 'vinho');
```

### postMessage

```js
window.postMessage({
  type: 'tiktok-comment',
  username: 'joao',
  comment: 'vinho',
  avatar: ''
});
```

### WebSocket

Abra a página com:

```text
?ws=wss://ENDERECO-DO-CONECTOR
```

O WebSocket deve enviar JSON neste formato:

```json
{
  "type": "comment",
  "username": "joao",
  "comment": "vinho",
  "avatar": ""
}
```

## Próxima etapa recomendada

Ligar o evento real de comentário do conector TikTok/Live+ ao método `window.Adivinhando.comment(...)` ou ao WebSocket, e depois substituir a escala estimada por um índice PT-BR pré-calculado caso seja necessário ter rankings globais exatos como `#37`, `#876`, `#12500`.
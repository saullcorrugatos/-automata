# Placar TikTok LIVE — Overlay para OBS (Node.js)

Overlay de placar (Azul × Vermelho) com timer, pontos e votos, servido por um
servidor Node.js sem dependências. O overlay (o que aparece na live) e o painel
de controle ficam em páginas separadas e sincronizam em tempo real.

## Como rodar

Requer Node.js 18 ou superior.

```bash
npm start
# ou: node server.js
```

- **Overlay (OBS):** http://localhost:3000/overlay
- **Painel de controle:** http://localhost:3000/control

Use `PORT=4000 npm start` para mudar a porta.

## Configurando no OBS

1. Adicione uma fonte **Navegador** (Browser Source).
2. URL: `http://localhost:3000/overlay`
3. Tamanho sugerido: **1080 × 1920** (vertical, TikTok).
4. Opcional: marque **"Controlar áudio pelo OBS"** para o som de voto sair na mixagem.

Parâmetros da URL do overlay:

| Parâmetro      | Efeito                                         |
|----------------|------------------------------------------------|
| `?transparent` | Remove o fundo (só os painéis aparecem)        |
| `?mute`        | Não toca o som de voto                          |

Ex.: `http://localhost:3000/overlay?transparent`

## Som de voto

Coloque um arquivo chamado `som_voto.mp3` dentro da pasta `public/`.
Ele toca no overlay sempre que um voto é registrado.

## Painel de controle

Abra `/control` no navegador (pode ser no celular, usando o IP do PC na mesma
rede, ex. `http://192.168.0.10:3000/control`).

Atalhos de teclado no painel: `1` azul +1 · `2` vermelho +1 · `5` voto azul ·
`6` voto vermelho · `espaço` iniciar/pausar timer.

O estado é salvo em `state.json` e restaurado ao reiniciar o servidor.

## API (integração com TikFinity, Streamer.bot, etc.)

Qualquer ferramenta que consiga chamar uma URL pode atualizar o placar —
por exemplo, disparar uma ação quando alguém envia um presente na live.

| URL (GET)                              | Ação                          |
|----------------------------------------|-------------------------------|
| `/api/score?team=blue&n=1`             | Soma `n` pontos (aceita negativo) |
| `/api/vote?team=red`                   | +1 voto (toca o som)          |
| `/api/name?team=blue&value=FULANO`     | Muda o nome do time           |
| `/api/start` / `/api/pause`            | Inicia / pausa o timer        |
| `/api/resetTimer?minutes=5`            | Reinicia o timer              |
| `/api/resetScores` / `/api/resetVotes` | Zera pontos / votos           |
| `/api/resetAll`                        | Restaura os valores de exemplo |
| `/api/state`                           | Retorna o estado em JSON      |

Também aceita `POST /api/action` com JSON, ex.:
`{"type":"score","team":"red","n":5}`.

`team` deve ser `blue` ou `red`.

# Space Invaders

Um jogo de arcade feito com HTML, CSS e JavaScript puro. Defenda a Terra, use os escudos e derrube as ondas de invasores. O recorde fica salvo no navegador do jogador.

## Jogar

Jogue em [Space Invaders no GitHub Pages](https://leandrodukievicz.github.io/space-invaders/) ou execute um servidor estático na pasta do projeto:

```sh
python3 -m http.server 8000
```

Acesse `http://localhost:8000`. Não é necessário instalar dependências ou criar contas.

## Controles

- **← / →** ou **A / D**: mover a nave.
- **Espaço**: atirar (segure para disparar continuamente).
- **P** ou **Esc**: pausar e continuar.
- **Enter**: começar ou reiniciar.
- Em telas menores, use os botões na tela. O som pode ser ativado no painel do jogo.

Os pontos variam conforme o tipo de invasor; a nave bônus vale 100 pontos. Cada nova onda aumenta a dificuldade e recompõe os escudos. O jogo pausa automaticamente ao sair da aba.

## Arquivos

- `index.html`: estrutura e interface.
- `style.css`: visual e responsividade.
- `game.js`: desenho em canvas, regras, controles, áudio e recorde local.

O projeto é estático: o GitHub Pages publica diretamente o conteúdo da branch `main`.

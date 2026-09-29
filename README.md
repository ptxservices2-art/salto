# Salto

**Salto** é um jogo de plataforma **open source**, feito para rodar no navegador.

O código é livre. Qualquer pessoa pode jogar, ler, modificar, compartilhar e usar este projeto como base para o próprio jogo. Não há servidor, conta nem instalação: são três arquivos e um raposo tentando chegar na bandeira.

## Como jogar

Abra o arquivo `index.html` no navegador.

| Tecla | Ação |
| --- | --- |
| Setas ou A / D | Mover |
| Espaço | Pular (segure para ir mais alto) |
| R | Reiniciar a fase |
| M | Ligar ou desligar o som |

No celular, os botões aparecem na parte de baixo da tela.

São três fases e três vidas. As moedas são opcionais. A bandeira abre a fase seguinte.

## Contribuir

Este é um projeto aberto. Correções, fases novas e ideias de jogabilidade são bem-vindas.

1. Faça um fork do repositório.
2. Crie um branch com a sua mudança.
3. Abra um pull request contando o que mudou e por quê.

As fases ficam na lista `LEVELS`, no começo de `game.js`. Cada plataforma, moeda e espinho usa `x` e `y` em pixels (`y` cresce para baixo; o chão fica perto de `y = 450`). A gravidade, a altura do pulo e a velocidade ficam no objeto `TUNE`, logo acima.

## Licença

Código aberto sob a [licença MIT](LICENSE).

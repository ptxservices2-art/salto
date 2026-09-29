# Salto

**Salto** é um jogo de plataforma **open source**, feito para rodar no navegador.

O código é livre. Qualquer pessoa pode jogar, ler, modificar, compartilhar e usar este projeto como base para o próprio jogo.

O progresso da partida — fase, moedas, mortes e conclusão — só muda quando o servidor confirma. O navegador desenha a fase em que você está e prevê o pulo; as fases seguintes ficam no servidor. Editar o JSON da sessão à mão não concede a vitória: cada progresso leva um selo que só o servidor sabe assinar.

## Como jogar

```bash
node server.js
```

Abra [http://127.0.0.1:8787](http://127.0.0.1:8787). Na mesma rede, outras pessoas usam o endereço desta máquina.

Depois do apelido, todo mundo cai no lobby. Dá para andar, pular e ver quem mais está por ali. A partida não começa sozinha: o botão Jogar entra na fase, e Lobby volta para a praça sem apagar o progresso. O botão Tela cheia, ou a tecla F, ocupa a tela inteira.

| Tecla | Ação |
| --- | --- |
| Setas ou A / D | Mover |
| Espaço | Pular (segure para ir mais alto) |
| E | Cumprimentar no lobby |
| F | Tela cheia |
| R | Reiniciar a fase |
| M | Ligar ou desligar o som |

No celular, os botões aparecem na parte de baixo da tela.

São 20 fases e três vidas. As moedas são opcionais. A bandeira abre a fase seguinte. No fim, o jogo pede um login para salvar o resultado.

## Contribuir

Este é um projeto aberto. Correções, fases novas e ideias de jogabilidade são bem-vindas.

1. Faça um fork do repositório.
2. Crie um branch com a sua mudança.
3. Abra um pull request contando o que mudou e por quê.

O jogo roda num motor próprio, na pasta `engine`. A ideia é a de um runtime de cena: cada coisa do jogo é um `GameObject` com componentes (`Behaviour`), a cena ativa é atualizada pelo `Application`, e a `Camera` publica o que a tela desenha. O teclado passa por `Input`. As três primeiras fases estão escritas à mão em `levels.js`. Da quarta à vigésima, o mesmo arquivo monta o caminho. A gravidade, a altura do pulo e a velocidade ficam no objeto `TUNE`, em `game.js`.

## Licença

Código aberto sob a [licença MIT](LICENSE).

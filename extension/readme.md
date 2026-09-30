# Henkkes Player

Mostra no VS Code o que está tocando no YouTube (qualquer navegador baseado em Chromium ou Firefox): capa, título, progresso e play/pause/próximo/anterior.

O player é uma pílula compacta que aparece na barra lateral do Claude Code, logo junto do chat. Também fica disponível (recolhida) no Explorer, e o título vai pra status bar (clique = play/pause).

Como funciona: um script PowerShell lê os controles de mídia do Windows (SMTC, os mesmos do overlay de volume) e manda o estado pra extensão. Não precisa de extensão no navegador.

## Desenvolver
1. Abra a pasta `extension/` no VS Code e aperte F5.
2. Na janela nova, abra a barra do Claude Code ou o Explorer.

## Empacotar
Na raiz do repositório:

    python build.py

Gera `downloads/henkkes-player.vsix` e regrava o payload de `downloads/instalar-henkkes-player.cmd`.

## Atalhos
Os comandos `henkkesPlayer.toggle`, `henkkesPlayer.next` e `henkkesPlayer.prev` podem ser ligados a qualquer tecla em Keyboard Shortcuts.

## Problemas
Logs em Output > "Henkkes Player". Só Windows por enquanto.

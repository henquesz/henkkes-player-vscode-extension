# Henkkes Player

Extensão pro VS Code que mostra o que está tocando no YouTube (capa, título, progresso) no Explorer, com play/pause/próximo pela status bar. Só Windows por enquanto.

## Instalar

- Rode `downloads/instalar-henkkes-player.cmd`, ou
- `code --install-extension downloads/henkkes-player.vsix`

Depois: `Ctrl+Shift+P` → "Reload Window".

## Estrutura

- `index.html` — site
- `downloads/` — instalador e `.vsix`
- `vercel.json` — headers de download na Vercel

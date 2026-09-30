# Henkkes Player — VS Code Extension

Site de download do **YT Mini Player**, uma extensão para o VS Code que toca YouTube direto no Explorer (seção "Tocando agora").

## Instalação

- **Windows:** baixe e rode `downloads/instalar-yt-mini-player.cmd`
- **Manual:** baixe `downloads/yt-mini-player.vsix` e rode:
  ```
  code --install-extension yt-mini-player.vsix
  ```

Depois, recarregue o VS Code (`Ctrl+Shift+P` → "Reload Window").

## Estrutura

- `index.html` — página do site
- `downloads/` — instalador e pacote `.vsix`
- `vercel.json` — configuração de deploy na Vercel

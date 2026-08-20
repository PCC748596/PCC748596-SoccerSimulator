# patch/

Scripts Node de uso único que reescrevem ficheiros em `js/` por substituição de
texto. Não fazem parte do jogo: `index.html` não os carrega, e nenhum ficheiro
de `js/` os importa. Cada um foi escrito para aplicar uma alteração concreta,
uma vez, e ficou no repositório como registo dessa alteração.

## Correr um deles

Os caminhos lá dentro são relativos à **raiz do repositório**, não a esta pasta:

```js
let code = fs.readFileSync('js/player.js', 'utf8');
```

Portanto corre sempre a partir da raiz:

```bash
node patch/patch_shadows.js
```

Correr de dentro de `patch/` falha a abrir o ficheiro.

## Antes de correr

Estes scripts sobrescrevem ficheiros de origem sem confirmação e sem cópia de
segurança. Vários procuram texto que já mudou desde que foram escritos — nesse
caso o `replace` não encontra nada e o ficheiro é reescrito igual, sem aviso.
Confirma que a árvore de trabalho está limpa (`git status`) antes de correr
algum, para poderes ver no `git diff` o que ele realmente mudou.

## O que cada um toca

| Script | Ficheiro que reescreve |
| --- | --- |
| `patch.js` | `js/match.js` |
| `patch_formations.js` | `js/bt/team_bt.js` |
| `patch_main.js` | `js/main.js` |
| `patch_main_broadcast.js` | `js/main.js` |
| `patch_player_frustum.js` | `js/player.js` |
| `patch_player_revert.js` | `js/player.js` |
| `patch_renderer.js` | `js/main.js` |
| `patch_shadows.js` | `js/player.js` |
| `patch_stadium_shader.js` | `js/match.js` |
| `patch_steering.js` | `js/player.js` |
| `patch_steering_vel.js` | `js/player.js` |
| `patch_utils.js` | `js/utils.js` |

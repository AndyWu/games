# Blockcraft

A tiny Minecraft-inspired voxel sandbox that runs entirely in the browser — procedurally generated terrain, block breaking/placing, and first-person movement, built with [three.js](https://threejs.org/). No build step, no server-side code, no dependencies to install.

## Play locally

Open `index.html` directly, or serve the folder (recommended, since some browsers restrict features on `file://`):

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Deploy to GitHub Pages

1. Create a new GitHub repository (public).
2. Push this folder's contents (`index.html`, `main.js`) to the repo's default branch:
   ```bash
   git init
   git add index.html main.js README.md
   git commit -m "Add Blockcraft voxel game"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo>.git
   git push -u origin main
   ```
3. In the repo, go to **Settings → Pages**.
4. Under **Build and deployment → Source**, choose **Deploy from a branch**.
5. Set **Branch** to `main` and folder to `/ (root)`, then **Save**.
6. After a minute or two, your game is live at:
   `https://<your-username>.github.io/<your-repo>/`

## Controls

- `WASD` — move
- `Space` — jump
- `Shift` — sprint
- Mouse — look (click the page first to lock the pointer)
- Left click — break block
- Right click — place block
- `1`–`8` or mouse wheel — select block from hotbar

## Notes

- The world is a fixed 64×64 block area with procedurally generated hills, a beach/water line, and scattered trees — regenerated from a fixed seed, so it's the same every time you load it.
- Block edits (breaking/placing) are saved to the browser's `localStorage`, so your changes persist across reloads on the same device/browser.
- Best played on desktop with a mouse — pointer lock and WASD aren't a good fit for touch screens.
- Everything is a single `<script>` tag pulling three.js from a CDN (`jsdelivr`), so there's nothing to install or build.

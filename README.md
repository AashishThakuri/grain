# GRAIN

GRAIN is an experimental scroll-driven visual narrative for the idea of photo protection before publication. It turns a landing page into a living editorial canvas: images travel along a path, the story moves through sections, and each visit composes the screen differently.

## The Concept

The site is designed around controlled variation rather than a fixed hero layout.

- Every reload chooses a new image composition and content placement.
- The hero copy is placed into a calculated clear area so it remains readable and does not collide with the active image collage.
- The image path behaves as an endless visual stream. As the viewer scrolls, photos move through the scene and the story progresses through Home, Problem, How It Works, Testing, Product, and Security.
- The attached `Scroll` and `Start` control both begin or pause the same automatic story movement.
- Navigation links jump smoothly to the relevant moment in the visual story.
- A live minimap in the top-right corner mirrors the current layout: navigation, image field, copy block, and proof block are represented in the position they occupy on screen.

The result is intentionally not identical on every reload. The typography, content hierarchy, safety zones, and image field are coordinated so that the page feels composed rather than random.

## Experience Principles

1. **Infinite motion**: the visual path is continuous, not a conventional stack of static sections.
2. **Adaptive composition**: the copy reacts to available white space instead of being permanently locked to one side.
3. **No collisions**: image visibility is managed around protected interface areas such as the navigation, text, proof block, progress marker, and scroll control.
4. **Progressive story**: scrolling changes the current story chapter with subtle transitions, while the active navigation item and minimap keep the viewer oriented.
5. **Editorial contrast**: dense photo fragments, restrained black-and-white typography, and quiet technical proof elements give the concept a serious visual language.

## Public Site

The public deployment is intentionally the landing page only. It presents the GRAIN concept and visual experience; it does not expose the local research workspace or image-processing controls.

## Local Development

```powershell
Set-Location frontend
npm install
npm run dev
```

Open `http://127.0.0.1:5173`.

## Project Structure

```text
frontend/  The Vite landing page, Three.js scene, motion, layouts, and assets
backend/   Local research workspace; not part of the public deployment
```

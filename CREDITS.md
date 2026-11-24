# Credits

Every asset and its license (PRD Section 15). The Credits screen will read this file.

## Art

| Asset                                                                                                            | Author       | License | Used for                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------- | ------------ | ------- | --------------------------------------------------------------------------------------------------------------- |
| [KayKit: Adventurers Character Pack 1.0](https://www.kaylousberg.com)                                            | Kay Lousberg | CC0 1.0 | Hero looks (Knight, Mage, Rogue, Rogue Hooded, Barbarian), weapons, 76 character animations                     |
| [Quaternius: Ultimate Monsters (Blob, Big and Flying packs)](https://quaternius.com/packs/ultimatemonsters.html) | Quaternius   | CC0 1.0 | Zone 1 monsters and Queen Gelatina (GreenBlob, PinkBlob, GreenSpikyBlob, Mushnub, Dog, Bunny, Cactoro, Armabee) |

The original downloads are kept in `assets-src/` (the KayKit zip and `assets-src/quaternius-ultimate-monsters/`). The pack's own `LICENSE.txt` is headed "Ultimate Platformer Pack", which looks like a copy-paste slip in the download; the pack page and the text both state CC0 1.0. The game ships compressed copies built by `npm run assets`.

## Fonts

| Asset                                                                           | Author                      | License     | Used for              |
| ------------------------------------------------------------------------------- | --------------------------- | ----------- | --------------------- |
| [Fredoka](https://fonts.google.com/specimen/Fredoka), via `@fontsource/fredoka` | The Fredoka Project Authors | SIL OFL 1.1 | UI and damage numbers |

## Code libraries

three.js (MIT), Preact (MIT), zod (MIT), idb-keyval (Apache-2.0), vite-plugin-pwa and Workbox (MIT). Their licenses ship with the packages in `package-lock.json`.

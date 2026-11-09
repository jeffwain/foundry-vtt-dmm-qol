# The Dice Monster's Miscellany - Foundry D&D 5e Quality of Life Improvements

This module contains my (hightouch 👋) quality of life improvements for Foundry v14 and 5e v6.x to streamline the UI and functionality for DMs and players. They're mostly here to make complicated functionality across Foundry and the 5e system easier to use for more tables.

I recommend using this with the following modules:

- **[Larkinabout's Custom D&D 5e](https://github.com/larkinabout/foundry-vtt-custom-dnd5e)**. This lets you customize world settings without needing to maintain a world script. However, turn *off* token HUD scaling in Custom D&D 5e as it will conflict with this module.
- **[theripper93's Dig Down](https://github.com/theripper93/fuzzy-foundry)**. I use indexing from Dig Down for quick token image searching, but you only really need it if you have more than a thousand saved token/portrait images on-hand.
- **[Nik's Token Motion](https://github.com/nschoenwald/niks-token-motion)**. This module adds token motion effects to your tokens. I started this module specifically as a replacement for TokenEase, but Nik's has done it better than I did.
- **[7H3LaughingMan's Wayfinder](https://github.com/7H3LaughingMan/wayfinder)**. Because Foundry desperately needs pathfinding for gridded maps, and players trying to move around walls is painful to watch. This isn't as good as some of the old pathfinding modules, but works well for now. Overrides some Token Motion animations like pickup.

&nbsp;

## Installation

In Foundry's **Add-on Modules** screen, click **Install Module** and paste this manifest URL:

```
https://github.com/jeffwain/foundry-vtt-dmm-qol/releases/latest/download/module.json
```

&nbsp;

## Features

### Token HUD

I find that the Token HUD in Foundry is one of the most neglected pieces of the UI. It doesn't scale with your zoom level and often gets in the way or isn't smart enough to stay in view. My take on it tries to improve that behavior.

A replacement for [Illandril's Token HUD Scale](https://github.com/illandril/FoundryVTT-token-hud-scale) in v14. Don't run both, and make sure custom-dnd5e's **Token HUD Improvements** is off. Settings are saved per user.

| Setting | Effect |
|---|---|
| **HUD Button Scale** | Size of the HUD buttons relative to Foundry's default. |
| **Zoom Response** | Keep some scaling while zooming. 100% = Maintain a consistent size, 0% = Foundry's default that doesn't scale with zoom. Default is 70%. |
| **Smallest Size When Zoomed Out** | Smallest size the HUD can shrink to when zoomed out, as a % of its full size. Default is 85%. |
| **1×1 HUD** | Uses a 1x1 token size as the baseline for the HUD instead of the full token size. Mostly makes it easier to use with large tokens. |
| **GM Hover HP Shortcut** | When the GM hovers a token, a small HP tab shows at its bottom right corner. Clicking it opens the full HUD. |

I recommend the following settings in Custom D&D 5e:
- Configure Interface
  - Radial Status Effects → Radial Status Effects on
  - Tokens → Apply Elevation to Selected on
  - Tokens → Toggle Status Effects on Selected on
  - Token Border → Enable, Circle, Thickness 4, do not scale with token.
  - Token Distance → On, Player
  - Token HUD → Token HUD Improvements off (improved in this module)

### Image Folders

Set default folders that the UI will use for browsing, uploading, and searching across Foundry. 
- Set player default folders vs. GM default folders so that players always upload to the right spot
- Integrates with Tidy sheet headers

### Token Image Search

Adds a GM token HUD button that lets you quickly search for and apply token images from on the canvas. If you've ever dropped a token on a map and wanted to quickly change the image without having to mess with prototype updates this one's for you.

I appreciated Token Variant Art's quick application UI for token images, but I didn't use any of the rest of the module. This feature is inspired by TVA and also uses Fuse behind the scenes for fuzzy search, but is limited to token image updates.

- Quick search for token images, honoring wildcarded images
- Choose between token or portraits, pulling from the Images Folders specified above
- Optionally apply dynamic ring art

### Better Custom Fonts

Set up a Data folder for fonts, then apply them to Tidy sheet headers, token nameplates on the canvas, the pause caption, and the X-Card option.

### Customize Sidebar Tabs

Self-explanatory, but turn off the sidebar tabs you don't use (like decks). **Configure Scene Controls** does the same for the top-level buttons in the left-hand scene controls.

### Placeables Tab Clicks

Clicking an entry in the Placeables sidebar tab centers the canvas on it without changing the zoom. Middle-clicking an entry opens its sheet. Each can be turned off in **Configure Sidebar Tweaks**.

### Module Settings Pane

A sidebar addition for module developers and GMs that lets you quickly access module settings or enable/disable modules with fewer steps, bypassing the Settings sidebar pane.

### Group Rolls

Adds *Roll NPCs* and *Roll All* buttons and a row context menu (reset, retroactive advantage/disadvantage, remove) to the D&D 5e system's group roll request cards. I use this with Tidy's group sheet to speed things up. Turn it on or off in **Configure Sidebar Tweaks**.

### Stop Placing Measured Templates

Leaves *Place Measured Template* unchecked by default in dnd5e's activity usage dialog for low-automation games like mine. It confuses players and 90% of the time they don't need it.

### X-Card

Adds a stylized version of John Stavropolous's X-Card safety tools. Look for the X icon at the bottom of the left-hand scene controls. And it cycles through your custom fonts.

### CSS Tweaks

Small CSS tweaks that clean up the interface, like chat spacing and sidebar padding.

&nbsp;

## Disclaimers

Most of the functionality of this module was built with AI assistance. However, it's all been vetted and tested thoroughly by me, even if it's not how I'd personally write it by hand.

&nbsp;

## Credits

- **Token HUD scaling**: based on [Token HUD Scale](https://github.com/illandril/FoundryVTT-token-hud-scale) by Joe Spandrusyszyn (Illandril), MIT.
- **Fuzzy search**: [Fuse.js](https://www.fusejs.io/) by Kiro Risk, Apache-2.0. Licence in `scripts/token-images/vendor/fuse.LICENSE`.
- **X-Card**: safety tool created by John Stavropoulos, inspired by the Foundry XCard module by Richard Bellingham.
- **Token Search**: Inspired by [Token Variant Art](https://github.com/Aedif/TokenVariants) by Aedif.

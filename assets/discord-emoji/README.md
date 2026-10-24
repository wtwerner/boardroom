# Discord symbols

The symbols on Boardroom's Discord posts, uploaded as the bot's own emoji by `pnpm discord:commands` (see `src/lib/icons.ts`). Each is a [Font Awesome Free](https://fontawesome.com) 7 solid icon ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)), 128×128 PNG on a transparent background.

The answers carry the site's meeple colors and first plays the gold of a first play's post; the rest are one grey that reads on Discord's dark and light themes.

| File | Icon | Color |
| --- | --- | --- |
| `going.png` | `circle-check` | `#3e9a5b` |
| `maybe.png` | `circle-question` | `#4a86c8` |
| `declined.png` | `circle-xmark` | `#d33f49` |
| `date.png` | `calendar-days` | `#80868e` |
| `countdown.png` | `hourglass-half` | `#80868e` |
| `place.png` | `location-dot` | `#80868e` |
| `bringing.png` | `box-open` | `#80868e` |
| `playing.png` | `dice` | `#80868e` |
| `vote.png` | `check-to-slot` | `#80868e` |
| `someone.png` | `user-plus` | `#80868e` |
| `edit.png` | `pen-to-square` | `#80868e` |
| `cancelled.png` | `calendar-xmark` | `#80868e` |
| `players.png` | `user-group` | `#80868e` |
| `first.png` | `star` | `#c9960f` |
| `notes.png` | `note-sticky` | `#80868e` |

A file's name is the emoji's name in Discord, and how the play-log parser recognizes a line. To change one, replace the file and delete the old emoji on the app's **Emojis** page in the Developer Portal, then run `pnpm discord:commands` again.

# Meme Soundboard

Meme sound buttons plus a background music player that keeps playing while you press them.
Works in any browser and installs on your phone as an app.

```
meme-soundboard/
├── index.html              the page
├── config.js               ← YOUR BUTTONS AND SONGS (the only file you edit)
├── sounds/
│   ├── memes/              ← put meme MP3s here
│   │   └── get_outchhhh.mp3
│   └── music/              ← put background songs here
├── css/style.css           looks
├── js/app.js               how it works
├── js/synth.js             the 6 built-in sounds and the demo song
├── manifest.webmanifest    makes it installable as an app
├── sw.js                   lets it open offline
└── icons/                  app icons
```

---

## Add a meme sound (one button)

1. Copy your MP3 into **`sounds/memes/`**, for example `vine-boom.mp3`.
2. Open **`config.js`** in any text editor (VS Code, Notepad, TextEdit) and find an empty slot:
   ```js
   { name: "", file: "slot-02.mp3" },
   ```
3. Change it to your file and the label you want on the button:
   ```js
   { name: "Vine Boom", file: "vine-boom.mp3" },
   ```
4. Save and refresh the page. The dashed slot turns into a coloured button.

You get 16 buttons: "Get Outchhhh" plus 15 empty slots. For more, copy any line and change the file name.
Optional colour: `{ name: "Vine Boom", file: "vine-boom.mp3", color: "#8b5cff" },`

**Shortcut:** you can skip editing `config.js` by renaming your file to the slot's name (for example `slot-02.mp3`).
The button works straight away and is labelled "Slot 02" until you give it a name.

## Add a background song

1. Copy the MP3 into **`sounds/music/`**, for example `chill-beat.mp3`.
2. In `config.js`, add a line inside `music: [ ... ]`:
   ```js
   music: [
     { name: "Chill Beat", file: "chill-beat.mp3" },
     { name: "Hype Track", file: "hype-track.mp3" },
   ],
   ```
3. Save and refresh. Tap a song in the music deck and it plays (and loops the playlist) under your memes.

## Rules that save headaches

- The file name in `config.js` must match **exactly**, including capitals and `.mp3`. `Vine-Boom.MP3` is not `vine-boom.mp3`.
- Keep the quotes `" "` and the comma at the end of every line.
- MP3 works everywhere. M4A and WAV work too. Avoid OGG if you use an iPhone.
- If a button stays dashed, the file name doesn't match or the file isn't in `sounds/memes/`.
- Don't want the 6 built-in sounds or the demo song? Set `showStarterSounds: false` / `showDemoMusic: false` in `config.js`.

---

## Run it on your computer

**Quickest:** double-click `index.html`. Everything plays, but installing as an app and offline mode need the next option.

**Proper (local server):** open a terminal in the `meme-soundboard` folder and run

```
python -m http.server 8000
```

(on a Mac use `python3`), then open <http://localhost:8000>.

## Put it on your phone as an app (free, with GitHub Pages)

1. Create a new public repository on GitHub, e.g. `meme-soundboard`.
2. Upload **everything inside** the `meme-soundboard` folder (keep the folders: `sounds/`, `css/`, `js/`, `icons/`).
   On the website: *Add file → Upload files*, then drag the contents in and commit.
3. In the repo go to **Settings → Pages**. Under *Build and deployment*, set *Source* to **Deploy from a branch**,
   pick **main** and **/ (root)**, and click **Save**.
4. After a minute or two your app is live at `https://YOUR-USERNAME.github.io/meme-soundboard/`.
5. Open that link on your phone:
   - **iPhone (Safari):** Share button → **Add to Home Screen**.
   - **Android (Chrome):** ⋮ menu → **Add to Home screen** / **Install app**.

To add more sounds later, upload the new MP3s to `sounds/memes/` (or `sounds/music/`) in the repo and upload your
edited `config.js`. Close and reopen the app and the new buttons appear.

---

## Adding sounds without touching files

Inside the app you can also:

- **Tap an empty slot** to pick an audio file from your phone or computer and put it in that slot.
- Press **Add meme sounds** or **Add songs** to add extra buttons and songs.

These are saved in that browser on that device only. Files in the `sounds/` folder work on every device.

## Using it

- Tap a pad to play it. Tap it again to restart it. Pads can overlap unless you tick **One sound at a time**.
- **Stop memes** (or Esc) silences all meme sounds. The music keeps going.
- **Lower the music while a meme plays** turns the song down while a meme plays.
- **Edit buttons** lets you rename, recolour or hide any pad.
- Keyboard: `1`–`0` and `Q`–`M` play the pads in order, Space plays or pauses the music.

## Troubleshooting

- **No sound on iPhone:** check the silent switch on the side of the phone.
- **Changes don't show:** refresh the page. For the installed app, close it fully and reopen it.
- **A song is listed in `config.js` but not in the playlist:** the file isn't in `sounds/music/` or the name doesn't match.
  The browser console lists missing songs.

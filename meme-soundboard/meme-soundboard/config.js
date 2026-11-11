/*
  =====================================================================
   MEME SOUNDBOARD — your buttons and songs live in this file
  =====================================================================

   HOW TO ADD A MEME SOUND
   1. Put the MP3 in the folder  sounds/memes/
   2. Pick an empty slot below and put the file name and button name in it:
          { name: "Vine Boom", file: "vine-boom.mp3" },
   3. Save this file and refresh the page.

   HOW TO ADD A SONG (background music)
   1. Put the MP3 in the folder  sounds/music/
   2. Add a line to the music list at the bottom:
          { name: "Chill Beat", file: "chill-beat.mp3" },
   3. Save and refresh.

   Rules
   - The file name must match exactly, including capitals and ".mp3".
   - Keep the quotes and the comma at the end of every line.
   - A slot whose file isn't in the folder shows as an empty dashed button.
   - Want more than 16 buttons? Copy a line and give it a new file.
   - color is optional. Use any CSS color, e.g. color: "#2f86ff"
*/

window.SOUNDBOARD_CONFIG = {
  title: "Meme Soundboard",

  // The 6 built-in sounds (Air Horn, Boom, Sad Trombone...). Set to false to hide them.
  showStarterSounds: true,

  // The built-in "Lo-fi Loop (demo)" song. Set to false to hide it.
  showDemoMusic: true,

  // ---------------- MEME BUTTONS (files go in sounds/memes/) ----------------
  memes: [
    { name: "Get Outchhhh", file: "get_outchhhh.mp3", color: "#ff5a36" },
    { name: "", file: "slot-02.mp3" },
    { name: "", file: "slot-03.mp3" },
    { name: "", file: "slot-04.mp3" },
    { name: "", file: "slot-05.mp3" },
    { name: "", file: "slot-06.mp3" },
    { name: "", file: "slot-07.mp3" },
    { name: "", file: "slot-08.mp3" },
    { name: "", file: "slot-09.mp3" },
    { name: "", file: "slot-10.mp3" },
    { name: "", file: "slot-11.mp3" },
    { name: "", file: "slot-12.mp3" },
    { name: "", file: "slot-13.mp3" },
    { name: "", file: "slot-14.mp3" },
    { name: "", file: "slot-15.mp3" },
    { name: "", file: "slot-16.mp3" },
  ],

  // ---------------- BACKGROUND SONGS (files go in sounds/music/) ----------------
  music: [
    // { name: "My Song", file: "my-song.mp3" },
  ],
};

# crunchyroll-dl

<div>
  <a href="https://npmjs.org/package/crunchyroll-dl">
    <img src="https://badgen.now.sh/npm/v/crunchyroll-dl" alt="version" />
  </a>
  <a href="https://npmjs.org/package/crunchyroll-dl">
    <img src="https://badgen.now.sh/npm/dm/crunchyroll-dl" alt="downloads" />
  </a>
</div>

A fast, modern, and beautiful Crunchyroll downloader.

Downloads the Crunchyroll videos with the subtitles hardcoded/hardsubbed, and the outputted files will be in `.mp4`.

## Features
- Download an entire series or just a single episode
  - Specify which seasons to download from a series (or download them all)
  - Specify which episodes to download
- Use the USA library of Crunchyroll (unblock)
- Specify download resolution
- Custom output of file names
- Colourful user interface

### Requirements
- [node.js](https://nodejs.org) 8+
- [ffmpeg](https://www.ffmpeg.org/)

### Installation
`npm install -g crunchyroll-dl`

## CLI Options
**Authentication**
- `--username`, `-u` username/email
- `--password`, `-p` password
- `--unblocked` use a USA Crunchyroll session (default: `false`)

**Downloading**
- `--input`, `-i` (required) the episode/series to download
- `--language`, `-l` the language to download (default: `enUS`, see below for other options)
- `--quality`, `-q` the quality/resolution to download (default: `auto`)
- `--dont-autoselect-quality` don't automatically select quality if requested is not available (i.e. if 1080p was specified and is not available, fail)
- `--download-all`, `-a` download all collections (no dialog)
- `--ignore-dubs` attempt to ignore dubs
- `--episodes`, `-e` episode ranges
  - examples
    - `--episodes 1-2,12-15,18-20`
    - `-e 1,3,5,7`
- `--output`, `-o` the output file name (default: `:name Episode :ep [:resolution]`)
  - can use components to customize
    - `:name` name of collection
    - `:epname` name of episode
    - `:resolution` resolution of the video
    - `:ep` the episode number
    - `:series` the series name

**Help**
- `--help`, `-h` help
- `--version`, version
- `--debug`, debug information
- `--list`, list the episodes of a series (only works with series, will exit after)

## Examples
`crunchyroll-dl -i https://www.crunchyroll.com/my-hero-academia/episode-1-izuku-midoriya-origin-730707 -u username -p password --unblocked -o ":epname [:resolution]"`

`crunchyroll-dl -i https://www.crunchyroll.com/my-hero-academia`

`crunchyroll-dl -i https://www.crunchyroll.com/rezero-starting-life-in-another-world- --ignore-dubs --download-all --episodes 1A,1B,2-15`

### Languages
The possible languages are as follows, the default is `enUS`

`enUS` - English (US)\
`enGB` - English (UK)\
`esLA` - Español\
`esES` - Español (España)\
`ptBR` - Português (Brasil)\
`ptPT` - Português (Portugal)\
`frFR` - Français (France)\
`deDE` - Deutsch\
`itIT` - Italiano\
`ruRU` - Русский\
`arME` - العربية

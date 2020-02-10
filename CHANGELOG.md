## 2.0.0
- Soft sub support
  - The downloader now supports the download of soft-subbed videos or hard-subbed videos
    - Use `-s soft` while downloading to specify you want soft-subbed videos
    - The videos will begin downloading in a tmp folder. This will be automatically deleted after the download is completed.
      - `--noCleanup` can be specified to not clean this folder up.
      - `--mux` can be specified to not mux the files together after download. This will enable `--noCleanup` as well.
    - Multiple languages can be specified in the `--language` parameter if using soft subtitles, separated with commas
    - See README.md for examples using these new options
- Fix a bug where the downloader can no longer authenticate with Crunchyroll

## 1.3.6
- Avert compilation error with the dependencies

## 1.3.5
- Download without subtitles
  - `--language=none`
  - This update add an experimental feature which allows you to download the videos without subtitles
    - If this goes well and there is ample demand, I will look into adding softsub functionality to this downloader as well!
- Better automatic quality selection

## 1.3.4
- Rely on the resolutions provided by CR rather than a hardcoded array
- Slight wording changes
- Update README with `--list`

## 1.3.3
- Allow for `Dubbed` and `Dub` to be ignored
- Fixed bug with PVs / videos without streams and/or titles

## 1.3.2
- Hotfix colour

## 1.3.1
- Add `--list`
  - Will list all the collections and episodes selected and quit
- Alias `--download-all` to `-a`
- Alias `--episodes` to `-e`
- Fix a problem with single episodes and `--episodes`

## 1.3.0
- `--episodes`
- `--dont-autoselect-quality`
- `--download-all`
- `--ignore-dubs`
- `:series` in the output filename for the series name
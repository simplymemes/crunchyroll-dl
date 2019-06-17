const fs = require('fs')
const path = require('path')
const mkdirp = require('mkdirp')
const langs = require('langs')

const { info, warn, error, debug: logDebug } = require('./log')

const ffmpeg = require('fluent-ffmpeg')
const { exec } = require('child-process-async');

const { Container } = require('crunchyroll-lib/utils/container')
const { NodeHttpClient } = require('crunchyroll-lib/services/http/NodeHttpClient')
const { Media } = require('crunchyroll-lib/resolvers/media/Media')
const { Config } = require('crunchyroll-lib/resolvers/media/Config')
const { DOMParser } = require('crunchyroll-lib/services/xml/DOMParser')
const { SubtitleResolver } = require('crunchyroll-lib/resolvers/SubtitleResolver')

const { stripIndent, oneLine } = require('common-tags')

const container = new Container()
container.bind('ISubtitleResolver', SubtitleResolver)
container.bind('IHttpClient', NodeHttpClient)

module.exports.getMedia = async (xmlData) => {
  const doc = await (new DOMParser()).parseFromString(xmlData)
  const body = doc.getFirstElement()

  if (!body) {
    return false
  }

  const media = new Media(new Config(body), container.get('ISubtitleResolver'))

  return media
}

// based on youtube-dl's implementation
module.exports.toASS = (xml) => {
  let output = stripIndent`
    [Script Info]
    Title: ${xml.title}
    ScriptType: +4.00+
    WrapStyle: ${xml.wrapStyle}
    PlayResX: ${xml.playResX}
    PlayResY: ${xml.playResY}

    [V4+ Styles]
    Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
  `

  output += '\n'

  const styles = xml.styles
  
  for (let style of styles) {
    const properties = [
      'fontName',
      'fontSize',
      'primaryColour',
      'secondaryColour',
      'outlineColour',
      'backColour',
      'bold',
      'italic',
      'underline',
      'strikeout',
      'scaleX',
      'scaleY',
      'spacing',
      'angle',
      'borderStyle',
      'outline',
      'shadow',
      'alignment',
      'marginL',
      'marginR',
      'marginV',
      'encoding'
    ]

    const parts = properties.map((prop) => style[prop]).join(',')
    const addition = `Style: ${parts}\n`

    output += addition
  }

  output += '\n'

  output += stripIndent`
    [Events]
    Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
  `

  output += '\n'

  const events = xml.events

  for (let event of events) {
    const properties = [
      'start',
      'end',
      'style',
      'name',
      'marginL',
      'marginR',
      'marginV',
      'effect',
      'text'
    ]

    const parts = properties.map((prop) => event[prop]).join(',')
    const addition = `Dialogue: 0,${parts}\n`

    output += addition
  }

  return output
}

module.exports.downloadSubs = async (fileDir, subtitles) => {
  let downloaded = []

  mkdirp.sync(fileDir)

  for (let subtitle of subtitles) {
    let langCode = subtitle.locale.replace('-', '')

    const filePath = path.join(fileDir, `${langCode}.ass`)
    const ass = this.toASS(subtitle)
 
    fs.writeFileSync(filePath, ass)

    let ISO6392T = langs.where('1', langCode.substring(0, 2))['2T']

    downloaded.push({
      path: filePath,
      title: subtitle.title,
      language: ISO6392T,
    })
  }

  return downloaded
}

module.exports.mux = async (subs, input, output, debug = false) => {
  const command = oneLine`
    mkvmerge
    --output "${output.replace('.mp4', '.mkv')}"
    "${input}"
    ${subs
      .map(sub =>
        `--track-name "0:${sub.title}" --language 0:${sub.language} --default-track 0:no --sub-charset 0:utf-8 "${sub.path}"`
      )
      .join(' ')
    }
  `

  const proc = await exec(command, {})

  if (debug) {
    logDebug(`mkv merge: ${command}`)
  }

  return

  return new Promise((resolve, reject) => {
    let cmd = ffmpeg(input)
      .on('start', (command) => {
        info('Beginning download...')
        if (debug) {
          info(`Muxing with command: ${command}`)
        }
      })
      .on('progress', function(progress) {
        bar((progress.percent || 0).toFixed(2), progress.currentFps, progress.timemark, 'Muxing')
      })
      .on('error', error => {
        reject(new Error(error))
      })
      .on('end', () => {
        process.stderr.write('\n') // newline
        info(`Successfully muxed "${output}"`)
        resolve()
      })
      .outputOptions(
        '-c', 'copy',
        '-map', '0:v',
        '-map', '0:a'
      )

      for (let i = 0; i < subs.length; i++) {
        let subtitle = subs[i]

        cmd.addInput(subtitle.path).withOutputOptions(
          `-map`, i + 1,
          `-metadata:s:s:${i}`, `title=${subtitle.title}`,
          `-metadata:s:s:${i}`,`language=${subtitle.language}`,
          `-disposition:s:${i}`, `${i === 0 ? 'default' : '0'}`
        )
      }

      cmd.output(output)

      cmd.run()
  })
}

#!/usr/bin/env node

const yargs = require('yargs')
const prompts = require('prompts')
const axios = require('axios')
const uuid = require('uuid')
const FormData = require('form-data')
const cloudscraper = require('cloudscraper')

const sanitize = require('sanitize-filename')
const ffmpeg = require('fluent-ffmpeg')
const m3u8Parser = require('m3u8-parser')

const { info, warn, error, debug: logDebug } = require('./lib/log')
const bar = require('./lib/bar')
const tree = require('./lib/tree')

const { version } = require('./package.json')

let argv = yargs
  .usage('Usage: $0 [options]')

  // login
  .describe('username', 'Your username or email')
  .alias('u', 'username')
  .describe('password', 'Your password')
  .alias('p', 'password')

  // input
  .describe('input', 'The URL for the Crunchyroll show')
  .alias('i', 'input')

  .describe('quality', 'The quality of the stream (Will choose what is specified, or the next best quality)')
  .choices('quality', ['240p', '360p', '480p', '720p', '1080p', 'auto'])
  .default('quality', 'auto', 'Automatically choose the quality')
  .alias('q', 'quality')

  .describe('dont-autoselect-quality', 'Don\'t automatically select the quality if the specified one is not available')
  .boolean('dont-autoselect-quality')

  .describe('download-all', 'Download from all available collections')
  .boolean('download-all')
  .alias('a', 'download-all')

  .describe('ignore-dubs', 'Attempt to ignore any dubs for the show')
  .boolean('ignore-dubs')

  .describe('episodes', 'A range of episodes to download')
  .default('episodes', 'all')
  .alias('e', 'episodes')

  .describe('list', 'List all episodes and collection from the collection(s), and quit')
  .boolean('list')

  .describe('language', 'The language of the episode subtitles')
  .choices('language', ['enUS', 'enGB', 'esLA', 'esES', 'ptBR', 'ptPT', 'frFR', 'deDE', 'itIT', 'ruRU', 'arME'])
  .default('language', 'enUS')
  .alias('l', 'language')

  // output
  .describe('output', 'The output of the file for the video file')
  .default('output', ':name Episode :ep [:resolution]')
  .alias('o', 'output')

  .describe('unblocked', 'Use the USA library of Crunchyroll')
  .boolean('unblocked')

  .describe('debug', 'Prints debug information to the log')
  .boolean('debug')

  // help
  .describe('h', 'Shows this help')
  .alias('h', 'help')
  .boolean('h')

  .demandOption(['input'], 'Please specify an input')
  .help()
  .version()
  .argv

let sessionId = null
let expires = new Date()
let authed = false
let premium = false

const { input, username, password, quality, unblocked, language, debug, list } = argv
const autoselectQuality = !argv['dont-autoselect-quality']
const downloadAll = argv['download-all']
const ignoreDubs = argv['ignore-dubs']
const episodeRanges = argv['episodes'].toString()

// instance for further crunchyroll requests
const instance = axios.create({
  baseURL: 'https://api.crunchyroll.com/'
})

// some default params
const baseParams = {
  locale: language,
  version: '2.1.6'
}

const main = async () => {
  info(`crunchyroll-dl v${version}`)

  // adapted from https://github.com/Xonshiz/anime-dl/blob/master/anime_dl/sites/crunchyroll.py#L50-L51
  const seriesRegex = /https?:\/\/(?:(www|m)\.)?(crunchyroll\.com(\/[a-z]{2}|\/[a-z]{2}-[a-z]{2})?\/([\w\-]+))\/?(?:\?|$)/
  const episodeRegex = /https?:\/\/(?:(www|m)\.)?(crunchyroll\.(?:com|fr)(\/[a-z]{2}|\/[a-z]{2}-[a-z]{2})?\/(?:media(?:-|\/\?id=)|[^/]*\/[^/?&]*?)([0-9]+))(?:[/?&]|$)/

  let series = seriesRegex.test(input)
  let episode = episodeRegex.test(input)
  if (!series && !episode) {
    error('Invalid Crunchyroll URL input')
    process.exit(1)
  }

  if (list && !series) {
    error('You can only list the episodes and collections from a series!')
    process.exit(1)
  }

  authed = username && password

  // start session, either unblocked or blocked
  if (unblocked) {
    try {
      const { data: { data: unblockedSessionData } } = await axios.get('https://api2.cr-unblocker.com/start_session', {
        params: {
          device_id: uuid(),
          version: '1.1'
        }
      })

      if (unblockedSessionData) {
        sessionId = unblockedSessionData.session_id
        info('Successfully initiated USA Crunchyroll session')
      }
    } catch (e) {
      if (debug) {
        logDebug(`Error: ${e.response}`)
      }
      error('Something went wrong when creating an unblocked session.')
      process.exit(1)
    }
  } else {
    const { data: { data: sessionData } } = await crunchyrollRequest('get', 'start_session.0.json', {
      params: {
        access_token: 'Scwg9PRRZ19iVwD',
        device_type: 'com.crunchyroll.crunchyroid',
        device_id: uuid(),
        ...baseParams
      }
    })
  
    sessionId = sessionData.session_id
  }
    
  if (authed) {
    info('Attempting to login...')
    // login
    const loginForm = new FormData()
    loginForm.append('account', argv.username)
    loginForm.append('password', argv.password)
    loginForm.append('session_id', sessionId)
    loginForm.append('locale', baseParams.locale)
    loginForm.append('version', baseParams.version)

    const loginResponse = await crunchyrollRequest('post', 'login.0.json', loginForm, {
      headers: loginForm.getHeaders()
    })
    
    if (loginResponse.data.error) {
      error(loginResponse.data.message)
      process.exit(1)
    }
    info('Successfully logged in!')

    expires = new Date(loginResponse.data.data.expires)

    if (loginResponse.data.data.user.premium.includes('anime')) {
      info('Logged in with a premium account.')
      premium = true
    }

    if (debug) {
      logDebug(`Current session expires on ${expires}`)
    }
  }

  const getEpisode = async (mediaId, epData = null) => {
    info('Attempting to fetch episode...')
    const episodeStreams = await crunchyrollRequest('get', 'info.0.json', {
      params: {
        session_id: sessionId,
        fields: 'media.stream_data,media.media_id',
        media_id: mediaId,
        locale: language,
        ...baseParams
      }
    })
    
    if (episodeStreams.data.error) {
      error(episodeStreams.data.message)
    } else {
      const streams = episodeStreams.data.data.stream_data.streams

      if (debug) {
        logDebug(`Found ${streams.length} streams`)
      }

      // fetch data about the episode if needed
      let episodeData = epData
      if (!episodeData) {
        ({ data: { data: episodeData } } = await crunchyrollRequest('get', 'info.0.json', {
          params: {
            session_id: sessionId,
            fields: 'media.media_id,media.collection_id,media.collection_name,media.series_id,media.episode_number,media.name,media.series_name,media.description,media.premium_only',
            media_id: mediaId,
            locale: language,
            ...baseParams
          }
        }))
      }

      if (episodeData.premium_only && !premium) {
        warn(`Skipping "${episodeData.name}" due to it being for premium members only. (Ep ${episodeData.episode_number})`)
        return
      }

      if (streams.length === 0) {
        warn('You may not have access to watch this episode')
        return
      }

      // convert to number, handle auto
      let qualityResolution = quality.replace('p', '')
      if (qualityResolution === 'auto') qualityResolution = 1080
      qualityResolution = Number(qualityResolution)

      // download from the adaptive stream
      const stream = streams[0].url

      if (debug) {
        logDebug(`Fetching m3u8 from: ${stream}`)
      }

      const m3u8 = await axios.get(stream) // fetch the m3u8
      const m3u8Data = parsem3u8(m3u8.data)

      if (m3u8Data.playlists.length) {
        let resolution = Number(qualityResolution) // get the actual resolution wanted as a number

        const qualities = [ 240, 360, 480, 720, 1080 ]
        let availableResolutions = m3u8Data.playlists
          .map((playlist) => playlist['attributes']['RESOLUTION']['height'])
          .filter((value, index, arr) => index === arr.indexOf(value)) // remove dupes
          .sort((a, b) => a - b) // sort in decending order

        let availableResolutionsString = `Available resolutions: ${availableResolutions.join('p, ')}p`

        if (debug) {
          logDebug(availableResolutionsString)
        }

        if (!autoselectQuality && !availableResolutions.includes(resolution)) {
          info(`Could not find resolution (${qualityResolution}p) specified, not falling back`)
          info(availableResolutionsString)
          return
        }

        while (!availableResolutions.includes(resolution) && qualities.indexOf(resolution) > 0) {
          resolution = qualities[qualities.indexOf(resolution) - 1] // keep get the resolution to the left of the resolution wanted
        }

        if (!availableResolutions.includes(resolution)) {
          error('Could not find any resolution?!')
          return
        }

        if (qualityResolution !== resolution && quality !== 'auto') info(`Downloading in ${resolution}p, as ${qualityResolution}p was not available.`)
        
        let output = argv.output
          .replace(':series', episodeData.series_name)
          .replace(':name', episodeData.collection_name)
          .replace(':epname', episodeData.name)
          .replace(':ep', episodeData.episode_number || `(${episodeData.name})`)
          .replace(':resolution', `${resolution}p`)
        output = `${sanitize(output)}.mp4`
        info(`Downloading episode as "${output}"`)
        
        for (let playlist of m3u8Data.playlists) {
          if (playlist['attributes']['RESOLUTION']['height'] === resolution) {
            if (debug) {
              logDebug(`Downloading stream from: ${playlist['uri']}`)
            }
            await downloadEpisode(playlist['uri'], output)
            return
          }
        }
        warn('The resolution specified was not found')
      } else {
        warn('No streams found')
      }
    }
  }

  if (episode) {
    let match = input.match(episodeRegex)
    let mediaId = match[4] // the match group

    await getEpisode(mediaId)
  }

  if (series) {
    info('Attempting to fetch series...')

    const cloudflareBypass = (uri) => {
      return new Promise((resolve, reject) => {
        cloudscraper.get({ uri }, (err, res) => {
          if (!err) {
            resolve(res)
          } else {
            reject(err)
          }
        })
      })
    }
    
    // grab the page
    let page = null
    try {
      if (debug) {
        logDebug(`Attempting to fetch ${input}`)
      }

      let url = input
      // remove any trailing / if there are any
      if (url[url.length - 1] === '/') url = url.substring(0, url.length - 1)
      // skip any maturity walls if there are any...
      url += '?skip_wall=1'

      let response = await cloudflareBypass(url)
      if (response.statusCode !== 200) {
        throw new Error(`Error: Status code ${response.statusCode}`)
      } else {
        page = response.body
      }
    } catch (e) {
      error(`Error fetching series: ${e.message || 'Something went wrong'}`)
      if (e.errorType === 1) {
        error('Cannot solve CAPTCHA automatically! Please try again later.')
      }
      await cleanup()
    }
    const idDivRegex = /<div class="show-actions" group_id="(.*)"><\/div>/ // search for a div with an id

    const seriesId = page.match(idDivRegex)[1]
    if (!seriesId) {
      error('Series not found')
      process.exit(1)
    }

    // grab the collections for the show
    const { data: { data: collections } } = await crunchyrollRequest('get', 'list_collections.0.json', {
      params: {
        session_id: sessionId,
        series_id: seriesId,
        limit: 1000,
        offset: 0
      }
    })

    if (!collections || !collections.length) {
      error('No collections found! This series may be blocked in your area.')
      if (!authed) {
        error('This series may also be for mature audiences! Try logging in with an account with mature content enabled.')
      }
      process.exit(1)
    }

    let filteredCollections = collections
    // attempt to ignore dubs
    if (ignoreDubs) {
      const languages = ['RU']
      filteredCollections = collections.filter((collection) => !(
        // check if there is (x Dub) or (Dub) there
        /\((.*)?Dub(bed)?\)/.test(collection.name) ||
        // check if it contains a two letter language string, like the ones above
        languages.find((language) => collection.name.includes(`(${language})`)) !== undefined
      ))

      if (debug) {
        logDebug(`Filtered collections: "${filteredCollections.map((collection) => collection.name).join('"," ')}"`)
      }
    }

    let choices = filteredCollections.map((collection) => ({title: collection.name, value: collection.collection_id}))

    let selectedCollections = []

    if (!downloadAll) {
      ({ value: selectedCollections = [] } = await prompts({
        type: 'multiselect',
        name: 'value',
        message: 'Which collections would you like to download?',
        choices,
        hint: '- Space to select. Return to submit'
      }))
    } else {
      info(`Downloading all collections: "${choices.map(({ title }) => title).join('"," ')}"`)
      // all of them
      selectedCollections = choices.map(({ value }) => value)
    }

    // grab all the collections
    const collectionDataPromises = selectedCollections.map(async (id) => {
      let { data: { data: collectionMedia } } = await crunchyrollRequest('get', 'list_media.0.json', {
        params: {
          session_id: sessionId,
          collection_id: id,
          include_clips: 0,
          limit: 1000,
          offset: 0,
          fields: 'media.media_id,media.collection_id,media.collection_name,media.series_id,media.episode_number,media.name,media.series_name,media.description,media.premium_only',
          ...baseParams
        }
      })
      return { name: collectionMedia[0] && collectionMedia[0].collection_name, id, data: collectionMedia }
    })
    const collectionData = await Promise.all(collectionDataPromises)

    if (list) {
      tree(collectionData)
      process.exit(1)
    }

    // conditionally cast if a number
    const castNumIfNum = (val) => !isNaN(val) ? Number(val) : val

    // concat all the episodes into one neat and tidy array
    const episodeNumbers = [].concat(...collectionData.map((collection) =>
      collection.data.map(({ episode_number }) => castNumIfNum(episode_number))
    ))

    let desiredEpisodeNumbers = episodeRanges.split(',').reduce((acc, val) => {
      // split by "-"'s
      const bounds = val.split('-')
      if (bounds.length === 1) {
        acc.push(val)
      } else {
        // ensure both numbers
        if (!isNaN(bounds[0]) && !isNaN(bounds[1])) {
          const min = Number(bounds[0])
          const max = Number(bounds[1])
          if (min < max) {
            for (let i = min; i <= max; i++) acc.push(i)
          } else {
            error('Minimum value for episode range must be greater than the max!')
            process.exit(1)
          }
        } else {
          error('Episode range must be only numbers!')
          process.exit(1)
        }
      }
      return acc
    }, []).map(castNumIfNum)

    // download everything
    if (episodeRanges.toLowerCase() === 'all') desiredEpisodeNumbers = episodeNumbers

    // check if all episodes are available, get the subset
    const allDesiredEpisodesAvailable = desiredEpisodeNumbers.every((num) => episodeNumbers.includes(num))
    const episodeDiff = desiredEpisodeNumbers.filter((num) => !episodeNumbers.includes(num))
    
    if (!allDesiredEpisodesAvailable) {
      error(`Could not find the following episodes from the collections requested: ${episodeDiff.join(', ')}`)
      info(`Available episodes: ${episodeNumbers.join(', ')}`)
      process.exit(1)
    }

    for (let { name, data } of collectionData) {
      info(`Beginning to download "${name}"`)
      for (let media of data) {
        // don't download unwanted episodes
        if (!desiredEpisodeNumbers.includes(castNumIfNum(media.episode_number))) {
          continue
        }
        info(`Downloading episode ${media.episode_number || '(not set)'}, "${media.name}", of "${name}"`)
        await getEpisode(media.media_id, media)
      }
    }
  }

  info('Done!')
  await cleanup()
}

const cleanup = async (logout = true, exit = true, log = true) => {
  if (authed && logout) {
    if (log) {
      info('Logging out...')
    }
    // logout
    const logoutForm = new FormData()
    logoutForm.append('session_id', sessionId)
    logoutForm.append('locale', baseParams.locale)
    logoutForm.append('version', baseParams.version)

    await crunchyrollRequest('post', 'logout.0.json', logoutForm, {
      headers: logoutForm.getHeaders()
    })
    authed = false
  }
  if (exit) {
    process.exit(1)
  }
}

process.on('SIGINT', async () => {
  await cleanup()
})
process.on('exit', async () => {
  await cleanup()
})

const crunchyrollRequest = async (method, ...args) => {
  try {
    return await instance[method](...args)
  } catch (e) {
    if (debug) {
      logDebug(`Error: ${e.response}`)
    }
    error('Something went wrong when contacting Crunchyroll. They may be down.')
    process.exit(1)
  }
}

const parsem3u8 = (manifest) => {
  let parser = new m3u8Parser.Parser()

  parser.push(manifest)
  parser.end()
  return parser.manifest
}

const downloadEpisode = (url, output) => {
  return new Promise((resolve, reject) => {
    ffmpeg(url)
      .on('start', () => {
        info('Beginning download...')
      })
      .on('progress', function(progress) {
        bar((progress.percent || 0).toFixed(2), progress.currentFps, progress.timemark)
      })
      .on('error', error => {
        reject(new Error(error))
      })
      .on('end', () => {
        process.stderr.write('\n') // newline
        info(`Successfully downloaded "${output}"`)
        resolve()
      })
      .outputOptions('-c copy')
      .output(output)
      .run()
  })
}

main()


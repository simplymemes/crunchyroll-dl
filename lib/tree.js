const treeify = require('treeify')
const c = require('ansi-colors')

module.exports = (collectionData) => {
  let seriesName = null

  // the collections
  let tree = collectionData.reduce((acc, val) => {
    // each episode
    acc[c.yellow(val.name)] = val.data.reduce((acc, val) => {
      if (!seriesName && val.series_name) seriesName = val.series_name
      acc[`#${c.bold(val.episode_number || '(none)')} ${c.green(val.name)}`] = null
      return acc
    }, {})
    return acc
  }, {})

  // wrap with the entire series name
  tree = { [c.yellow(seriesName)]: tree }

  // print
  console.log(
    treeify.asTree(tree, true)
  )
}
 
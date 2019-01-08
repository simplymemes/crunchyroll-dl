const c = require('ansi-colors')

const logging = {
  info: (s) =>
    console.log(`${c.bold.cyan('i')} ${c.bold(s)}`),
  error: (s) =>
    console.log(`${c.bold.red('!')} ${c.bold(s)}`),
  warn: (s) =>
    console.log(`${c.bold.yellow('!')} ${c.bold(s)}`)
}

module.exports = logging

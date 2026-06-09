function write(level, event, fields = {}) {
  console.log(JSON.stringify({
    time: new Date().toISOString(),
    level,
    event,
    ...fields,
  }));
}

module.exports = {
  info: (event, fields) => write('info', event, fields),
  warn: (event, fields) => write('warn', event, fields),
  error: (event, fields) => write('error', event, fields),
};

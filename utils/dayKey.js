'use strict';

function utcDayKey(date = new Date()) {
  return Math.floor(new Date(date).getTime() / 86400000);
}

module.exports = { utcDayKey };
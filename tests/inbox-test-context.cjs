'use strict';
// Focused source-extraction tests model the ordinary unenrolled editor. Full
// ownership and denial behavior is tested separately against the real bootstrap.
const vm = require('node:vm');
module.exports = function createUnenrolledContext(sandbox = {}, options) {
  const context = {
    recordingInboxCanWrite: () => true,
    recordingInboxBeforeBoot: async () => true,
    recordingInboxAdmitWriter: () => () => {},
    enterRecordingInboxEditor: () => () => {},
    // Transport-only extracted functions mock the independent read preflight.
    // publication-preservation.test.cjs and full browser tests use its real body.
    verifyPublicationSnapshot: async () => {},
    automaticBackupBeforeEdit: async () => true,
    ...sandbox,
  };
  if (!('recordingInboxStorageSet' in context)) context.recordingInboxStorageSet = (key, value) => context.localStorage.setItem(key, value);
  if (!('recordingInboxStorageRemove' in context)) context.recordingInboxStorageRemove = key => context.localStorage.removeItem(key);
  const result = vm.createContext(context, options);
  const source = require('node:fs').readFileSync(__dirname + '/../app.js','utf8');
  for (const name of ['groupDisplayName','privateDeliveryGroup','groupedPerformanceHTML']) {
    const start = source.indexOf('function ' + name + '(');
    vm.runInContext(source.slice(start, source.indexOf('\n}',start)+2), result);
  }
  return result;
};

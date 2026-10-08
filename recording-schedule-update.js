/* Narrow, atomic recording-plan edits. This module contains no production data.
 * apply(state, packet) never mutates either argument. Only named member slots'
 * at/min and explicitly named slots' scheduleTimeUnconfirmed can change.
 * Missing IDs are reported in skipped; all known conflicts throw before copying.
 * The caller must show skipped entries in its preview and confirm the partial
 * selection before saving. No receipt, archive, inferred break, or ordering edit
 * is written. An exact repeat returns the original state object.
 */
(function (root) {
  'use strict';
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const expectedKeys = ['name', 'day', 'date', 'at', 'min', 'kind', 'place'];
  const identityKeys = ['name', 'day', 'date', 'kind', 'place'];
  const unsafeKeys = new Set(['__proto__', 'prototype', 'constructor']);
  const MAX_TARGETS = 500, MAX_SLOTS = 50000;

  function fail(code, slotId, otherId) {
    const error = new Error(code);
    error.code = code;
    if (slotId !== undefined) error.slotId = slotId;
    if (otherId !== undefined) error.otherId = otherId;
    throw error;
  }
  function object(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const proto = Object.getPrototypeOf(value);
    if (proto === null) return true;
    const constructor = Object.getOwnPropertyDescriptor(proto, 'constructor');
    return Object.getPrototypeOf(proto) === null && constructor && own(constructor, 'value')
      && typeof constructor.value === 'function' && constructor.value.name === 'Object';
  }
  function shape(value, required, optional = []) {
    if (!object(value)) fail('INVALID_PACKET');
    const allowed = new Set([...required, ...optional]);
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (typeof key !== 'string' || unsafeKeys.has(key) || !allowed.has(key) || !descriptor.enumerable || !own(descriptor, 'value')) fail('INVALID_PACKET');
    }
    if (required.some(key => !own(value, key))) fail('INVALID_PACKET');
  }
  function list(value) {
    if (!Array.isArray(value) || value.length > MAX_TARGETS) fail('INVALID_PACKET');
    for (const key of Reflect.ownKeys(value)) {
      if (key === 'length') continue;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length || !descriptor.enumerable || !own(descriptor, 'value')) fail('INVALID_PACKET');
    }
    for (let i = 0; i < value.length; i++) if (!own(value, i)) fail('INVALID_PACKET');
  }
  function string(value, max, allowEmpty = false) {
    return typeof value === 'string' && value.length <= max && (allowEmpty || value.trim().length > 0) && !/[\x00-\x1f\x7f]/.test(value);
  }
  function time(value) {
    return Number.isInteger(value.at) && value.at >= 0 && value.at < 2880
      && Number.isInteger(value.min) && value.min > 0 && value.min <= 1440 && value.at + value.min <= 2880;
  }
  function dateParts(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [year, month, day] = value.split('-').map(Number);
    if (year < 1900 || year > 9999 || month < 1 || month > 12) return null;
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return day >= 1 && day <= last ? {year, month, day} : null;
  }
  function dayParts(value) {
    if (typeof value !== 'string' || !/^\d{1,2}\/\d{1,2}$/.test(value)) return null;
    const [month, day] = value.split('/').map(Number);
    return month >= 1 && month <= 12 && day >= 1 && day <= 31 ? {month, day} : null;
  }
  function expectation(value, year) {
    shape(value, expectedKeys);
    const date = dateParts(value.date), day = dayParts(value.day);
    if (!string(value.name, 200) || !string(value.place, 1000, true) || !date || !day
        || date.month !== day.month || date.day !== day.day || !time(value)
        || !['member', 'break'].includes(value.kind)) fail('INVALID_PACKET');
    if (year !== undefined && date.year !== year) fail('YEAR_MISMATCH');
  }
  function validate(packet) {
    shape(packet, ['app', 'version', 'id', 'updates'], ['year', 'timezone', 'unconfirmed']);
    if (packet.app !== 'utacheck-recording-schedule-update' || packet.version !== 1 || !string(packet.id, 200)) fail('INVALID_PACKET');
    if (own(packet, 'year') && (!Number.isInteger(packet.year) || packet.year < 1900 || packet.year > 9999)) fail('INVALID_PACKET');
    if (own(packet, 'timezone')) {
      if (!string(packet.timezone, 100) || !/^[A-Za-z_+\-]+(?:\/[A-Za-z0-9_+\-]+)*$/.test(packet.timezone)) fail('INVALID_PACKET');
      try { new Intl.DateTimeFormat('en', {timeZone:packet.timezone}); } catch (_) { fail('INVALID_PACKET'); }
    }
    list(packet.updates);
    if (own(packet, 'unconfirmed')) list(packet.unconfirmed);
    const unconfirmed = packet.unconfirmed || [];
    if ((!packet.updates.length && !unconfirmed.length) || packet.updates.length + unconfirmed.length > MAX_TARGETS) fail('INVALID_PACKET');
    const ids = new Set();
    for (const [entries, update] of [[packet.updates, true], [unconfirmed, false]]) {
      for (const entry of entries) {
        shape(entry, update ? ['id', 'expected', 'next'] : ['id', 'expected']);
        if (!string(entry.id, 200)) fail('INVALID_PACKET');
        if (ids.has(entry.id)) fail('DUPLICATE_TARGET', entry.id);
        ids.add(entry.id);
        expectation(entry.expected, packet.year);
        if (update) {
          shape(entry.next, ['at', 'min']);
          if (entry.expected.kind !== 'member' || !time(entry.next)) fail('INVALID_PACKET');
        }
      }
    }
    return unconfirmed;
  }

  // State can contain optional undefined values and arbitrary nested records;
  // keep them, unlike a JSON stringify/parse round trip. Data properties are
  // defined explicitly, so even a legacy own __proto__ key is copied as data.
  function copy(value, seen = new Map()) {
    if (!value || typeof value !== 'object') return value;
    if (seen.has(value)) return seen.get(value);
    if (value instanceof Date) return new Date(value.getTime());
    const out = Array.isArray(value) ? [] : Object.create(Object.getPrototypeOf(value));
    seen.set(value, out);
    for (const key of Reflect.ownKeys(value)) {
      if (Array.isArray(value) && key === 'length') continue;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (own(descriptor, 'value')) {
        Object.defineProperty(out, key, {value:copy(descriptor.value, seen), enumerable:descriptor.enumerable, writable:true, configurable:true});
      } else Object.defineProperty(out, key, descriptor);
    }
    if (Array.isArray(value)) out.length = value.length;
    return out;
  }
  function matches(slot, expected, keys) {
    return keys.every(key => own(slot, key) && slot[key] === expected[key]);
  }
  function sameDate(a, b) {
    if (typeof b.date === 'string' && b.date) {
      if (!dateParts(b.date)) return null;
      return a.date === b.date;
    }
    const day = dayParts(b.day), target = dateParts(a.date);
    if (!day) return null;
    return day.month === target.month && day.day === target.day;
  }

  function apply(current, packet) {
    const unconfirmedTargets = validate(packet);
    if (!object(current) || !object(current.plan) || !Array.isArray(current.plan.slots)
        || current.plan.slots.length > MAX_SLOTS || current.plan.slots.some(slot => !object(slot))) fail('INVALID_STATE');
    for (const key of ['year', 'timezone']) {
      // Legacy plans can omit these summary fields. Each expected date has
      // already been checked against packet.year; never infer or add metadata.
      if (own(packet, key) && own(current.plan, key) && current.plan[key] !== packet[key]) fail(key === 'year' ? 'YEAR_MISMATCH' : 'TIMEZONE_MISMATCH');
    }
    const result = {state:current, changed:[], unchanged:[], skipped:[], unconfirmed:[]};
    const slots = current.plan.slots, indices = new Map(), edits = new Map(), flagged = new Set();
    slots.forEach((slot, index) => {
      if (!indices.has(slot.id)) indices.set(slot.id, []);
      indices.get(slot.id).push(index);
    });
    const locate = entry => {
      const hits = indices.get(entry.id) || [];
      if (!hits.length) { result.skipped.push({id:entry.id, reason:'TARGET_NOT_FOUND'}); return -1; }
      if (hits.length !== 1) fail('AMBIGUOUS_TARGET', entry.id);
      return hits[0];
    };
    for (const entry of packet.updates) {
      const index = locate(entry);
      if (index < 0) continue;
      const slot = slots[index];
      if (!matches(slot, entry.expected, identityKeys)) fail('EXPECTED_MISMATCH', entry.id);
      if (matches(slot, entry.next, ['at', 'min'])) { result.unchanged.push(entry.id); continue; }
      if (!matches(slot, entry.expected, ['at', 'min'])) fail('EXPECTED_MISMATCH', entry.id);
      edits.set(index, {at:entry.next.at, min:entry.next.min});
      result.changed.push(entry.id);
    }
    for (const entry of unconfirmedTargets) {
      const index = locate(entry);
      if (index < 0) continue;
      const slot = slots[index];
      if (!matches(slot, entry.expected, expectedKeys)) fail('EXPECTED_MISMATCH', entry.id);
      if (slot.scheduleTimeUnconfirmed === true) { result.unchanged.push(entry.id); continue; }
      if (slot.a0 != null && slot.a1 == null) fail('LIVE_TARGET', entry.id);
      flagged.add(index);
      result.unconfirmed.push(entry.id);
    }
    // Validate the final proposal, so a batch can exchange two member times.
    // Unconfirmed rows stay visible and retain every planned/actual field, but
    // their obsolete planned times do not claim time in this overlap check.
    const uncertain = new Set();
    for (const [index, next] of edits) {
      const target = {...slots[index], ...next};
      if (target.scheduleTimeUnconfirmed === true || target.scheduleArchived === true) continue;
      for (let otherIndex = 0; otherIndex < slots.length; otherIndex++) {
        if (otherIndex === index || flagged.has(otherIndex)) continue;
        const other = {...slots[otherIndex], ...(edits.get(otherIndex) || {})};
        if (other.scheduleTimeUnconfirmed === true || other.scheduleArchived === true) continue;
        const same = sameDate(target, other);
        if (same === null) {
          if (!uncertain.has(otherIndex)) {
            result.skipped.push({id:typeof other.id === 'string' ? other.id : null, reason:'SCHEDULE_DATE_UNKNOWN'});
            uncertain.add(otherIndex);
          }
          continue;
        }
        if (!same) continue;
        if (!time(other)) fail('UNKNOWN_SCHEDULE_TIME', target.id, other.id);
        if (Math.max(target.at, other.at) < Math.min(target.at + target.min, other.at + other.min)) fail('SCHEDULE_OVERLAP', target.id, other.id);
      }
    }
    if (!edits.size && !flagged.size) return result;
    result.state = copy(current);
    for (const [index, next] of edits) Object.assign(result.state.plan.slots[index], next);
    for (const index of flagged) result.state.plan.slots[index].scheduleTimeUnconfirmed = true;
    return result;
  }
  const api = Object.freeze({apply});
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RecordingScheduleUpdate = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

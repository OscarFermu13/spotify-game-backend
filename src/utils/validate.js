const CUID_REGEX = /^c[a-z0-9]{20,30}$/;
const SLUG_REGEX = /^[a-z0-9-]{2,60}$/;

function isValidId(id) {
  return typeof id === 'string' && CUID_REGEX.test(id);
}

function isValidSlug(slug) {
  return typeof slug === 'string' && SLUG_REGEX.test(slug);
}

function isValidSearchQuery(q) {
  return typeof q === 'string' && q.trim().length >= 1 && q.length <= 200;
}

module.exports = { isValidId, isValidSlug, isValidSearchQuery };
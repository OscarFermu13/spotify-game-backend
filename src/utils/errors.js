const ERROR_CODES = {
  // Auth
  NO_TOKEN:           'NO_TOKEN',
  INVALID_TOKEN:      'INVALID_TOKEN',
  INVALID_USER:       'INVALID_USER',
  UNAUTHORIZED:       'UNAUTHORIZED',

  // Validación
  INVALID_PAYLOAD:    'INVALID_PAYLOAD',
  INVALID_ID:         'INVALID_ID',
  INVALID_SLUG:       'INVALID_SLUG',
  INVALID_QUERY:      'INVALID_QUERY',
  INVALID_STATE:      'INVALID_STATE',

  // Recursos
  NOT_FOUND:          'NOT_FOUND',
  ALREADY_COMPLETED:  'ALREADY_COMPLETED',
  ACCESS_DENIED:      'ACCESS_DENIED',
  PAYMENT_REQUIRED:   'PAYMENT_REQUIRED',

  // Spotify
  SPOTIFY_ERROR:      'SPOTIFY_ERROR',
  NO_SPOTIFY_TOKEN:   'NO_SPOTIFY_TOKEN',

  // Servidor
  INTERNAL_ERROR:     'INTERNAL_ERROR',
  CONFIG_ERROR:       'CONFIG_ERROR',
};

/**
 * Envía una respuesta de error estructurada y consistente.
 * @param {object} res        - Express response object
 * @param {number} status     - HTTP status code
 * @param {string} code       - Código de error de ERROR_CODES
 * @param {string} message    - Mensaje legible para el desarrollador
 */
function sendError(res, status, code, message) {
  return res.status(status).json({ error: message, code });
}

module.exports = { sendError, ERROR_CODES };
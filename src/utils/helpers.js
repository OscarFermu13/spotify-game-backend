function parsePlaylistId(url) {
  try {
    const u = url.trim();
    if (u.includes('playlist/')) {
      return u.split('playlist/')[1].split('?')[0];
    } else if (u.startsWith('spotify:playlist:')) {
      return u.split('spotify:playlist:')[1];
    }
    return null;
  } catch {
    return null;
  }
}

module.exports = { parsePlaylistId };

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

function fisherYatesShuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

module.exports = { parsePlaylistId, fisherYatesShuffle };
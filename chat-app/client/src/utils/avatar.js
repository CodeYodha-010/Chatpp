export function getAvatarColor(name) {
  const hash = (name || '').split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return `hsl(${hash * 7 % 360}, 65%, 55%)`;
}

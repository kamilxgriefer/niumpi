/**
 * A production atlas page is a large decoded RGBA surface. Social lists can
 * contain many neighbours, so only the first visible card gets a live player;
 * every secondary avatar uses its approved still. Opening a visit overlay
 * suspends even that list animation.
 */
export const MAX_LIVE_FRIEND_AVATARS = 1;

export function friendAvatarIsAnimated(index: number, visitOverlayOpen: boolean): boolean {
  return !visitOverlayOpen && index >= 0 && index < MAX_LIVE_FRIEND_AVATARS;
}

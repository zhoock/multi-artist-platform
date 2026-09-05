/** Async-only entry: never sync-import (keeps AudioPlayer UI out of the main chunk graph). */
export function loadAudioPlayerModule() {
  return import(/* webpackChunkName: "audio-player" */ '../AudioPlayer/AudioPlayer');
}

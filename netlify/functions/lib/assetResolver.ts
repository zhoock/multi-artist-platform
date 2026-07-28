/**
 * Asset Resolver — server-side URL resolution for playback and previews.
 * Worker must not import this module.
 */

import {
  selectAssetPath,
  type TrackAssetRecord,
} from '../../../src/shared/lib/audio/assetResolver';
import type {
  AssetResolverContext,
  AssetResolverResult,
} from '../../../src/shared/lib/audio/assetResolver';
import { resolveTrackSrcToSupabasePublicUrl } from './storage-public-url';

export type { AssetResolverContext, AssetResolverResult, TrackAssetRecord };

export function resolveAssetForPlayback(
  assets: TrackAssetRecord[],
  ctx: AssetResolverContext,
  albumUserId: string | null | undefined
): AssetResolverResult {
  const selected = selectAssetPath(assets, ctx);
  if (!selected.url) {
    return selected;
  }

  const resolved = resolveTrackSrcToSupabasePublicUrl(selected.url, albumUserId) ?? selected.url;
  return { ...selected, url: resolved };
}

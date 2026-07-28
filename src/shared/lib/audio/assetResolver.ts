/**
 * Asset Resolver — shared types and policy-driven selection (no I/O).
 * Server builds public URLs in netlify/functions/lib/assetResolver.ts
 */

import {
  ASSET_RESOLVER_POLICY,
  type AssetFormat,
  type AssetType,
  type AssetVariant,
  type ProcessingStatus,
} from './audioAssetPipelineConfig';

export type AssetResolverPurpose = 'playback' | 'preview' | 'waveform';

export interface TrackAssetRecord {
  type: string;
  format: string;
  variant: string;
  status: string;
  path: string | null;
}

export interface AssetResolverContext {
  purpose: AssetResolverPurpose;
  processingStatus: ProcessingStatus;
  hasPremiumAccess: boolean;
  codecSupport?: string[];
  networkBandwidthKbps?: number;
  /** Legacy tracks.src when pipeline columns not yet populated */
  legacySrc?: string | null;
  pipelineAvailable?: boolean;
}

export interface AssetResolverResult {
  url: string | null;
  asset: { type: AssetType; format: AssetFormat; variant: AssetVariant } | null;
  processingStatus: ProcessingStatus;
}

function assetKey(type: string, format: string, variant: string): string {
  return `${type}:${format}:${variant}`;
}

function matchesPolicyRule(
  rule: (typeof ASSET_RESOLVER_POLICY)[number],
  ctx: AssetResolverContext
): boolean {
  if (rule.requiresPremium && !ctx.hasPremiumAccess) return false;
  if (rule.requiresCodec) {
    const supported = ctx.codecSupport ?? [];
    if (!supported.includes(rule.requiresCodec)) return false;
  }
  if (rule.maxBandwidthKbps != null && ctx.networkBandwidthKbps != null) {
    if (ctx.networkBandwidthKbps > rule.maxBandwidthKbps) return false;
  }
  return true;
}

function purposeAssetTypes(purpose: AssetResolverPurpose): string[] {
  switch (purpose) {
    case 'playback':
      return ['stream'];
    case 'preview':
      return ['preview'];
    case 'waveform':
      return ['waveform'];
    default:
      return ['stream'];
  }
}

/**
 * Select the most appropriate ready asset by policy. Returns path only — caller resolves to public URL.
 */
export function selectAssetPath(
  assets: TrackAssetRecord[],
  ctx: AssetResolverContext
): AssetResolverResult {
  const pipelineAvailable = ctx.pipelineAvailable !== false;

  if (!pipelineAvailable && ctx.legacySrc?.trim()) {
    return {
      url: ctx.legacySrc.trim(),
      asset: null,
      processingStatus: ctx.processingStatus,
    };
  }

  // Pipeline playback requires both track-level and asset-level readiness.
  if (pipelineAvailable && ctx.processingStatus !== 'ready') {
    return {
      url: null,
      asset: null,
      processingStatus: ctx.processingStatus,
    };
  }

  const allowedTypes = purposeAssetTypes(ctx.purpose);
  const ready = assets.filter(
    (a) => allowedTypes.includes(a.type) && a.status === 'ready' && a.path?.trim()
  );

  const byKey = new Map(ready.map((a) => [assetKey(a.type, a.format, a.variant), a]));

  for (const rule of ASSET_RESOLVER_POLICY) {
    if (ctx.purpose === 'playback' && rule.type !== 'stream') continue;
    if (ctx.purpose === 'preview' && rule.type !== 'preview') continue;
    if (ctx.purpose === 'waveform' && rule.type !== 'waveform') continue;
    if (!matchesPolicyRule(rule, ctx)) continue;

    const row = byKey.get(assetKey(rule.type, rule.format, rule.variant));
    if (row?.path) {
      return {
        url: row.path.trim(),
        asset: { type: rule.type, format: rule.format, variant: rule.variant },
        processingStatus: ctx.processingStatus,
      };
    }
  }

  return {
    url: null,
    asset: null,
    processingStatus: ctx.processingStatus,
  };
}

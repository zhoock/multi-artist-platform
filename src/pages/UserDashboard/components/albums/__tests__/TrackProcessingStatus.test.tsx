import { describe, expect, it } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import React from 'react';

import { TrackProcessingStatus } from '../TrackProcessingStatus';

describe('TrackProcessingStatus', () => {
  it('shows processing while publish playability is still pending after status becomes ready', () => {
    render(
      <TrackProcessingStatus
        track={{
          processingStatus: 'ready',
          processingError: null,
          src: '',
        }}
        albumId="album-1"
        trackId="track-1"
        pipelineAvailable
      />
    );

    expect(screen.getByText('Processing…')).toBeTruthy();
  });

  it('hides the badge when the track is playable for publish', () => {
    const { container } = render(
      <TrackProcessingStatus
        track={{
          processingStatus: 'ready',
          processingError: null,
          src: 'https://cdn.example.test/track.opus',
        }}
        albumId="album-1"
        trackId="track-1"
        pipelineAvailable
      />
    );

    expect(container.querySelector('.user-dashboard__track-processing-badge')).toBeNull();
  });

  it('shows processing for pending pipeline tracks', () => {
    render(
      <TrackProcessingStatus
        track={{
          processingStatus: 'pending',
          processingError: null,
          src: '',
        }}
        albumId="album-1"
        trackId="track-1"
        pipelineAvailable
      />
    );

    expect(screen.getByText('Processing…')).toBeTruthy();
  });
});

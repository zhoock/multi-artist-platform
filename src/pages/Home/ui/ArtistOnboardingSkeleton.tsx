import '@shared/ui/skeleton/skeleton.scss';
import './ArtistOnboarding.scss';

export function ArtistOnboardingSkeleton() {
  return (
    <div
      className="artist-onboarding artist-onboarding--loading"
      aria-busy="true"
      aria-label="Loading artist onboarding"
    >
      <section className="artist-onboarding-hero" aria-hidden="true">
        <div className="artist-onboarding-hero__backdrop" />
        <div className="artist-onboarding-hero__scrim" />

        <div className="artist-onboarding-hero__frame wrapper">
          <div className="artist-onboarding-hero__content artist-onboarding-skeleton__hero-content">
            <div className="skeleton artist-onboarding-skeleton__eyebrow" />
            <div className="skeleton artist-onboarding-skeleton__headline" />
            <div className="skeleton artist-onboarding-skeleton__headline artist-onboarding-skeleton__headline--short" />
            <div className="skeleton artist-onboarding-skeleton__subtext" />
            <div className="skeleton artist-onboarding-skeleton__subtext artist-onboarding-skeleton__subtext--short" />
            <div className="skeleton artist-onboarding-skeleton__cta" />
          </div>
        </div>
      </section>

      <section className="artist-onboarding-secondary wrapper" aria-hidden="true">
        <ul className="artist-onboarding-secondary__list">
          {[0, 1, 2, 3].map((index) => (
            <li key={index}>
              <div className="artist-onboarding-skeleton__feature">
                <div className="skeleton artist-onboarding-skeleton__feature-icon" />
                <div className="skeleton artist-onboarding-skeleton__feature-title" />
                <div className="skeleton artist-onboarding-skeleton__feature-line" />
                <div className="skeleton artist-onboarding-skeleton__feature-line artist-onboarding-skeleton__feature-line--short" />
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export default ArtistOnboardingSkeleton;

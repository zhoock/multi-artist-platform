import type { ReactNode } from 'react';
import { Helmet } from 'react-helmet-async';
import './ServiceScreen.scss';

export type ServiceScreenPrimaryAction = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
};

export type ServiceScreenSecondaryAction = {
  prefix?: string;
  label: string;
  onClick: () => void;
};

export type ServiceScreenProps = {
  modifier: 'email-verified' | 'email-verification-expired' | 'not-found';
  titleId: string;
  pageTitle: string;
  title: ReactNode;
  description: ReactNode;
  primaryAction: ServiceScreenPrimaryAction;
  secondaryAction?: ServiceScreenSecondaryAction;
  beforeActions?: ReactNode;
};

export function ServiceScreen({
  modifier,
  titleId,
  pageTitle,
  title,
  description,
  primaryAction,
  secondaryAction,
  beforeActions,
}: ServiceScreenProps) {
  return (
    <section className={`service-screen service-screen--${modifier}`} aria-labelledby={titleId}>
      <div className="service-screen__backdrop" aria-hidden="true" />
      <div className="service-screen__content">
        <Helmet>
          <title>{pageTitle}</title>
        </Helmet>

        <h1 id={titleId} className="service-screen__title">
          {title}
        </h1>

        <div className="service-screen__divider" aria-hidden="true" />

        <div className="service-screen__description">{description}</div>

        {beforeActions ? <div className="service-screen__notice">{beforeActions}</div> : null}

        <button
          type="button"
          className="service-screen__button"
          onClick={primaryAction.onClick}
          disabled={primaryAction.disabled}
        >
          {primaryAction.label}
        </button>

        {secondaryAction ? (
          <p className="service-screen__secondary">
            {secondaryAction.prefix}
            <button
              type="button"
              className="service-screen__secondary-link"
              onClick={secondaryAction.onClick}
            >
              {secondaryAction.label}
            </button>
          </p>
        ) : null}
      </div>
    </section>
  );
}

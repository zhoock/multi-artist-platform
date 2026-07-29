import type { ReactNode } from 'react';
import { Helmet } from 'react-helmet-async';
import './ServiceContent.scss';

export type ServiceContentAction = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
};

export type ServiceContentSecondaryAction = {
  prefix?: string;
  label: string;
  onClick: () => void;
};

export type ServiceContentProps = {
  titleId: string;
  pageTitle: string;
  title: ReactNode;
  description: ReactNode;
  action?: ServiceContentAction;
  secondaryAction?: ServiceContentSecondaryAction;
  extraContent?: ReactNode;
};

export function ServiceContent({
  titleId,
  pageTitle,
  title,
  description,
  action,
  secondaryAction,
  extraContent,
}: ServiceContentProps) {
  return (
    <div className="service-content">
      <Helmet>
        <title>{pageTitle}</title>
      </Helmet>

      <h1 id={titleId} className="service-content__title">
        {title}
      </h1>

      <div className="service-content__description">{description}</div>

      {extraContent ? <div className="service-content__extra">{extraContent}</div> : null}

      {action ? (
        <button
          type="button"
          className="service-content__button"
          onClick={action.onClick}
          disabled={action.disabled}
        >
          {action.label}
        </button>
      ) : null}

      {secondaryAction ? (
        <p className="service-content__secondary">
          {secondaryAction.prefix}
          <button
            type="button"
            className="service-content__secondary-link"
            onClick={secondaryAction.onClick}
          >
            {secondaryAction.label}
          </button>
        </p>
      ) : null}
    </div>
  );
}

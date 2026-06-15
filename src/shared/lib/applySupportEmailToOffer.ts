import { getSupportEmail, substituteSupportEmail } from './supportEmail';

export interface OfferPageData {
  title: string;
  subtitle: string;
  meta: {
    dateLabel: string;
    websiteLabel: string;
    website: string;
  };
  intro: string;
  terms: Array<{
    term: string;
    definition: string;
  }>;
  sections: Array<{
    title: string;
    paragraphs: string[];
  }>;
  sellerInfo: {
    sellerLabel: string;
    seller: string;
    innLabel: string;
    inn: string;
    emailLabel: string;
    email: string;
    hoursLabel: string;
    hours: string;
  };
}

/** Injects runtime support email into offer copy loaded from static JSON. */
export function applySupportEmailToOffer(data: OfferPageData): OfferPageData {
  const email = getSupportEmail();

  return {
    ...data,
    sections: data.sections.map((section) => ({
      ...section,
      paragraphs: section.paragraphs.map((paragraph) => substituteSupportEmail(paragraph, email)),
    })),
    sellerInfo: {
      ...data.sellerInfo,
      email: substituteSupportEmail(data.sellerInfo.email, email),
    },
  };
}

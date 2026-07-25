import { getSupportEmail, substituteSupportEmail } from './supportEmail';

export interface PrivacyPageData {
  title: string;
  subtitle: string;
  meta: {
    dateLabel: string;
    websiteLabel: string;
    website: string;
  };
  intro: string;
  sections: Array<{
    title: string;
    paragraphs: string[];
  }>;
  contactInfo: {
    emailLabel: string;
    email: string;
    hoursLabel: string;
    hours: string;
  };
}

/** Injects runtime support email into privacy copy loaded from static JSON. */
export function applySupportEmailToPrivacy(data: PrivacyPageData): PrivacyPageData {
  const email = getSupportEmail();

  return {
    ...data,
    sections: data.sections.map((section) => ({
      ...section,
      paragraphs: section.paragraphs.map((paragraph) => substituteSupportEmail(paragraph, email)),
    })),
    contactInfo: {
      ...data.contactInfo,
      email: substituteSupportEmail(data.contactInfo.email, email),
    },
  };
}

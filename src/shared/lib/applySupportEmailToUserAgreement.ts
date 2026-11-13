import { getSupportEmail, substituteSupportEmail } from './supportEmail';

export interface UserAgreementPageData {
  title: string;
  subtitle: string;
  meta: {
    versionLabel: string;
    version: string;
    effectiveDateLabel: string;
    effectiveDate: string;
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

export function applySupportEmailToUserAgreement(
  data: UserAgreementPageData
): UserAgreementPageData {
  const email = getSupportEmail();

  return {
    ...data,
    intro: substituteSupportEmail(data.intro, email),
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

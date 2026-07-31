import { useState, MouseEvent } from 'react';
import './style.scss';

type SharePlatform = 'facebook' | 'twitter';

const platformConfig: Record<
  SharePlatform,
  { baseUrl: string; windowName: string; width: number; height: number }
> = {
  facebook: {
    baseUrl: 'https://www.facebook.com/sharer/sharer.php?u=',
    windowName: 'Share on Facebook',
    width: 464,
    height: 210,
  },
  twitter: {
    baseUrl: 'https://twitter.com/intent/tweet?text=',
    windowName: 'Share on Twitter',
    width: 464,
    height: 210,
  },
};

function openShareWindow(
  url: string,
  { windowName, width, height }: typeof platformConfig.facebook
) {
  const left = screen.width ? (screen.width - width) / 2 : 100;
  const top = screen.height ? (screen.height - height) / 2 : 100;
  const settings =
    `width=${width},height=${height},top=${top},left=${left},scrollbars=no,` +
    'location=no,directories=no,status=no,menubar=no,toolbar=no,resizable=no';

  window.open(url, windowName, settings);
}

type ShareProps = {
  /** Absolute public URL to share (built by the page via semantic path builders). */
  url: string;
};

export function Share({ url }: ShareProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleToggle = (event: MouseEvent<HTMLElement>) => {
    event.preventDefault();
    setIsOpen((prev) => !prev);
  };

  const handleShare = (platform: SharePlatform) => {
    const config = platformConfig[platform];
    const encoded = encodeURIComponent(url);
    openShareWindow(`${config.baseUrl}${encoded}`, config);
  };

  return (
    <ul className="share-list js-share-item" role="list" aria-label="Поделиться">
      <li className="share-list__item" onClick={handleToggle}>
        <button
          type="button"
          className={`share-list__link icon-share ${isOpen ? 'active' : ''}`}
          aria-label="Поделиться"
          aria-expanded={isOpen}
          aria-haspopup="menu"
        ></button>
      </li>
      <li className={`share-list__item ${isOpen ? 'show' : ''}`} role="none">
        <a
          className="share-list__link icon-facebook1"
          href="#"
          aria-label="Поделиться на Facebook"
          onClick={(e) => {
            e.preventDefault();
            handleShare('facebook');
          }}
        >
          <span className="visually-hidden">Facebook</span>
        </a>
      </li>
      <li className={`share-list__item ${isOpen ? 'show' : ''}`} role="none">
        <a
          className="share-list__link icon-twitter"
          href="#"
          aria-label="Поделиться на Twitter"
          onClick={(e) => {
            e.preventDefault();
            handleShare('twitter');
          }}
        >
          <span className="visually-hidden">Twitter</span>
        </a>
      </li>
    </ul>
  );
}

export default Share;

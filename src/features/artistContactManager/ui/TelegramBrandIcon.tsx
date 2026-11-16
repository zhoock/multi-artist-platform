type TelegramBrandIconProps = {
  className?: string;
  size?: number;
};

export function TelegramBrandIcon({ className, size = 22 }: TelegramBrandIconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M21.5 4.5 2.8 11.1c-.9.4-.9 1.6.1 1.9l4.7 1.4 1.8 5.6c.3.9 1.5 1 2 .2l2.6-3.8 4.9 3.6c.8.6 1.9.1 2.1-.9L22.5 6.1c.2-1-0.6-1.8-1.7-1.6Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M9.2 14.1 15.6 9.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

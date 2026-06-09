// src/pages/UserDashboard/components/blocks/BlockQuote.tsx
import type { RichText } from '@shared/lib/richText';
import type {
  RichBackspaceDetail,
  RichEnterDetail,
  RichPasteMultilineDetail,
} from '@shared/ui/RichTextBlockEditor';
import { BlockRichTextField } from './BlockRichTextField';
import type { FormatType } from './BlockParagraph';

interface BlockQuoteProps {
  value: RichText;
  onChange: (content: RichText) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onEnter?: (atEnd: boolean) => void;
  onBackspace?: (isEmpty: boolean, atStart?: boolean) => void;
  onFormat?: (type: FormatType, url?: string) => void;
  onRichEnter?: (detail: RichEnterDetail) => void;
  onRichBackspace?: (detail: RichBackspaceDetail) => void;
  onRichPasteMultiline?: (detail: RichPasteMultilineDetail) => void;
  placeholder?: string;
  blockId?: string;
}

export function BlockQuote(props: BlockQuoteProps) {
  return <BlockRichTextField variant="quote" placeholder="Цитата" {...props} />;
}

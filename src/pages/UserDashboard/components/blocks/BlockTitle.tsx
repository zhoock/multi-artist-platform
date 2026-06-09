// src/pages/UserDashboard/components/blocks/BlockTitle.tsx
import type { RichText } from '@shared/lib/richText';
import type {
  RichBackspaceDetail,
  RichEnterDetail,
  RichPasteMultilineDetail,
} from '@shared/ui/RichTextBlockEditor';
import { BlockRichTextField } from './BlockRichTextField';
import type { FormatType } from './BlockParagraph';

interface BlockTitleProps {
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

export function BlockTitle(props: BlockTitleProps) {
  return <BlockRichTextField variant="title" placeholder="Заголовок" {...props} />;
}

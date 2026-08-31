type TooltipRangeContent = {
  label: string;
  min: string;
  max: string;
  lowMeaning: string;
  highMeaning: string;
};

type StructuredTooltipContent = {
  title?: string;
  body: string;
  range?: TooltipRangeContent;
};

type TooltipContent = string | StructuredTooltipContent;

function isStructuredTooltipContent(
  content: TooltipContent | null | undefined
): content is StructuredTooltipContent {
  return typeof content === 'object' && content !== null && typeof content.body === 'string';
}

function tooltipContentToText(content: TooltipContent | null | undefined): string | null {
  if (typeof content === 'string') {
    return content.trim() || null;
  }

  if (!isStructuredTooltipContent(content)) {
    return null;
  }

  const parts = [
    content.title,
    content.body,
    content.range
      ? `${content.range.label}: ${content.range.min} - ${content.range.max}. ${content.range.lowMeaning}. ${content.range.highMeaning}.`
      : null,
  ];

  return parts.filter(Boolean).join(' ');
}

export { isStructuredTooltipContent, tooltipContentToText };
export type { TooltipRangeContent, StructuredTooltipContent, TooltipContent };

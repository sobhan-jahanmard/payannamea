import catalog from "./presentation-catalog.json";

export const PRESENTATION_ORDER_TYPE = "ارائه و پاورپوینت";
export const PRESENTATION_CATALOG = catalog;
export const PRESENTATION_STYLES = catalog.styles;
export const PRESENTATION_FONTS = catalog.fonts;
export const DEFAULT_PRESENTATION_STYLE = catalog.default_style;
export const DEFAULT_PRESENTATION_FONT = catalog.default_font;
export const presentationStyleLabel = (id?: string | null) => PRESENTATION_STYLES.find(style => style.id === id)?.label || PRESENTATION_STYLES.find(style => style.id === DEFAULT_PRESENTATION_STYLE)!.label;
export const INFORMATION_SOURCE_EXTENSIONS = [".docx", ".pdf", ".pptx", ".txt", ".md"];

export function isPresentationOrder(order: { order_type?: string | null }): boolean {
  return order.order_type === PRESENTATION_ORDER_TYPE;
}

export function isInformationSource(file: { file_type: string; original_name: string; size_bytes: number }): boolean {
  return file.file_type === "information_source" && file.size_bytes > 0 &&
    INFORMATION_SOURCE_EXTENSIONS.some(extension => file.original_name.toLowerCase().endsWith(extension));
}

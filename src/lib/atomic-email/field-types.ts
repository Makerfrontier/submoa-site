// Field type definitions consumed by parser, templater, and the React UI.

export type FieldType = 'headline' | 'body' | 'image' | 'link' | 'cta';

export interface BaseField {
  id: string;
  type: FieldType;
  dom_path: string;
}

export interface HeadlineField extends BaseField {
  type: 'headline';
  level: 'h1' | 'h2' | 'h3';
  text: string;
  raw_html: string;
}

export interface BodyField extends BaseField {
  type: 'body';
  html: string;
  text_preview: string;
}

export interface ImageField extends BaseField {
  type: 'image';
  src: string;
  alt: string;
  width: string;
  height: string;
  wrapped_in_link: boolean;
  link_href: string | null;
  link_target: string | null;
  is_data_uri: boolean;
}

export interface LinkField extends BaseField {
  type: 'link';
  text: string;
  href: string;
  target: string;
  rel: string;
}

export interface CTAField extends BaseField {
  type: 'cta';
  text: string;
  href: string;
  target: string;
  rel: string;
  button_style: string;
}

export type Field = HeadlineField | BodyField | ImageField | LinkField | CTAField;

export interface ParsedProject {
  fields: Field[];
  source_html_template: string;
}

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
// Electron 33 bundles Node 20.18, which cannot infer ESM for the library's
// .es.js export. Its explicit CommonJS entry works in both desktop and CLI.
const pptxgen = createRequire(import.meta.url)('pptxgenjs');

const request = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const { slides, contract, design, target } = request;
const deck = new pptxgen();
deck.layout = 'LAYOUT_WIDE';
deck.author = contract.student_name || 'Daneshyar';
deck.subject = contract.title;
deck.title = contract.title;
deck.lang = contract.rtl === false ? 'en-US' : 'fa-IR';
deck.theme = { headFontFace: design.font, bodyFontFace: design.font, lang: deck.lang };
const W = 13.333333, H = 7.5;
const rtl = contract.rtl !== false;
const manifest = { version: 2, renderer: 'pptxgenjs-4.0.1', style: design.id, font: design.font,
  content_sha256: request.content_sha256, design_sha256: request.design_sha256, slides: [] };

const isolate = value => rtl ? String(value).replace(/[A-Za-z][A-Za-z0-9_./+%\-]*(?:[ \t]+[A-Za-z][A-Za-z0-9_./+%\-]*)*/g, '$&\u202c\u200f').replace(/([A-Za-z][A-Za-z0-9_./+%\-]*(?:[ \t]+[A-Za-z][A-Za-z0-9_./+%\-]*)*)\u202c/g, '\u202a$1\u202c') : String(value);
const charsPerLine = (width, size) => Math.max(12, width * 72 / (size * .51));
function lines(value, width, size) {
  return String(value).split('\n').reduce((sum, row) => sum + Math.max(1, Math.ceil(row.length / charsPerLine(width, size))), 0);
}
function text(slide, record, name, value, box, options = {}) {
  if (value == null || value === '') return;
  const { x, y, w, h } = box;
  const size = options.fontSize || design.body_pt;
  const heading = name === 'title';
  // Fail instead of silently shrinking the font or losing text.
  const estimated = lines(value, w, size) * size / 72 * (options.lineSpacingMultiple || 1.18);
  if (estimated > h + .13 && name !== 'citation' && name !== 'cover-title') {
    throw new Error(`Slide ${record.slide}: ${name} needs ${estimated.toFixed(2)}in, available ${h.toFixed(2)}in; shorten text or change layout`);
  }
  slide.addText(options.rtlMode === false && rtl ? `\u202a${value}\u202c` : options.rtlMode === false ? String(value) : isolate(value), {
    ...box, fontFace: design.font, fontSize: size, color: design.ink, bold: heading,
    margin: 0, breakLine: false, valign: 'top', align: rtl ? 'right' : 'left',
    rtlMode: rtl, lang: deck.lang, paraSpaceAfter: 8, fit: 'none',
    ...options, objectName: `${name}-${record.slide}-${record.objects.length}`,
  });
  record.objects.push({ role: name, text: String(value), bbox: [x * 72, y * 72, (x + w) * 72, (y + h) * 72], font_size: size });
}
function line(slide, x, y, w, color = design.accent, width = 1) {
  slide.addShape(deck.ShapeType.line, { x, y, w, h: 0, line: { color, width }, objectName: 'Divider' });
}
function points(slide, record, values, box, size = design.body_pt) {
  const items = values.filter(Boolean);
  if (!items.length) return;
  const minimum = items.map(value => Math.max(.46, lines(value, box.w - .2, size) * size / 72 * 1.22));
  const total = minimum.reduce((a, b) => a + b, 0);
  const gap = Math.min(.3, Math.max(.12, (box.h - total) / Math.max(1, items.length - 1)));
  if (total + gap * (items.length - 1) > box.h + .1) throw new Error(`Slide ${record.slide}: body exceeds layout; split or shorten the text`);
  let top = box.y;
  items.forEach((value, index) => {
    text(slide, record, 'body', value, { x: box.x, y: top, w: box.w, h: minimum[index] + .05 }, { fontSize: size });
    top += minimum[index] + gap;
  });
}
function heading(slide, record, data) {
  const maxSize = design.heading_pt;
  const titleLines = lines(data.title, 11.8, maxSize);
  const size = titleLines > 2 ? 30 : maxSize;
  text(slide, record, 'title', data.title, { x: .78, y: .46, w: 11.78, h: 1.16 }, { fontSize: size, bold: true, align: design.id === 'academic-formal' ? 'center' : rtl ? 'right' : 'left' });
  // Explicit title/body boundary in every non-cover layout.
  line(slide, .78, 1.73, 11.78, design.accent, design.id === 'academic-formal' ? 1 : 2);
  if (data.description) text(slide, record, 'description', data.description, { x: .82, y: 1.86, w: 11.7, h: .5 }, { fontSize: 18, color: design.muted });
}
const bodyTop = data => data.description ? 2.52 : 2.04;

function cover(slide, record, data) {
  slide.background = { color: design.cover };
  const formal = design.id === 'academic-formal';
  const teaching = design.id === 'visual-teaching', business = design.id === 'analytical-business';
  if (contract.university) text(slide, record, 'institution', contract.university, { x: .9, y: .58, w: 11.5, h: .5 }, { fontSize: 19, color: teaching ? design.muted : 'D5E4E9' });
  if (teaching) {
    slide.background = { color: design.canvas };
    slide.addShape(deck.ShapeType.rect, { x: 12.6, y: 0, w: .73, h: 7.5, line: { color: design.accent }, fill: { color: design.accent } });
  }
  text(slide, record, 'cover-title', data.title, { x: business ? 3.7 : .9, y: formal ? 1.82 : 1.55, w: business ? 8.65 : 11.45, h: 2.35 }, { fontSize: 40, color: teaching ? design.ink : 'FFFFFF', bold: true, align: formal ? 'center' : rtl ? 'right' : 'left' });
  line(slide, .95, 4.1, formal ? 11.35 : 3.25, 'BBD3D9', 1.5);
  const metadata = contract.cover_lines?.length ? contract.cover_lines : data.points || [];
  text(slide, record, 'cover-description', metadata.join('\n'), { x: .95, y: 4.48, w: 11.35, h: 2.05 }, { fontSize: 19, color: teaching ? design.muted : 'E4EEF1', align: formal ? 'center' : rtl ? 'right' : 'left' });
}
function statement(slide, record, data) {
  const top = bodyTop(data), values = data.points || [];
  if (design.id === 'academic-formal' || values.length < 2) {
    points(slide, record, values, { x: 1, y: top + .15, w: 11.3, h: 4.05 }, 24);
  } else {
    text(slide, record, 'takeaway', values[0], { x: .95, y: top + .04, w: 11.4, h: 1.2 }, { fontSize: 28, bold: true, color: design.accent });
    points(slide, record, values.slice(1), { x: 1, y: top + 1.6, w: 10.95, h: 2.4 }, 22);
  }
}
function comparison(slide, record, data) {
  const top = bodyTop(data), values = data.points || [];
  const columns = data.visual?.columns || [{ items: values.slice(0, Math.ceil(values.length / 2)) }, { items: values.slice(Math.ceil(values.length / 2)) }];
  columns.slice(0, 2).forEach((column, index) => {
    const x = rtl ? (index === 0 ? 7.0 : .95) : (index === 0 ? .95 : 7.0);
    if (column.heading) text(slide, record, 'column-heading', column.heading, { x, y: top, w: 5.35, h: .7 }, { fontSize: 25, bold: true, color: index ? design.secondary : design.accent });
    points(slide, record, column.items || [], { x, y: top + (column.heading ? 1.0 : .3), w: 5.35, h: 3.75 }, 22);
  });
  slide.addShape(deck.ShapeType.line, { x: 6.65, y: top + .15, w: 0, h: 3.65, line: { color: 'D7E1E4', width: 1 } });
}
function metrics(slide, record, data) {
  const items = data.visual?.metrics;
  if (!items?.length) return statement(slide, record, data);
  const top = bodyTop(data), width = 11.4 / items.length;
  const parts = value => {
    const raw = String(value).trim();
    const match = raw.match(/^([+−-]?[0-9۰-۹٠-٩][0-9۰-۹٠-٩.,٬٫]*[%٪]?)(?:\s+(.+))?$/u);
    return match ? { value: match[1], unit: match[2] || '' } : { value: raw, unit: '' };
  };
  if (design.id === 'analytical-business' && items.length === 3) {
    const lead = items[0];
    const leadParts = parts(lead.value);
    text(slide, record, 'metric-value', leadParts.value, { x: 8.1, y: top + .2, w: 4.1, h: 1.0 }, { fontSize: 48, bold: true, color: design.accent, align: 'center' });
    text(slide, record, 'metric-unit', leadParts.unit, { x: 8.1, y: top + 1.3, w: 4.1, h: .45 }, { fontSize: 18, color: design.muted, align: 'center' });
    text(slide, record, 'metric-label', lead.label, { x: 8.1, y: top + 1.95, w: 4.1, h: 1.0 }, { fontSize: 25, bold: true, align: 'center' });
    if (lead.detail) text(slide, record, 'metric-detail', lead.detail, { x: 8.1, y: top + 3.1, w: 4.1, h: 1.1 }, { fontSize: 18, color: design.muted, align: 'center' });
    items.slice(1).forEach((item, index) => {
      const y = top + index * 2.0;
      const itemParts = parts(item.value);
      text(slide, record, 'metric-value', itemParts.value, { x: .95, y, w: 2.9, h: .8 }, { fontSize: 34, bold: true, color: design.secondary, align: 'center' });
      text(slide, record, 'metric-unit', itemParts.unit, { x: .95, y: y + .85, w: 2.9, h: .35 }, { fontSize: 17, color: design.muted, align: 'center' });
      text(slide, record, 'metric-label', item.label, { x: 4.0, y: y + .05, w: 3.5, h: 1.1 }, { fontSize: 23 });
      if (item.detail) text(slide, record, 'metric-detail', item.detail, { x: .95, y: y + 1.25, w: 6.55, h: .65 }, { fontSize: 18, color: design.muted });
      if (index === 0) line(slide, .95, y + 1.85, 6.6, 'D7E1E4');
    });
    return;
  }
  items.forEach((item, index) => {
    const x = .95 + (rtl ? items.length - 1 - index : index) * width;
    const itemParts = parts(item.value);
    text(slide, record, 'metric-value', itemParts.value, { x, y: top + .18, w: width - .25, h: .9 }, { fontSize: 40, bold: true, color: index === 0 ? design.accent : design.ink, align: 'center' });
    text(slide, record, 'metric-unit', itemParts.unit, { x, y: top + 1.15, w: width - .25, h: .45 }, { fontSize: 18, color: design.muted, align: 'center' });
    text(slide, record, 'metric-label', item.label, { x, y: top + 1.85, w: width - .25, h: .85 }, { fontSize: 23, align: 'center' });
    if (item.detail) text(slide, record, 'metric-detail', item.detail, { x, y: top + 2.95, w: width - .25, h: 1.16 }, { fontSize: 18, color: design.muted, align: 'center' });
    if (design.id === 'academic-formal') line(slide, x + .3, top + 1.65, width - .85, design.secondary);
  });
}
function processDiagram(slide, record, data) {
  const nodes = data.visual?.nodes || (data.points || []).map(label => ({ label }));
  const top = bodyTop(data);
  const count = nodes.length;
  if (count < 2 || count > 7) throw new Error(`Slide ${record.slide}: process needs 2–7 source-backed nodes`);
  if (data.visual?.side_stream) {
    const gap = .35, width = (11.4 - gap * (count - 1)) / count, y = top + .05;
    const positions = nodes.map((node, index) => .95 + (rtl ? count - 1 - index : index) * (width + gap));
    nodes.forEach((node, index) => {
      const x = positions[index];
      slide.addShape(deck.ShapeType.rect, { x, y, w: width, h: 1.3, fill: { color: design.canvas }, line: { color: design.accent, width: 1.5 } });
      text(slide, record, 'process-label', node.label, { x: x + .1, y: y + .12, w: width - .2, h: .65 }, { fontSize: 19, bold: true, align: 'center' });
      if (node.detail) text(slide, record, 'process-detail', node.detail, { x: x + .06, y: y + .82, w: width - .12, h: .4 }, { fontSize: 16, color: design.muted, align: 'center' });
      if (index < count - 1) slide.addShape(deck.ShapeType.line, { x: rtl ? x - gap : x + width, y: y + .65, w: gap, h: 0, line: { color: design.accent, width: 1.5, beginArrowType: rtl ? 'triangle' : undefined, endArrowType: rtl ? undefined : 'triangle' } });
    });
    const branch = data.visual.side_stream, cx = positions[branch.from_node] + width / 2, by = y + 2.25;
    slide.addShape(deck.ShapeType.line, { x: cx, y: y + 1.3, w: 0, h: .95, line: { color: design.secondary, width: 1.5, endArrowType: 'triangle' } });
    text(slide, record, 'side-stream-flow', branch.flow_label, { x: cx - 1.55, y: y + 1.5, w: 1.4, h: .45 }, { fontSize: 18, color: design.secondary, align: 'left' });
    slide.addShape(deck.ShapeType.rect, { x: cx - 1.7, y: by, w: 3.4, h: .85, fill: { color: design.canvas }, line: { color: design.secondary, width: 1.5 } });
    text(slide, record, 'side-stream-label', branch.label, { x: cx - 1.58, y: by + .15, w: 3.16, h: .5 }, { fontSize: 21, bold: true, align: 'center' });
    text(slide, record, 'side-stream-detail', branch.detail, { x: cx - 2.5, y: by + .95, w: 5, h: .4 }, { fontSize: 17, color: design.muted, align: 'center' });
    if (data.visual.feed_stream) {
      const feed = data.visual.feed_stream, fx = 9.15, fy = y + 1.5, targetX = cx + .5, feedY = fy + .425;
      slide.addShape(deck.ShapeType.rect, { x: fx, y: fy, w: 3.2, h: .85, fill: { color: design.canvas }, line: { color: design.accent, width: 1.5 } });
      text(slide, record, 'feed-stream-label', feed.label, { x: fx + .1, y: fy + .16, w: 3, h: .5 }, { fontSize: 21, bold: true, align: 'center' });
      text(slide, record, 'feed-stream-detail', feed.detail, { x: fx, y: fy + .95, w: 3.2, h: .4 }, { fontSize: 17, color: design.muted, align: 'center' });
      line(slide, targetX, feedY, fx - targetX, design.accent, 1.5);
      slide.addShape(deck.ShapeType.line, { x: targetX, y: y + 1.3, w: 0, h: feedY - y - 1.3, line: { color: design.accent, width: 1.5, beginArrowType: 'triangle' } });
    }
    if (data.caption) text(slide, record, 'caption', data.caption, { x: .95, y: 6.3, w: 11.4, h: .45 }, { fontSize: 17, color: design.muted });
    return;
  }
  if (design.id === 'visual-teaching' || (count > 4 && nodes.some(node => node.detail))) {
    const cols = Math.ceil(count / 2), gap = .6, width = (11.4 - gap * (cols - 1)) / cols;
    const dimensions = data.visual?.relationship === 'dimensions';
    nodes.forEach((node, index) => {
      const row = Math.floor(index / cols), position = index % cols;
      const reverse = rtl ? row === 0 : row !== 0;
      const rowCount = Math.min(cols, count - row * cols);
      const order = dimensions ? (cols - rowCount) / 2 + (rtl ? rowCount - 1 - position : position) : reverse ? cols - 1 - position : position;
      const x = .95 + order * (width + gap), y = top + .05 + row * 1.65;
      slide.addShape(deck.ShapeType.rect, { x, y, w: width, h: 1.0, fill: { color: design.canvas }, line: { color: design.accent, width: 1.5 } });
      text(slide, record, 'process-label', node.label, { x: x + .12, y: y + .15, w: width - .24, h: .76 }, { fontSize: 21, bold: true, align: 'center' });
      if (node.detail) text(slide, record, 'process-detail', node.detail, { x, y: y + 1.13, w: width, h: .65 }, { fontSize: 17, color: design.muted, align: 'center' });
      if (!dimensions && index < count - 1) {
        if (position === cols - 1) {
          // Turn outside the labels/details rather than drawing through them.
          const gutter = reverse ? x - .28 : x + width + .28;
          line(slide, reverse ? gutter : x + width, y + .5, .28);
          slide.addShape(deck.ShapeType.line, { x: gutter, y: y + .5, w: 0, h: 1.65, line: { color: design.accent, width: 1.5 } });
          slide.addShape(deck.ShapeType.line, { x: reverse ? gutter : x + width, y: y + 2.15, w: .28, h: 0, line: { color: design.accent, width: 1.5, endArrowType: reverse ? 'triangle' : undefined, beginArrowType: reverse ? undefined : 'triangle' } });
        }
        else slide.addShape(deck.ShapeType.line, { x: reverse ? x - gap : x + width, y: y + .5, w: gap, h: 0, line: { color: design.accent, width: 1.5, beginArrowType: reverse ? 'triangle' : undefined, endArrowType: reverse ? undefined : 'triangle' } });
      }
    });
    if (data.visual?.caption || data.caption) text(slide, record, 'caption', data.visual?.caption || data.caption, { x: .95, y: 6.05, w: 11.4, h: .48 }, { fontSize: 17, color: design.muted });
    return;
  }
  const gap = .35, width = (11.4 - gap * (count - 1)) / count;
  const row = top + .7;
  nodes.forEach((node, index) => {
    const order = rtl ? count - 1 - index : index, x = .95 + order * (width + gap);
    slide.addShape(deck.ShapeType.rect, { x, y: row, w: width, h: 1.55, fill: { color: design.canvas }, line: { color: index === 0 ? design.accent : '9BB3BE', width: index === 0 ? 2 : 1 } });
    text(slide, record, 'process-label', node.label, { x: x + .1, y: row + .18, w: width - .2, h: 1.16 }, { fontSize: count > 5 ? 17 : 20, bold: true, align: 'center' });
    if (node.detail) text(slide, record, 'process-detail', node.detail, { x: x + .04, y: row + 1.8, w: width - .08, h: 1.3 }, { fontSize: 17, color: design.muted, align: 'center' });
    if (data.visual?.relationship !== 'dimensions' && index < count - 1) {
      const start = rtl ? x : x + width;
      slide.addShape(deck.ShapeType.line, { x: rtl ? start - gap : start, y: row + .78, w: gap, h: 0, line: { color: design.accent, width: 1.8, beginArrowType: rtl ? 'triangle' : undefined, endArrowType: rtl ? undefined : 'triangle' } });
    }
  });
  if (data.visual?.caption || data.caption) text(slide, record, 'caption', data.visual?.caption || data.caption, { x: .95, y: 6.05, w: 11.4, h: .48 }, { fontSize: 17, color: design.muted });
}
function decision(slide, record, data) {
  // Independent acceptance conditions are not a sequential process. The model
  // supplies their real wording; no yes/no branch or causal arrow is invented.
  const nodes = data.visual.nodes, top = bodyTop(data);
  const height = 3.95 / nodes.length;
  nodes.forEach((node, index) => {
    const y = top + index * height;
    text(slide, record, 'condition-label', node.label, { x: 7.0, y, w: 5.25, h: height - .12 }, { fontSize: 22, bold: true, color: design.accent });
    if (node.detail) text(slide, record, 'condition-detail', node.detail, { x: 1, y, w: 5.6, h: height - .12 }, { fontSize: 19 });
    if (index < nodes.length - 1) line(slide, .95, y + height - .1, 11.4, 'D7E1E4');
  });
}
function timeline(slide, record, data) {
  const items = data.visual?.items || (data.points || []).map(label => ({ label }));
  if (items.length < 2 || items.length > 5) throw new Error(`Slide ${record.slide}: timeline needs 2–5 source-backed milestones`);
  const top = bodyTop(data), width = 11.4 / items.length, y = top + 1.15;
  line(slide, .95 + width / 2, y, 11.4 - width, 'A7BBC4', 2);
  items.forEach((item, index) => {
    const x = .95 + (rtl ? items.length - 1 - index : index) * width;
    slide.addShape(deck.ShapeType.ellipse, { x: x + width / 2 - .09, y: y - .09, w: .18, h: .18, fill: { color: index === 0 ? design.secondary : design.accent }, line: { color: design.canvas, width: 1 } });
    const when = item.when || (item.start != null && item.end != null ? `${item.start}–${item.end}` : '');
    if (when) text(slide, record, 'milestone-time', when, { x: x + .08, y: top + .13, w: width - .16, h: .72 }, { fontSize: 22, bold: true, color: design.accent, align: 'center' });
    text(slide, record, 'milestone-label', item.label, { x: x + .08, y: y + .48, w: width - .16, h: 1.28 }, { fontSize: 21, bold: true, align: 'center' });
    if (item.detail) text(slide, record, 'milestone-detail', item.detail, { x: x + .08, y: y + 1.92, w: width - .16, h: 1.0 }, { fontSize: 17, color: design.muted, align: 'center' });
  });
}
function chart(slide, record, data) {
  const source = data.chart;
  const type = source.type === 'line' ? deck.ChartType.line : deck.ChartType.bar;
  const top = bodyTop(data);
  const series = source.series.map(s => ({ name: s.name, labels: source.categories, values: s.values }));
  const detailed = (data.points?.length || 0) > 1, height = detailed ? 2.3 : 3.45;
  const numberFormat = source.series.every(s => s.values.every(Number.isInteger)) ? '0' : '0.00';
  slide.addChart(type, series, { x: 1.05, y: top + .03, w: 11.1, h: height,
    catAxisLabelFontFace: design.font, catAxisLabelFontSize: 17, valAxisLabelFontFace: design.font, valAxisLabelFontSize: 14,
    showLegend: series.length > 1, legendFontFace: design.font, legendFontSize: 16,
    showTitle: false, showValue: true, dataLabelPosition: 'outEnd', dataLabelFormatCode: numberFormat, dataLabelColor: design.ink,
    dataLabelFormatCodeSourceLinked: false, dataLabelFontFace: design.font, dataLabelFontSize: 17,
    chartColors: [design.accent, design.secondary, '688A9E'], showBorder: false,
    showCatName: false, showCatNameLabel: false, showShadow: false,
    valAxisTitle: source.unit, showValAxisTitle: true, valAxisTitleFontFace: design.font, valAxisTitleFontSize: 15,
    valGridLine: { color: 'DFE7EB', width: .5 }, catAxisLineColor: 'C2D0D7', valAxisLineColor: 'C2D0D7',
    showCatName: false, showSerName: false, showPercent: false,
    barDir: source.type === 'bar' ? 'bar' : 'col', catAxisLabelRotate: 0,
    showMarker: source.type === 'line', showLine: true, showCatName: false,
  });
  record.objects.push({ role: 'chart', bbox: [1.05 * 72, (top + .03) * 72, 12.15 * 72, (top + .03 + height) * 72], data: source });
  if (detailed) {
    points(slide, record, data.points, { x: 1.05, y: 5.03, w: 11.1, h: 1.65 }, 18);
    return;
  }
  const takeaway = data.points?.[0] || data.caption;
  if (takeaway) text(slide, record, 'chart-takeaway', takeaway, { x: 1.05, y: 6.04, w: 11.1, h: .55 }, { fontSize: 20, bold: true, color: design.accent });
  // Details are still complete in speaker notes, not duplicated beside the chart.
}
function table(slide, record, data) {
  const top = bodyTop(data);
  const rows = data.table.map((row, index) => (rtl ? [...row].reverse() : row).map(value => ({ text: isolate(value), options: { bold: index === 0, color: index === 0 ? 'FFFFFF' : design.ink, fill: index === 0 ? design.ink : (index % 2 ? 'F1F5F6' : design.canvas) } })));
  slide.addTable(rows, { x: .95, y: top + .05, w: 11.4, h: 3.75, fontFace: design.font, fontSize: 20, rtlMode: rtl,
    color: design.ink, border: { color: 'DCE5E9', pt: .5 }, margin: [.13, .15, .13, .15],
    valign: 'middle', align: rtl ? 'right' : 'left', autoPage: false, rowH: 3.75 / rows.length });
  record.objects.push({ role: 'table', bbox: [.95 * 72, (top + .05) * 72, 12.35 * 72, (top + 3.8) * 72], rows: data.table });
  if (data.caption) text(slide, record, 'caption', data.caption, { x: .95, y: 6.5, w: 11.4, h: .3 }, { fontSize: 16, color: design.muted });
}
function image(slide, record, data) {
  const top = bodyTop(data);
  const [iw, ih] = data.image_size;
  const scale = Math.min(11.4 / iw, 3.9 / ih), w = iw * scale, h = ih * scale;
  slide.addImage({ path: data.image_path, x: .95 + (11.4 - w) / 2, y: top + (3.9 - h) / 2, w, h, objectName: 'Source figure' });
  record.objects.push({ role: 'image', bbox: [.95 * 72, top * 72, 12.35 * 72, (top + 3.9) * 72], image_id: data.image_id });
  if (data.caption) text(slide, record, 'caption', data.caption, { x: .95, y: 6.16, w: 11.4, h: .43 }, { fontSize: 16, color: design.muted });
}
function references(slide, record, data) {
    const top = bodyTop(data);
    let y = top + .15;
    for (const item of data.points || []) {
      const value = item.replace(/\*/g, ''), height = Math.max(.55, lines(value, 11.4, 20) * 20 / 72 * 1.22);
      if (y + height > 6.7) throw new Error(`Slide ${record.slide}: bibliography exceeds available space`);
      const latin = (value.match(/[A-Za-z]/g) || []).length > value.length / 3;
      text(slide, record, 'reference-entry', value, { x: .95, y, w: 11.4, h: height }, { fontSize: 20, rtlMode: latin ? false : rtl, align: latin ? 'left' : 'right', lang: latin ? 'en-US' : deck.lang });
      y += height + .2;
    }
}

for (let index = 0; index < slides.length; index++) {
  const data = slides[index];
  const slide = deck.addSlide();
  slide.background = { color: design.canvas };
  const record = { slide: index + 1, layout: data.layout, objects: [], citations: [], source_notes: data.source_notes };
  manifest.slides.push(record);
  const kind = data.layout;
  if (kind === 'title') cover(slide, record, data);
  else {
    heading(slide, record, data);
    if (data.section === 'references' && kind === 'statement') references(slide, record, data);
    else ({ statement, two_column: comparison, comparison, key_metric: metrics, process: processDiagram, timeline,
      decision, chart, table, image, closing: statement }[kind] || statement)(slide, record, data);
  }
  text(slide, record, 'page-number', String(index + 1), { x: 12.05, y: 6.98, w: .4, h: .27 }, { fontSize: 12, color: kind === 'title' && design.id !== 'visual-teaching' ? 'CFDFE5' : design.muted, align: 'right', rtlMode: false });
  slide.addNotes(data.speaker_notes);
}
await deck.writeFile({ fileName: target });
fs.writeFileSync(target.replace(/\.pptx$/i, '.layout.json'), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ slides: slides.length, style: design.id, renderer: manifest.renderer, target }));

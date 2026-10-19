import assert from 'node:assert/strict';
import test from 'node:test';
import {
  contentBoxPx,
  optionsFromFrontMatter,
  parseMargin,
  parsePageBreak,
  resolveSettings,
  splitFrontMatter,
} from '../src/options.js';

test('改ページする見出しは # の数でも数字でも書ける', () => {
  assert.deepEqual(parsePageBreak('#'), [1]);
  assert.deepEqual(parsePageBreak('# ## ###'), [1, 2, 3]);
  assert.deepEqual(parsePageBreak('1,2'), [1, 2]);
  assert.deepEqual(parsePageBreak('h2 h1'), [1, 2]);
  assert.deepEqual(parsePageBreak('none'), []);
  assert.throws(() => parsePageBreak('#######'));
  assert.deepEqual(resolveSettings({}, {}).pageBreak, [1]);
  assert.deepEqual(resolveSettings({ pageBreak: '# ##' }, {}).pageBreak, [1, 2]);
  assert.deepEqual(resolveSettings({ pageBreak: '# ##' }, { pageBreak: 'none' }).pageBreak, []);
});

test('余白は CSS の書き方で展開する', () => {
  assert.deepEqual(parseMargin('16mm'), {
    top: '16mm',
    right: '16mm',
    bottom: '16mm',
    left: '16mm',
  });
  assert.deepEqual(parseMargin('18mm 16mm'), {
    top: '18mm',
    right: '16mm',
    bottom: '18mm',
    left: '16mm',
  });
  assert.deepEqual(parseMargin('16mm 16mm 18mm 16mm'), {
    top: '16mm',
    right: '16mm',
    bottom: '18mm',
    left: '16mm',
  });
});

test('front matter だけを本文から外す', () => {
  const source = '---\ntitle: 要件\nformat: A3\nlandscape: true\n---\n# 本文\n';
  const { data, body } = splitFrontMatter(source);
  assert.equal(data.title, '要件');
  assert.equal(body, '# 本文\n');
  assert.deepEqual(optionsFromFrontMatter(data), {
    title: '要件',
    format: 'A3',
    landscape: true,
  });
});

test('先頭の水平線は front matter として消さない', () => {
  const { body } = splitFrontMatter('---\n\n# タイトル\n');
  assert.match(body, /^---/);
});

test('A4 の本文領域はページより余白の分だけ狭い', () => {
  const box = contentBoxPx({
    format: 'A4',
    margin: '16mm 16mm 18mm 16mm',
  });
  assert.ok(box.width > 640 && box.width < 690);
  assert.ok(box.height > 960 && box.height < 1020);
});

test('コマンドラインの用紙指定が front matter より優先される', () => {
  const settings = resolveSettings({ format: 'A3', title: '文書' }, { format: 'A5' });
  assert.equal(settings.format, 'A5');
  assert.equal(settings.title, '文書');
  assert.equal(settings.pageNumbers, true);
});

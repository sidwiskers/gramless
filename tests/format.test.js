import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  html,
  md,
  fmt,
  raw,
  RawString,
  escapeHtml,
  escapeMarkdown,
  escapeMarkdownV1,
} from '../src/format.js';

describe('gramless/format: Safe Entity Formatting & Templates', () => {
  describe('Escapers', () => {
    it('escapes HTML special characters correctly', () => {
      assert.equal(escapeHtml('Hello <World> & "Guests"'), 'Hello &lt;World&gt; &amp; &quot;Guests&quot;');
      assert.equal(escapeHtml(null), '');
      assert.equal(escapeHtml(undefined), '');
      assert.equal(escapeHtml(12345), '12345');
      assert.equal(escapeHtml('Normal text!'), 'Normal text!');
    });

    it('escapes MarkdownV2 reserved characters correctly', () => {
      const allReserved = '_ * [ ] ( ) ~ ` > # + - = | { } . ! \\';
      const escaped = escapeMarkdown(allReserved);
      assert.equal(escaped, '\\_ \\* \\[ \\] \\( \\) \\~ \\` \\> \\# \\+ \\- \\= \\| \\{ \\} \\. \\! \\\\');
      assert.equal(escapeMarkdown('user_name (VIP!)'), 'user\\_name \\(VIP\\!\\)');
      assert.equal(escapeMarkdown(null), '');
      assert.equal(escapeMarkdown(undefined), '');
      assert.equal(escapeMarkdown(42), '42');
    });

    it('escapes MarkdownV1 legacy reserved characters correctly', () => {
      assert.equal(escapeMarkdownV1('hello_world *bold* `code` [link]'), 'hello\\_world \\*bold\\* \\`code\\` \\[link]');
      assert.equal(escapeMarkdownV1(null), '');
    });
  });

  describe('Tagged Template Literal: html', () => {
    it('automatically escapes variables while preserving literal HTML tags', () => {
      const user = { name: '<Evil & Hacker>', id: 12345 };
      const output = html`<b>User:</b> ${user.name} (<code>${user.id}</code>)`;
      assert.equal(output, '<b>User:</b> &lt;Evil &amp; Hacker&gt; (<code>12345</code>)');
    });

    it('respects raw() strings without double escaping', () => {
      const rawHtml = raw('<i>Already Safe</i>');
      const output = html`Greeting: ${rawHtml}`;
      assert.equal(output, 'Greeting: <i>Already Safe</i>');
    });

    it('handles arrays of values cleanly', () => {
      const items = ['<Item 1>', '<Item 2>'];
      const output = html`Items: ${items}`;
      assert.equal(output, 'Items: &lt;Item 1&gt;&lt;Item 2&gt;');
    });
  });

  describe('Tagged Template Literal: md (MarkdownV2)', () => {
    it('automatically escapes variables in MarkdownV2 strings', () => {
      const username = 'cool_dev.123!';
      const output = md`*Welcome* _${username}_`;
      assert.equal(output, '*Welcome* _cool\\_dev\\.123\\!_');
    });

    it('respects raw() strings in md', () => {
      const rawMd = raw('*Pre-formatted*');
      const output = md`Prefix: ${rawMd}`;
      assert.equal(output, 'Prefix: *Pre-formatted*');
    });
  });

  describe('Fluent Formatters (fmt)', () => {
    it('generates safe bold, italic, underline, strike, spoiler, and code', () => {
      assert.equal(fmt.bold('A & B').toString(), '<b>A &amp; B</b>');
      assert.equal(fmt.italic('Italic <text>').toString(), '<i>Italic &lt;text&gt;</i>');
      assert.equal(fmt.underline('Underlined').toString(), '<u>Underlined</u>');
      assert.equal(fmt.strikethrough('Strike').toString(), '<s>Strike</s>');
      assert.equal(fmt.strike('Strike2').toString(), '<s>Strike2</s>');
      assert.equal(fmt.spoiler('Secret & Plot').toString(), '<tg-spoiler>Secret &amp; Plot</tg-spoiler>');
      assert.equal(fmt.code('const x = 1 < 2;').toString(), '<code>const x = 1 &lt; 2;</code>');
    });

    it('generates preformatted code blocks with and without language', () => {
      assert.equal(fmt.pre('console.log("hi");').toString(), '<pre>console.log(&quot;hi&quot;);</pre>');
      assert.equal(
        fmt.pre('const a = 1;', 'javascript').toString(),
        '<pre><code class="language-javascript">const a = 1;</code></pre>'
      );
    });

    it('generates link, mention, customEmoji, and blockquotes', () => {
      assert.equal(
        fmt.link('Click & Go', 'https://example.com?a=1&b=2').toString(),
        '<a href="https://example.com?a=1&amp;b=2">Click &amp; Go</a>'
      );
      assert.equal(
        fmt.mention('Alex <VIP>', 123456).toString(),
        '<a href="tg://user?id=123456">Alex &lt;VIP&gt;</a>'
      );
      assert.equal(
        fmt.customEmoji('👍', 'emoji_123').toString(),
        '<tg-emoji emoji-id="emoji_123">👍</tg-emoji>'
      );
      assert.equal(
        fmt.blockquote('A wise quote').toString(),
        '<blockquote>A wise quote</blockquote>'
      );
      assert.equal(
        fmt.blockquote('Long quote', true).toString(),
        '<blockquote expandable>Long quote</blockquote>'
      );
    });

    it('composes seamlessly inside html template tag without double escaping', () => {
      const name = 'Alice & Bob';
      const output = html`Hello ${fmt.bold(name)}!`;
      assert.equal(output, 'Hello <b>Alice &amp; Bob</b>!');
    });
  });
});
